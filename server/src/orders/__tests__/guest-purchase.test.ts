import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionRunner = vi.hoisted(() => vi.fn());

vi.mock("../../database/transaction", () => ({ withTransaction: transactionRunner }));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../orders.repository", () => ({ OrdersRepository: class {} }));
vi.mock("../orders.timeline.service", () => ({ NestOrderTimelineService: class {} }));
vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../inventory/inventory.service", () => ({ NestInventoryService: class {} }));
vi.mock("../../notifications/notifications.service", () => ({ NestNotificationsService: class {} }));
vi.mock("../checkout-reservation.repository", () => ({ CheckoutReservationRepository: class {} }));

import { OrdersController } from "../orders.controller";
import { NestOrdersService } from "../orders.service";
import { guestOrderLookupSchema, guestPurchaseSchema } from "../orders.validator";
import { hashGuestOrderToken } from "../guest-order-token";

const guestPayload = () => ({
    cart: [{ productId: 7, quantity: 2 }],
    contact: {
        email: "buyer@example.com",
        name: "Buyer Name",
        phone: " +84123456789 ",
    },
    shipping: {
        address: "123 ABC Street",
        city: "Ho Chi Minh City",
        country: "Vietnam",
    },
    paymentMethod: "cash" as const,
});

function buildController() {
    const ordersService = {
        makeGuestPurchase: vi.fn(),
        lookupGuestOrder: vi.fn(),
    } as unknown as NestOrdersService;
    return { controller: new OrdersController(ordersService, {} as never), ordersService };
}

function buildService() {
    const tx = { query: vi.fn() };
    const cartService = { previewGuestCart: vi.fn() };
    const ordersRepository = { getGuestOrderIdentity: vi.fn() };
    const checkoutReservations = {
        lockProducts: vi.fn(),
        lockProductsForPurchase: vi.fn().mockResolvedValue([{
            id: 7,
            name: "Widget",
            sku: "WIDGET-7",
            warranty_months: 12,
            brand: "Acme",
            category: "Components",
            price: 10,
            sale_price: 8,
            stock: 5,
            main_image: null,
            specifications: null,
        }]),
        getActiveReservationQuantities: vi.fn().mockResolvedValue([]),
    };
    const timeline = { createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined), getTimeline: vi.fn().mockResolvedValue([]) };
    const inventory = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
    const notifications = { notifyOrderPlaced: vi.fn() };
    const productAttributes = { getForProducts: vi.fn().mockResolvedValue(new Map()) };
    const promotions = { consumePromotion: vi.fn() };

    tx.query.mockImplementation(async (sql: string) => {
        if (sql.startsWith("INSERT INTO orders")) return { insertId: 91 };
        if (sql.includes("SELECT id, name, stock FROM products")) return [{ id: 7, name: "Widget", stock: 5 }];
        if (sql.startsWith("UPDATE products")) return { affectedRows: 1 };
        if (sql.includes("SELECT id, DATE_FORMAT(date_added")) return [{ id: 91, date_added: "2026-09-08T00:00:00.000Z" }];
        return [];
    });
    transactionRunner.mockImplementation(async (work: (tx: typeof tx) => Promise<unknown>) => work(tx));

    const service = new NestOrdersService(
        ordersRepository as never,
        timeline as never,
        cartService as never,
        inventory as never,
        notifications as never,
        checkoutReservations as never,
        promotions as never,
        productAttributes as never,
    );

    return { service, tx, cartService, checkoutReservations, ordersRepository, timeline, inventory, notifications, promotions };
}

