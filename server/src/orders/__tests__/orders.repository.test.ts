import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { OrdersRepository } from "../orders.repository";
import { CheckoutReservationRepository } from "../checkout-reservation.repository";
import { buildOrderItemSnapshot, parseSpecificationsSnapshot } from "../orders.snapshot";

describe("pending checkout repositories", () => {
    it("selects guest contact fields for admin order summaries without token material", () => {
        poolQuery.mockClear();
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getOrders(callback);

        const [queryConfig] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("o.guest_email");
        expect(queryConfig.sql).toContain("o.guest_name");
        expect(queryConfig.sql).toContain("o.guest_phone");
        expect(queryConfig.sql).toContain("LEFT JOIN users u");
        expect(queryConfig.sql).not.toContain("guest_order_token_hash");
    });

    it("loads guest identity by order ID without exposing another user's order", () => {
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getGuestOrderIdentity(91, callback);

        const [queryConfig, queryParams, queryCallback] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("user_id IS NULL");
        expect(queryConfig.sql).toContain("guest_order_token_hash");
        expect(queryParams).toEqual([91]);
        expect(queryCallback).toBe(callback);
    });

    it("selects every guest identity field when loading a pending checkout by PayOS order code", () => {
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getPendingCheckoutByPayOSOrderCode(123456, callback);

        const [queryConfig, queryParams, queryCallback] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("guest_email");
        expect(queryConfig.sql).toContain("guest_name");
        expect(queryConfig.sql).toContain("guest_phone");
        expect(queryConfig.sql).toContain("guest_order_token_hash");
        expect(queryParams).toEqual([123456]);
        expect(queryCallback).toBe(callback);
    });

    it("rejects a raw guest token before it reaches pending checkout persistence", async () => {
        const query = vi.fn();
        const repository = new CheckoutReservationRepository();

        await expect(repository.insertPendingCheckout({ query } as never, {
            reservationToken: "reservation-token",
            userId: null,
            guestEmail: "guest@example.com",
            guestName: "Guest Buyer",
            guestPhone: null,
            guestOrderTokenHash: "raw-guest-token",
            cartJson: "[]",
            totalPrice: 10,
            discount: 0,
            shippingAddress: "1 Test Street",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        })).rejects.toThrow("Guest order token hash");

        expect(query).not.toHaveBeenCalled();
    });

    it("locks the complete transactional guest purchase product snapshot", async () => {
        const query = vi.fn().mockResolvedValue([]);
        const repository = new CheckoutReservationRepository();

        await repository.lockProductsForPurchase({ query } as never, [7, 9]);

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining("p.price, p.sale_price, p.stock"),
            [7, 9],
        );
        expect(query.mock.calls[0][0]).toContain("FOR UPDATE");
        expect(query.mock.calls[0][0]).toContain("p.stock >= 0");
    });
});

describe("admin order-item reporting", () => {
    it("excludes canceled orders from paginated sales rows and their count", () => {
        poolQuery.mockClear();
        const repository = new OrdersRepository({} as never);

        repository.getOrderItemsPaginated(25, 50, vi.fn());
        repository.getOrderItemsCount(vi.fn());

        expect(poolQuery.mock.calls[0][0].sql).toContain("o.status <> 2");
        expect(poolQuery.mock.calls[1][0].sql).toContain("o.status <> 2");
    });
});

