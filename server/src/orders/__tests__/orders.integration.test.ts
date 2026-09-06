import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";

const prisma = require("#src/database/prisma/client");
import { OrdersController } from "../orders.controller";
import { OrdersRepository } from "../orders.repository";
import { NestOrdersService } from "../orders.service";
import { NestOrdersStripeService } from "../orders.stripe.service";
import { CheckoutReservationRepository } from "../checkout-reservation.repository";
import { PromotionsRepository } from "../../promotions/promotions.repository";
import {
    cleanupTestData,
    closeIntegrationPools,
    createTestOrder,
    createTestPendingCheckout,
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
    };
    const inventoryService = {
        recordMovements: vi.fn(),
        createMovementsInTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const notificationsService = { notifyOrderPlaced: vi.fn(), notifyOrderStatus: vi.fn() };
    const ordersService = new NestOrdersService(
        new OrdersRepository(new PromotionsRepository()),
        orderTimelineService as never,
        {} as never,
        inventoryService as never,
        notificationsService as never,
        new CheckoutReservationRepository(),
        new PromotionsRepository(),
    );

    return { ordersService, orderTimelineService, inventoryService, notificationsService };
}

describe("orders database integration", () => {
    let owner: TestUser;
    let attacker: TestUser;
    let productId: number;
    let ownedOrderId: number;

    beforeAll(async () => {
        owner = await createTestUser("owner");
        attacker = await createTestUser("attacker");
        productId = await createTestProduct("orders", 10);
        ownedOrderId = await createTestOrder(owner.id);
    });

    afterAll(async () => {
        await cleanupTestData();
        await prisma.$disconnect();
        await closeIntegrationPools();
    });

    it("integration loads an order from MySQL but rejects another customer's request", async () => {
        const { ordersService } = buildOrdersService();
        const controller = new OrdersController(ordersService, {} as never);

        const ownerResponse = await controller.getOrderDetail(String(ownedOrderId), customerRequest(owner.id));
        expect(ownerResponse.order.user_id).toBe(owner.id);

        const rejection = await controller
            .getOrderDetail(String(ownedOrderId), customerRequest(attacker.id))
            .catch((error) => error);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(404);
    });

    it("integration handles a repeated checkout event without creating a second order", async () => {
        const { ordersService } = buildOrdersService();
        const stripeService = new NestOrdersStripeService(
            {} as never,
            ordersService,
            {} as never,
            {} as never,
        );
        const sessionId = `${integrationPrefix}-checkout`;
        const cart = [{ product_id: productId, product_name: "Integration product", price: 10, quantity: 1 }];

        await createTestPendingCheckout(owner.id, sessionId, cart);
        await stripeService.handleCheckoutSessionCompleted({ id: sessionId, payment_intent: `${sessionId}-payment` });
        await stripeService.handleCheckoutSessionCompleted({ id: sessionId, payment_intent: `${sessionId}-payment` });

        const [orders] = await integrationPool.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM orders WHERE stripe_checkout_session_id = ?",
            [sessionId],
        );
        expect(orders).toHaveLength(1);

        const [pending] = await integrationPool.execute<Array<RowDataPacket & { consumed_at: Date | string | null }>>(
            "SELECT consumed_at FROM pending_checkouts WHERE stripe_session_id = ?",
            [sessionId],
        );
        expect(pending).toHaveLength(1);
        expect(pending[0].consumed_at).not.toBeNull();
    });

    it("integration keeps immutable order-item snapshots after a catalog edit", async () => {
        const snapshotProductId = await createTestProduct("snapshot", 10);
        const sessionId = `${integrationPrefix}-snapshot-checkout`;
        const snapshotSku = `${integrationPrefix}-snapshot`.slice(0, 64);
        const cart = [{
            product_id: snapshotProductId,
            product_name: "Original GPU Name",
            sku: snapshotSku,
            brand: "Original Brand",
            category: "Original Category",
            price: 499.99,
            sale_price: null,
            main_image: "original-gpu.jpg",
            warranty_months: 24,
            specifications: JSON.stringify({ chipset: "Original chipset" }),
            quantity: 1,
        }];

        await integrationPool.execute(
            "UPDATE products SET sku = ?, name = ?, price = ?, main_image = ?, warranty_months = ? WHERE id = ?",
            [snapshotSku, "Original GPU Name", 499.99, "original-gpu.jpg", 24, snapshotProductId],
        );
        await createTestPendingCheckout(owner.id, sessionId, cart, 499.99);

        const { ordersService } = buildOrdersService();
        const stripeService = new NestOrdersStripeService(
            {} as never,
            ordersService,
            {} as never,
            {} as never,
        );
        await stripeService.handleCheckoutSessionCompleted({ id: sessionId, payment_intent: `${sessionId}-payment` });

        await integrationPool.execute(
            "UPDATE products SET name = ?, price = ?, main_image = ?, warranty_months = ? WHERE id = ?",
            [`${integrationPrefix}-updated GPU Name`, 799.99, "updated-gpu.jpg", 12, snapshotProductId],
        );

        const [orderRows] = await integrationPool.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM orders WHERE stripe_checkout_session_id = ?",
            [sessionId],
        );
        const response = await ordersService.getOrderDetail(Number(orderRows[0].id));

        expect(response?.items[0]).toMatchObject({
            productName: "Original GPU Name",
            sku: snapshotSku,
            price: 499.99,
            warrantyMonths: 24,
            main_image: "original-gpu.jpg",
        });
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
});