describe("guest checkout contracts", () => {
    beforeEach(() => vi.clearAllMocks());

    it("requires structured contact and shipping and rejects trusted checkout amounts or identities", () => {
        const parsed = guestPurchaseSchema.safeParse({
            ...guestPayload(),
            totalPrice: 1,
            discount: 1,
            userId: "should-not-be-accepted",
        });
        expect(parsed.success).toBe(false);
        expect(guestPurchaseSchema.safeParse({
            ...guestPayload(),
            cart: [{ productId: 7, quantity: 1, price: 0.01 }],
        }).success).toBe(false);

        expect(guestPurchaseSchema.safeParse({
            ...guestPayload(),
            contact: { ...guestPayload().contact, email: "not-an-email" },
        }).success).toBe(false);
        expect(guestPurchaseSchema.safeParse({
            ...guestPayload(),
            paymentMethod: "stripe",
        }).success).toBe(false);
        expect(guestPurchaseSchema.safeParse({
            ...guestPayload(),
            cart: [{ productId: 7, quantity: 60 }, { productId: 7, quantity: 40 }],
        }).success).toBe(false);
    });

    it("normalizes guest contact values and requires a strict safe lookup order ID", () => {
        const parsed = guestPurchaseSchema.parse(guestPayload());
        expect(parsed.contact.phone).toBe("+84123456789");
        expect(guestPurchaseSchema.parse({
            ...guestPayload(),
            contact: { ...guestPayload().contact, email: " Buyer@EXAMPLE.com " },
        }).contact.email).toBe("buyer@example.com");
        expect(guestPurchaseSchema.safeParse({
            ...guestPayload(),
            contact: { ...guestPayload().contact, email: `${"a".repeat(245)}@example.com` },
        }).success).toBe(false);
        expect(guestOrderLookupSchema.safeParse({ orderId: 91 }).success).toBe(false);
        expect(guestOrderLookupSchema.safeParse({ orderId: "91", guestOrderToken: "raw-token" }).success).toBe(false);
        expect(guestOrderLookupSchema.safeParse({ orderId: Number.MAX_SAFE_INTEGER + 1, guestOrderToken: "raw-token" }).success).toBe(false);
        expect(guestOrderLookupSchema.safeParse({ orderId: 91, guestOrderToken: "raw-token" }).success).toBe(true);
    });
});

describe("guest purchase controller", () => {
    it("returns the raw access token exactly in the successful creation response", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.makeGuestPurchase).mockResolvedValue({
            order: { id: 91, date_added: "2026-09-08T00:00:00.000Z" },
            guestOrderToken: "raw-token-once",
        } as never);

        const response = await controller.makeGuestPurchase(guestPayload());

        expect(response).toEqual(expect.objectContaining({
            orderId: 91,
            guestOrderToken: "raw-token-once",
            paymentMethod: "cash",
        }));
        expect(ordersService.makeGuestPurchase).toHaveBeenCalledWith(expect.objectContaining({
            cart: [{ productId: 7, quantity: 2 }],
        }));
    });

    it("returns only a guest-safe order after the service verifies both lookup values", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.lookupGuestOrder).mockResolvedValue({
            id: 91,
            guest_email: "buyer@example.com",
            items: [],
        } as never);

        const response = await controller.lookupGuestOrder({ orderId: 91, guestOrderToken: "raw-token" });

        expect(response).toEqual({
            order: expect.objectContaining({ id: 91 }),
            msg: "Guest order retrieved successfully",
        });
        expect(ordersService.lookupGuestOrder).toHaveBeenCalledWith(91, "raw-token");
    });
});

