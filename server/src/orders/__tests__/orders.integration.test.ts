import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

const prisma = require("#src/database/prisma/client");
import { OrdersController } from "../orders.controller";
import { OrdersRepository } from "../orders.repository";
import { NestOrdersService } from "../orders.service";
import { NestOrdersCancellationService } from "../orders-cancellation.service";
import { CheckoutReservationRepository } from "../checkout-reservation.repository";
import { PromotionsRepository } from "../../promotions/promotions.repository";
import { ProductAttributesRepository } from "../../products/product-attributes.repository";
import { ShippingRepository } from "../../shipping/shipping.repository";
import {
    cleanupTestData,
    closeIntegrationPools,
    createTestOrder,
    createTestProduct,

    createTestUser,
    integrationPool,
    integrationPrefix,
    type TestUser,
} from "../../database/__tests__/integration-database";

const customerRequest = (id: string) => ({ user: { id, role: "customer" } }) as never;

function buildOrdersService() {
    const orderTimelineService = {
        getTimeline: vi.fn().mockResolvedValue([]),
        recordTimelineEvent: vi.fn(),
        createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const inventoryService = {
        recordMovements: vi.fn(),
        createMovementsInTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const notificationsService = { notifyOrderPlaced: vi.fn(), notifyOrderStatus: vi.fn() };
    const repository = new OrdersRepository(new PromotionsRepository());
    const ordersService = new NestOrdersService(
        repository,
        orderTimelineService as never,
        {} as never,
        inventoryService as never,
        notificationsService as never,
        new CheckoutReservationRepository(),
        new PromotionsRepository(),
        new ProductAttributesRepository(),
        new NestOrdersCancellationService(repository, orderTimelineService as never, inventoryService as never),
        new ShippingRepository(),
    );

    return { ordersService, orderTimelineService, inventoryService, notificationsService };
}

describe("orders database integration", () => {
    let owner: TestUser;
    let attacker: TestUser;
    let ownedOrderId: number;

    beforeAll(async () => {
        owner = await createTestUser("owner");
        attacker = await createTestUser("attacker");
        ownedOrderId = await createTestOrder(owner.id);
    });

    afterAll(async () => {
        await cleanupTestData();
        await prisma.$disconnect();
        await closeIntegrationPools();
    });

    it("integration loads an order from MySQL but rejects another customer's request", async () => {
        const { ordersService } = buildOrdersService();
        const controller = new OrdersController(ordersService);

        const ownerResponse = await controller.getOrderDetail(String(ownedOrderId), customerRequest(owner.id));
        expect(ownerResponse.order.user_id).toBe(owner.id);

        const rejection = await controller
            .getOrderDetail(String(ownedOrderId), customerRequest(attacker.id))
            .catch((error) => error);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(404);
    });

    it("integration resolves a public UUID to the same order and preserves ownership", async () => {
        const { ordersService, orderTimelineService } = buildOrdersService();
        const controller = new OrdersController(ordersService);
        const numeric = await controller.getOrderDetail(String(ownedOrderId), customerRequest(owner.id));
        const publicId = numeric.order.public_id!;
        expect(publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const publicResponse = await controller.getOrderDetail(publicId, customerRequest(owner.id));
        expect(publicResponse.order).toMatchObject({ id: ownedOrderId, public_id: publicId, user_id: owner.id });
        expect(orderTimelineService.getTimeline).toHaveBeenCalledWith(ownedOrderId, expect.objectContaining({ id: ownedOrderId }));
        await expect(controller.getOrderDetail(publicId, customerRequest(attacker.id))).rejects.toMatchObject({ status: 404 });
    });

    it("integration rolls back a Prisma transaction instead of persisting partial data", async () => {
        const productName = `${integrationPrefix}-prisma-rollback`;

        await expect(
            prisma.$transaction(async (transaction) => {
                await transaction.$executeRaw`
                    INSERT INTO products
                        (name, description, category_id, brand_id, sku, price, sale_price, stock, main_image, specifications, created_at, updated_at)
                    VALUES (${productName}, ${"Prisma transaction test"}, ${1}, ${1}, ${`${integrationPrefix}-rollback`.slice(0, 64)}, ${10}, ${null}, ${1}, ${null}, ${null}, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                `;
                throw new Error("integration rollback");
            }),
        ).rejects.toThrow("integration rollback");

        const [rows] = await integrationPool.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM products WHERE name = ?",
            [productName],
        );
        expect(rows).toHaveLength(0);
    });

    it("integration excludes the paid checkout's expired hold but preserves other active inventory holds", async () => {
        const productId = await createTestProduct("payos-recovery-stock", 5);
        const addPendingCheckout = async (label: string, status: "PENDING" | "EXPIRED") => {
            const [result] = await integrationPool.execute<ResultSetHeader>(
                `INSERT INTO pending_checkouts
                    (reservation_token, user_id, cart_json, total_price, discount, shipping_address, status, expires_at)
                 VALUES (UUID(), ?, ?, 10, 0, 'Integration test address', ?, ?)` ,
                [owner.id, "[]", status, status === "PENDING" ? new Date(Date.now() + 60000) : new Date(Date.now() - 60000)],
            );
            const pendingCheckoutId = Number(result.insertId);
            await integrationPool.execute(
                "INSERT INTO inventory_reservations (pending_checkout_id, product_id, quantity) VALUES (?, ?, ?)",
                [pendingCheckoutId, productId, label === "paid" ? 2 : 3],
            );
            return pendingCheckoutId;
        };
        const ownExpiredCheckoutId = await addPendingCheckout("paid", "EXPIRED");
        await addPendingCheckout("other", "PENDING");
        const repository = new CheckoutReservationRepository();
        const tx = { query: async (sql: string, values: unknown[] = []) => {
            const [rows] = await integrationPool.execute(sql, values);
            return rows;
        } };

        await expect(repository.getAvailableQuantitiesForPaidCheckout(tx as never, ownExpiredCheckoutId, [productId]))
            .resolves.toEqual([{ productId, availableQuantity: 2 }]);
    });
});