describe("historical order snapshots", () => {
    it.each([
        [null, {}], [undefined, {}], ["", {}], [[], {}],
        [{ legacy: true }, { legacy: true }], ['{"legacy":true}', { legacy: true }],
        ["broken", { raw: "broken" }], ["[1]", { raw: "[1]" }], ["0", { raw: "0" }],
    ])("preserves specification mapping for %j", (input, expected) => {
        expect(parseSpecificationsSnapshot(input)).toEqual(expected);
    });

    it("preserves zero sale prices, nullable fields and fallback identity for either checkout", () => {
        expect(buildOrderItemSnapshot({ product_id: 7, quantity: 2, price: 100, sale_price: 0, specifications: "broken" })).toEqual({
            productId: 7, sku: "DIG-00000007", productName: "Product #7", image: null,
            unitPrice: 0, brand: "", category: "", warrantyMonths: null,
            specifications: { raw: "broken" }, quantity: 2,
        });
        expect(buildOrderItemSnapshot({ product_id: 7, quantity: 2, price: 100, sale_price: null }).unitPrice).toBe(100);
    });

    it("uses structured attributes instead of legacy JSON without mutating the product", () => {
        const product = { product_id: 7, sku: " WIDGET-7 ", product_name: "Widget", quantity: 2,
            price: 100, sale_price: 80, main_image: "widget.webp", warranty_months: 12,
            brand: "Acme", category: "Components", specifications: '{"legacy":true}' };
        expect(buildOrderItemSnapshot(product, [{ key: "capacity", label: "Capacity", type: "number", numberValue: 16, unit: "GB" }])).toEqual({
            productId: 7, sku: "WIDGET-7", productName: "Widget", image: "widget.webp", unitPrice: 80,
            brand: "Acme", category: "Components", warrantyMonths: 12, quantity: 2,
            specifications: { capacity: { label: "Capacity", type: "number", value: 16, unit: "GB", filterable: true } },
        });
        expect(product.specifications).toBe('{"legacy":true}');
    });
});