describe("guest purchase transaction", () => {
    it.each(["cash", "bank_transfer", "payos"] as const)(
        "creates a nullable-identity %s order from authoritative cart data without notifying a guest",
        async (paymentMethod) => {
            const { service, tx, cartService, notifications, timeline, inventory } = buildService();
            vi.mocked(cartService.previewGuestCart).mockResolvedValue({
                valid: true,
                cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: 8, stock: 5, quantity: 2 }],
                issues: [],
                merchandiseTotal: 16,
                promotion: { code: null, valid: true, discount: 0, discountPercent: null },
                totalPrice: 16,
            });

            const result = await service.makeGuestPurchase({ ...guestPayload(), paymentMethod });

            expect(result.order.id).toBe(91);
            expect(result.guestOrderToken).toEqual(expect.any(String));
            const orderInsert = tx.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO orders"));
            expect(orderInsert?.[1]?.[4]).toBe(hashGuestOrderToken(result.guestOrderToken));
            expect(orderInsert?.[1]?.[4]).not.toBe(result.guestOrderToken);
            expect(tx.query).toHaveBeenCalledWith(
                expect.stringContaining("guest_order_token_hash"),
                expect.arrayContaining([null, "buyer@example.com", "Buyer Name", "+84123456789", expect.any(String)]),
            );
            expect(tx.query).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE products SET stock"),
                [2, 7, 2],
            );
            expect(timeline.createTimelineEventInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: null }));
            expect(inventory.createMovementsInTransaction).toHaveBeenCalled();
            expect(notifications.notifyOrderPlaced).not.toHaveBeenCalled();
            if (paymentMethod === "payos") {
                expect(tx.query).toHaveBeenCalledWith(
                    expect.stringContaining("INSERT INTO order_payments"),
                    expect.arrayContaining([400000, "VND", 25000]),
                );
            }
        },
    );

    it("passes a server-derived coupon amount and null user ID into transactional redemption", async () => {
        const { service, cartService, checkoutReservations, promotions } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: true,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: null, stock: 5, quantity: 1 }],
            issues: [],
            merchandiseTotal: 10,
            promotion: { code: "SAVE10", valid: true, discount: 1, discountPercent: 10 },
            totalPrice: 9,
        });
        vi.mocked(checkoutReservations.lockProductsForPurchase).mockResolvedValue([{
            id: 7,
            name: "Widget",
            sku: "WIDGET-7",
            warranty_months: 12,
            brand: "Acme",
            category: "Components",
            price: 10,
            sale_price: null,
            stock: 5,
            main_image: null,
            specifications: null,
        }] as never);
        vi.mocked(promotions.consumePromotion).mockResolvedValue({ discount: 1, discountId: 3, promotion: { id: 3, discount_code: "SAVE10", discount_percent: 10 } });

        await service.makeGuestPurchase({ ...guestPayload(), cart: [{ productId: 7, quantity: 1 }], discountCode: "SAVE10" });

        expect(promotions.consumePromotion).toHaveBeenCalledWith(expect.anything(), "SAVE10", null, expect.any(Number), 10);
    });

    it("rejects a coupon that the authoritative preview marks invalid before opening an order transaction", async () => {
        const { service, tx, cartService } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: false,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: 8, stock: 5, quantity: 1 }],
            issues: [],
            merchandiseTotal: 8,
            promotion: {
                code: "EXPIRED",
                valid: false,
                discount: 0,
                discountPercent: null,
                message: "Discount code is no longer valid.",
            },
            totalPrice: 8,
        });

        await expect(service.makeGuestPurchase({ ...guestPayload(), discountCode: "EXPIRED" })).rejects.toMatchObject({
            statusCode: 400,
            message: "Discount code is no longer valid.",
        });
        expect(tx.query).not.toHaveBeenCalled();
    });

    it("does not persist an order when authoritative stock or promotion validation fails", async () => {
        const { service, tx, cartService } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: false,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: null, stock: 0, quantity: 1 }],
            issues: [{ cartItemId: 0, productId: 7, productName: "Widget", requestedQuantity: 1, availableStock: 0, reason: "out_of_stock" }],
            merchandiseTotal: 10,
            promotion: { code: null, valid: true, discount: 0, discountPercent: null },
            totalPrice: 10,
        });

        await expect(service.makeGuestPurchase(guestPayload())).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO orders"), expect.anything());
    });

    it("rolls back the shared transaction when stock changes after the authoritative preview", async () => {
        const { service, tx, cartService } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: true,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: 8, stock: 5, quantity: 1 }],
            issues: [],
            merchandiseTotal: 8,
            promotion: { code: null, valid: true, discount: 0, discountPercent: null },
            totalPrice: 8,
        });
        tx.query.mockImplementation(async (sql: string) => {
            if (sql.startsWith("INSERT INTO orders")) return { insertId: 92 };
            if (sql.includes("SELECT id, name, stock FROM products")) return [{ id: 7, name: "Widget", stock: 5 }];
            if (sql.startsWith("UPDATE products")) return { affectedRows: 0 };
            return [];
        });

        await expect(service.makeGuestPurchase(guestPayload())).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO orders"), expect.anything());
        expect(tx.query).toHaveBeenCalledWith(
            "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
            [1, 7, 1],
        );
    });

    it("rejects a stale guest price quote before writing an order", async () => {
        const { service, tx, cartService, checkoutReservations } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: true,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: 8, stock: 5, quantity: 2 }],
            issues: [],
            merchandiseTotal: 16,
            promotion: { code: null, valid: true, discount: 0, discountPercent: null },
            totalPrice: 16,
        });
        vi.mocked(checkoutReservations.lockProductsForPurchase).mockResolvedValue([{
            id: 7,
            name: "Widget",
            sku: "WIDGET-7",
            warranty_months: 12,
            brand: "Acme",
            category: "Components",
            price: 10,
            sale_price: 9,
            stock: 5,
            main_image: null,
            specifications: null,
        }] as never);

        await expect(service.makeGuestPurchase(guestPayload())).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO orders"), expect.anything());
    });

    it("rejects guest checkout when active reservations consume the available stock", async () => {
        const { service, tx, cartService, checkoutReservations } = buildService();
        vi.mocked(cartService.previewGuestCart).mockResolvedValue({
            valid: true,
            cartItems: [{ product_id: 7, product_name: "Widget", price: 10, sale_price: 8, stock: 5, quantity: 2 }],
            issues: [],
            merchandiseTotal: 16,
            promotion: { code: null, valid: true, discount: 0, discountPercent: null },
            totalPrice: 16,
        });
        vi.mocked(checkoutReservations.getActiveReservationQuantities).mockResolvedValue([
            { product_id: 7, reserved_quantity: 4 },
        ]);

        await expect(service.makeGuestPurchase(guestPayload())).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO orders"), expect.anything());
    });

    it("requires the matching raw token for a guest order and strips internal fields from the lookup DTO", async () => {
        const { service, ordersRepository } = buildService();
        vi.mocked(ordersRepository.getGuestOrderIdentity).mockImplementation((_id, callback) => callback(null, [{
            id: 91,
            user_id: null,
            guest_email: "buyer@example.com",
            guest_name: "Buyer Name",
            guest_phone: "+84123456789",
            guest_order_token_hash: hashGuestOrderToken("raw-token"),
        }]));
        vi.spyOn(service, "getOrderDetail").mockResolvedValue({
            id: 91,
            user_id: null,
            guest_email: "buyer@example.com",
            guest_name: "Buyer Name",
            guest_phone: "+84123456789",
            status: 0,
            total_price: 16,
            discount: 0,
            items: [{ id: 4, productId: 7, productName: "Widget", price: 8, sale_price: null, stock: 3, quantity: 2, totalPrice: 16, internal_secret: "must-not-leak" }],
            admin_notes: "private",
        } as never);

        await expect(service.lookupGuestOrder("91" as never, "raw-token")).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.lookupGuestOrder(Number.MAX_SAFE_INTEGER + 1, "raw-token")).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.lookupGuestOrder(91, "wrong-token")).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.lookupGuestOrder(91, "raw-token")).resolves.toEqual(expect.objectContaining({
            id: 91,
            guest_email: "buyer@example.com",
        }));
        const safe = await service.lookupGuestOrder(91, "raw-token");
        expect(safe).not.toHaveProperty("user_id");
        expect(safe).not.toHaveProperty("guest_order_token_hash");
        expect(safe).not.toHaveProperty("admin_notes");
        expect(safe.items[0]).not.toHaveProperty("id");
        expect(safe.items[0]).not.toHaveProperty("internal_secret");
    });
});
