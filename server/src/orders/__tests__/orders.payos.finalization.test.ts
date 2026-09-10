import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));
vi.mock("#src/config/env.config", () => ({ env: { payosUsdToVndRate: 25_000, storeCurrency: "VND" } }));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../orders.repository", () => ({ OrdersRepository: class {} }));
vi.mock("../orders.timeline.service", () => ({ NestOrderTimelineService: class {} }));
vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../inventory/inventory.service", () => ({ NestInventoryService: class {} }));
vi.mock("../../notifications/notifications.service", () => ({ NestNotificationsService: class {} }));
vi.mock("../checkout-reservation.repository", () => ({ CheckoutReservationRepository: class {} }));

import { NestOrdersService } from "../orders.service";

function buildService(status: string = "PENDING") {
    const tx = { query: vi.fn() };
    const reservationRepository = {
        getPendingCheckoutByProviderOrderCodeForUpdate: vi.fn().mockResolvedValue({
            id: 7,
            payment_provider: "payos",
            provider_reference: "link-123",
            provider_order_code: "1757450400007",
            payment_amount: "450000.00",
            payment_currency: "VND",
            payment_fx_rate: "25000.000000",
            reservation_token: "reservation-token",
            user_id: "user-1",
            guest_email: null,
            guest_name: null,
            guest_phone: null,
            guest_order_token_hash: null,
            cart_json: JSON.stringify([{ product_id: 4, quantity: 2, price: 10, product_name: "Widget" }]),
            total_price: "20.00",
            discount: "2.00",
            shipping_address: "123 Main St",
            status,
            expires_at: "2099-09-06T01:30:00.000Z",
            created_at: "2026-09-06T01:00:00.000Z",
            consumed_at: status === "CONSUMED" ? "2026-09-06T01:10:00.000Z" : null,
        }),
        getReservationItems: vi.fn().mockResolvedValue([{ productId: 4, quantity: 2 }]),
        lockProducts: vi.fn().mockResolvedValue([{ id: 4, name: "Widget", stock: 5 }]),
        consumeReservation: vi.fn().mockResolvedValue(1),
    };
    const inventoryService = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
    const productAttributesRepository = { getForProducts: vi.fn().mockResolvedValue(new Map()) };
    const timelineService = { createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined) };
    const notificationsService = { notifyOrderPlaced: vi.fn() };
    const emailService = { sendOrderConfirmation: vi.fn().mockResolvedValue(undefined) };
    const usersRepository = { findById: vi.fn().mockResolvedValue({ id: "user-1", email: "customer@example.com", username: "Customer" }) };
    const paymentProviderService = { createPayment: vi.fn().mockResolvedValue({ providerReference: "1757450400007", status: "pending", simulated: false }) };

    tx.query.mockImplementation(async (sql: string) => {
        if (sql.includes("JOIN order_payments")) return [];
        if (sql.startsWith("INSERT INTO orders")) return { insertId: 42 };
        if (sql.startsWith("UPDATE products")) return { affectedRows: 1 };
        if (sql.includes("FROM orders WHERE id")) return [{ id: 42, date_added: "2026-09-06T01:00:00.000Z" }];
        return [];
    });
    withTransaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));

    const service = new NestOrdersService(
        {} as never,
        timelineService as never,
        {} as never,
        inventoryService as never,
        notificationsService as never,
        reservationRepository as never,
        {} as never,
        productAttributesRepository as never,
        paymentProviderService as never,
        emailService as never,
        usersRepository as never,
    );

    return { service, tx, reservationRepository, inventoryService, notificationsService, emailService, paymentProviderService };
}

describe("PayOS reserved checkout finalization", () => {
    beforeEach(() => vi.clearAllMocks());

    it("validates the VND quote, creates the order once, and records the PayOS ledger", async () => {
        const { service, tx, reservationRepository, inventoryService, paymentProviderService } = buildService();

        await expect(service.finalizePayOSCheckout(1_757_450_400_007, "link-123", 450_000)).resolves.toEqual({
            id: 42,
            date_added: "2026-09-06T01:00:00.000Z",
        });

        expect(paymentProviderService.createPayment).toHaveBeenCalledWith(expect.objectContaining({
            provider: "payos",
            amount: 450_000,
            currency: "VND",
            providerPaymentId: "link-123",
            providerReference: "1757450400007",
        }));
        const paymentInsert = tx.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO order_payments"));
        expect(paymentInsert).toEqual(expect.arrayContaining([
            expect.stringContaining("INSERT INTO order_payments"),
            expect.arrayContaining(["payos", "paid", "1757450400007", "link-123", 450_000, "VND"]),
        ]));
        const orderInsert = tx.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO orders"));
        expect(orderInsert?.[0]).toContain("payment_method, currency, date_added");
        expect(orderInsert?.[0]).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())");
        expect(orderInsert?.[1]).toEqual(expect.arrayContaining(["payos", "VND"]));
        expect(reservationRepository.consumeReservation).toHaveBeenCalledWith(tx, 7);
        expect(inventoryService.createMovementsInTransaction).toHaveBeenCalledTimes(1);
    });

    it("rejects an amount mismatch without consuming inventory", async () => {
        const { service, reservationRepository, inventoryService } = buildService();

        await expect(service.finalizePayOSCheckout(1_757_450_400_007, "link-123", 450_001))
            .rejects.toMatchObject({ statusCode: 409 });
        expect(reservationRepository.consumeReservation).not.toHaveBeenCalled();
        expect(inventoryService.createMovementsInTransaction).not.toHaveBeenCalled();
    });

    it("rejects a webhook from a different PayOS payment link", async () => {
        const { service, reservationRepository, inventoryService } = buildService();

        await expect(service.finalizePayOSCheckout(1_757_450_400_007, "different-link", 450_000))
            .rejects.toMatchObject({ statusCode: 409 });
        expect(reservationRepository.consumeReservation).not.toHaveBeenCalled();
        expect(inventoryService.createMovementsInTransaction).not.toHaveBeenCalled();
    });

    it("treats a duplicate webhook as idempotent after the order already exists", async () => {
        const { service, tx, reservationRepository, inventoryService } = buildService("CONSUMED");
        tx.query.mockImplementation(async (sql: string) => {
            if (sql.includes("JOIN order_payments")) return [{ id: 42, date_added: "2026-09-06T01:00:00.000Z" }];
            return [];
        });

        await expect(service.finalizePayOSCheckout(1_757_450_400_007, "link-123", 450_000)).resolves.toEqual({
            id: 42,
            date_added: "2026-09-06T01:00:00.000Z",
        });
        expect(reservationRepository.consumeReservation).not.toHaveBeenCalled();
        expect(inventoryService.createMovementsInTransaction).not.toHaveBeenCalled();
    });
});