describe("transactional payment persistence", () => {
    it.each(["paid", "pending"])("writes an exact VND %s ledger on the supplied transaction", async (status) => {
        poolQuery.mockClear();
        const query = vi.fn().mockResolvedValue({ affectedRows: 1 });
        const repository = new OrdersRepository({} as never);
        await repository.insertPaymentLedgerInTransaction({ query } as never, {
            orderId: 42, provider: "payos", status, providerReference: "123", providerPaymentId: "link",
            quote: { baseAmount: 450000, baseCurrency: "VND", amount: 450000, currency: "VND", fxRate: 1 }, simulated: false,
        });
        expect(query.mock.calls[0][1]).toEqual([42, "payos", status, "123", "link", "order:42:payment", 450000, "VND", 450000, "VND", 1, 0]);
        expect(query.mock.calls[0][0]).toContain(status === "paid" ? "?, UTC_TIMESTAMP(), ?," : "?, NULL, ?,");
        expect(query.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP()");
        expect(poolQuery).not.toHaveBeenCalled();
    });

    it("requires the complete PayOS reference, link, amount and VND tuple", async () => {
        const order = { id: 42, date_added: "2026-09-06T01:00:00.000Z" };
        const query = vi.fn().mockResolvedValueOnce([order]).mockResolvedValueOnce([]);
        const repository = new OrdersRepository({} as never);
        await expect(repository.findPayOSOrderInTransaction({ query } as never, 123, "link", 450000)).resolves.toEqual(order);
        await expect(repository.findPayOSOrderInTransaction({ query } as never, 123, "wrong", 450001)).resolves.toBeNull();
        expect(query.mock.calls[0][1]).toEqual(["123", "link", 450000]);
        expect(query.mock.calls[0][0]).toContain("op.provider_payment_id = ? AND op.amount = ? AND op.currency = 'VND'");
        expect(query.mock.calls[0][0]).toContain("op.provider = 'payos' AND op.provider_reference = ?");
    });

    it("propagates ledger failures to the transaction owner", async () => {
        const failure = new Error("ledger unavailable");
        const query = vi.fn().mockRejectedValue(failure);
        await expect(new OrdersRepository({} as never).insertPaymentLedgerInTransaction({ query } as never, {
            orderId: 42, provider: "cash", status: "pending", providerReference: null, providerPaymentId: null,
            quote: { baseAmount: 10, baseCurrency: "VND", amount: 10, currency: "VND", fxRate: 1 }, simulated: true,
        })).rejects.toBe(failure);
    });
});

describe("transactional order lifecycle persistence", () => {
    const operations = [
        ["getOrderLifecycleForUpdate", [9], "SELECT user_id, status, delivered_at, inventory_restored_at FROM orders WHERE id = ? FOR UPDATE", [9]],
        ["getLatestPaymentForUpdate", [9], "SELECT id, provider, status, simulated FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [9]],
        ["getOrderItemsForUpdate", [9], "SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id FOR UPDATE", [9]],
        ["getRestockProductForUpdate", [4], "SELECT id, price, sale_price, stock FROM products WHERE id = ? FOR UPDATE", [4]],
        ["incrementProductStockInTransaction", [4, 2], "UPDATE products SET stock = stock + ? WHERE id = ?", [2, 4]],
        ["cancelOrderInTransaction", [9, "reason"], "WHERE id = ? AND status = 0", ["reason", 9]],
        ["ensureDeliveredAtInTransaction", [9], "UPDATE orders SET delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ?", [9]],
        ["completeOrderInTransaction", [9], "UPDATE orders SET status = 1, delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ? AND status = 0", [9]],
        ["confirmCashPaymentInTransaction", [8], "WHERE id = ? AND provider = 'cash' AND status = 'pending'", [8]],
    ] as const;

    it.each(operations)("%s keeps its locks, predicates and parameters on the caller transaction", async (method, args, sql, params) => {
        poolQuery.mockClear();
        const repository = new OrdersRepository({} as never);
        const invoke = repository[method] as (...values: unknown[]) => Promise<unknown>;
        const query = vi.fn().mockResolvedValue([]);
        await invoke.call(repository, { query }, ...args);
        expect(query).toHaveBeenCalledWith(expect.stringContaining(sql), params);
        expect(poolQuery).not.toHaveBeenCalled();
        const failure = new Error("write or lock failed");
        query.mockRejectedValueOnce(failure);
        await expect(invoke.call(repository, { query }, ...args)).rejects.toBe(failure);
    });

    it("returns null for missing singleton locks and preserves affectedRows for checked stock writes", async () => {
        const query = vi.fn().mockResolvedValue([]);
        const repository = new OrdersRepository({} as never);
        await expect(repository.getOrderLifecycleForUpdate({ query } as never, 9)).resolves.toBeNull();
        await expect(repository.getLatestPaymentForUpdate({ query } as never, 9)).resolves.toBeNull();
        await expect(repository.getRestockProductForUpdate({ query } as never, 4)).resolves.toBeNull();
        query.mockResolvedValue({ affectedRows: 0 });
        await expect(repository.incrementProductStockInTransaction({ query } as never, 4, 2)).resolves.toEqual({ affectedRows: 0 });
    });
});

describe("bulk cancellation product locks", () => {
    it("deduplicates and sorts product IDs before acquiring one lock query", async () => {
        const query = vi.fn().mockResolvedValue([{ id: 4, price: 100, sale_price: null, stock: 5 }, { id: 9, price: 200, sale_price: 10, stock: 3 }]);
        const repository = new OrdersRepository({} as never);
        await expect(repository.getRestockProductsForUpdate({ query } as never, [9, 4, 9])).resolves.toHaveLength(2);
        expect(query).toHaveBeenCalledWith(
            "SELECT id, price, sale_price, stock FROM products WHERE id IN (?, ?) ORDER BY id FOR UPDATE",
            [4, 9],
        );
    });

    it("does not query an empty list and propagates lock failures", async () => {
        const query = vi.fn().mockRejectedValue(new Error("lock failed"));
        const repository = new OrdersRepository({} as never);
        await expect(repository.getRestockProductsForUpdate({ query } as never, [])).resolves.toEqual([]);
        expect(query).not.toHaveBeenCalled();
        await expect(repository.getRestockProductsForUpdate({ query } as never, [4])).rejects.toThrow("lock failed");
    });
});
