import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionRunner = vi.hoisted(() => vi.fn());

vi.mock("../../database/transaction", () => ({
    withTransaction: transactionRunner,
}));

import { CheckoutReservationService } from "../checkout-reservation.service";
import { hashGuestOrderToken } from "../guest-order-token";
import { deliveryCheckout } from "../../shipping/__tests__/checkout-fixture";
const quoteService = { validateQuote: async (_tx: unknown, _checkout: unknown, _cart: unknown, subtotal: number, discount: number) => ({ pricing: { itemsSubtotal: subtotal, merchandiseDiscount: discount, shippingFee: 0, payableTotal: subtotal - discount }, delivery: {} }) };

type CheckoutState = {
    id: number;
    status: "PENDING" | "EXPIRED" | "RELEASED" | "CONSUMED";
    expiresAt: Date;
    reservationToken: string;
};

type ReservationState = {
    pendingCheckoutId: number;
    productId: number;
    quantity: number;
};

function createMockRepository() {
    const state = {
        stockByProductId: new Map<number, number>([
            [1, 1],
            [2, 2],
        ]),
        checkouts: [] as CheckoutState[],
        reservations: [] as ReservationState[],
        nextCheckoutId: 1,
    };

    const repository = {
        lockProducts: vi.fn(async (_tx: unknown, productIds: number[]) => productIds.map((id) => ({
            id,
            name: `Product ${id}`,
            price: 10,
            sale_price: null,
            stock: state.stockByProductId.get(id) ?? 0,
        }))),
        getActiveReservationQuantities: vi.fn(async (_tx: unknown, productIds: number[]) => {
            const now = Date.now();
            const activeCheckoutIds = new Set(
                state.checkouts
                    .filter((checkout) => checkout.status === "PENDING" && checkout.expiresAt.getTime() > now)
                    .map((checkout) => checkout.id),
            );
            const quantities = new Map<number, number>();
            for (const reservation of state.reservations) {
                if (!activeCheckoutIds.has(reservation.pendingCheckoutId) || !productIds.includes(reservation.productId)) continue;
                quantities.set(reservation.productId, (quantities.get(reservation.productId) ?? 0) + reservation.quantity);
            }
            return [...quantities.entries()].map(([product_id, reserved_quantity]) => ({ product_id, reserved_quantity }));
        }),
        insertPendingCheckout: vi.fn(async (_tx: unknown, input: { reservationToken: string; expiresAt: Date }) => {
            const id = state.nextCheckoutId++;
            state.checkouts.push({ id, status: "PENDING", expiresAt: input.expiresAt, reservationToken: input.reservationToken });
            return { insertId: id };
        }),
        insertInventoryReservations: vi.fn(async (_tx: unknown, pendingCheckoutId: number, items: Array<{ productId: number; quantity: number }>) => {
            state.reservations.push(...items.map((item) => ({ pendingCheckoutId, ...item })));
        }),
        assignPayOSAttempt: vi.fn(async () => 1),
        attachPaymentProviderByCheckoutId: vi.fn(async () => 1),
        releaseReservation: vi.fn(async (_tx: unknown, reservationToken: string, reason: string) => {
            void reason;
            const checkout = state.checkouts.find((candidate) => candidate.reservationToken === reservationToken);
            if (checkout?.status === "PENDING") checkout.status = "RELEASED";
        }),
        getPendingCheckoutByTokenForUpdate: vi.fn(async () => ({ id: 1, discount_id: null })),
        getAvailableQuantity: vi.fn(async (_tx: unknown, productId: number) => {
            const now = Date.now();
            const activeCheckoutIds = new Set(
                state.checkouts
                    .filter((checkout) => checkout.status === "PENDING" && checkout.expiresAt.getTime() > now)
                    .map((checkout) => checkout.id),
            );
            const reserved = state.reservations
                .filter((reservation) => reservation.productId === productId && activeCheckoutIds.has(reservation.pendingCheckoutId))
                .reduce((total, reservation) => total + reservation.quantity, 0);
            return Math.max((state.stockByProductId.get(productId) ?? 0) - reserved, 0);
        }),
    };

        return { repository, state };
}

const promotionsRepository = {
    reservePromotion: vi.fn(),
    releasePromotionReservation: vi.fn(),
};

function installSerializedTransactions() {
    let tail = Promise.resolve();
    transactionRunner.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await work({ query: vi.fn().mockResolvedValue({ affectedRows: 1 }) });
        } finally {
            release();
        }
    });
}

const reservationInput = (uid: string, quantity = 1, expiresAt = new Date(Date.now() + 35 * 60_000)) => ({
    uid,
    deliveryCheckout: { ...deliveryCheckout, quoteIdentity: { kind: "authenticated" as const, userId: uid } },
    authoritativeCart: [{ product_id: 1, product_name: "Product 1", price: 10, sale_price: null, quantity }],
    authoritativeTotalPrice: quantity * 10,
    discount: 0,
    shippingAddress: "1 Test Street",
    databaseExpiresAt: expiresAt,
});

describe("CheckoutReservationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installSerializedTransactions();
    });

    it("aggregates duplicate product IDs before locking and inserting reservations", async () => {
        const { repository, state } = createMockRepository();
        state.stockByProductId.set(1, 2);
        state.stockByProductId.set(2, 2);
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);

        const result = await service.reserveInventory({
            ...reservationInput("user-a", 1),
            authoritativeCart: [
                { product_id: 1, product_name: "Product 1", price: 10, sale_price: null, quantity: 1 },
                { product_id: 2, product_name: "Product 2", price: 10, sale_price: null, quantity: 1 },
                { product_id: 1, product_name: "Product 1", price: 10, sale_price: null, quantity: 1 },
            ],
            authoritativeTotalPrice: 30,
        });

        expect(repository.lockProducts).toHaveBeenCalledWith(expect.anything(), [1, 2]);
        expect(repository.insertPendingCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            userId: "user-a",
            totalPrice: 30,
            discount: 0,
            shippingAddress: "1 Test Street",
            cartJson: expect.any(String),
        }));
        expect(repository.insertInventoryReservations).toHaveBeenCalledWith(
            expect.anything(),
            1,
            [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }],
        );
        expect(result.items).toEqual([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }]);
        expect(result.pricingSnapshot).toEqual({ totalPrice: 30, discount: 0 });
        expect(result.shippingAddress).toBe("1 Test Street");
        expect(result.reservationToken).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it("persists the PayOS attempt and immutable order code in the reservation transaction", async () => {
        const { repository } = createMockRepository();
        const paymentAttempt = {
            id: "attempt-123",
            pendingCheckoutId: 1,
            providerOrderCode: "123456789",
            expectedAmountVnd: 10,
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            providerLinkId: null,
            providerLinkUrl: null,
            expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
            replayed: false,
        };
        const attempts = {
            findExistingClaim: vi.fn().mockResolvedValue(null),
            claim: vi.fn().mockResolvedValue(paymentAttempt),
        };
        const tasks = { enqueue: vi.fn().mockResolvedValue(44) };
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never, undefined, attempts as never, tasks as never);
        const transaction = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };
        transactionRunner.mockImplementationOnce(async (work: (tx: unknown) => Promise<unknown>) => work(transaction));

        const result = await service.reservePayOSInventory(reservationInput("user-a"), {
            owner: { kind: "authenticated", userId: "user-a" },
            idempotencyKey: "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba",
            request: { cart: [{ productId: 1, quantity: 1 }], totalPrice: 10 },
        });

        expect(attempts.findExistingClaim).toHaveBeenCalledWith(expect.objectContaining({ owner: { kind: "authenticated", userId: "user-a" } }), expect.anything());
        expect(attempts.claim).toHaveBeenCalledWith(expect.objectContaining({
            pendingCheckoutId: 1,
            expectedAmountVnd: 10,
            request: { cart: [{ productId: 1, quantity: 1 }], totalPrice: 10 },
        }), expect.anything());
        expect(repository.assignPayOSAttempt).toHaveBeenCalledWith(expect.anything(), 1, 123456789, 10);
        expect(tasks.enqueue).toHaveBeenCalledWith(transaction, expect.objectContaining({
            kind: "PAYOS_RECONCILE",
            key: "payos:attempt-123:0",
            payload: expect.objectContaining({ attemptId: "attempt-123", pendingCheckoutId: 1, generation: 0 }),
            dueAt: expect.any(Date),
        }));
        expect(result.paymentAttempt).toEqual(paymentAttempt);
    });

    it("holds loyalty points and includes the discount in the PayOS amount snapshot", async () => {
        const { repository } = createMockRepository();
        const paymentAttempt = {
            id: "attempt-loyalty",
            pendingCheckoutId: 1,
            providerOrderCode: "123456790",
            expectedAmountVnd: 7,
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            providerLinkId: null,
            providerLinkUrl: null,
            expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
            replayed: false,
        };
        const attempts = {
            findExistingClaim: vi.fn().mockResolvedValue(null),
            claim: vi.fn().mockResolvedValue(paymentAttempt),
        };
        const tasks = { enqueue: vi.fn().mockResolvedValue(44) };
        const loyalty = { holdCheckoutPoints: vi.fn().mockResolvedValue(3) };
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never,
            undefined, attempts as never, tasks as never, loyalty as never);

        const result = await service.reservePayOSInventory({
            ...reservationInput("user-a"),
            loyaltyPoints: 3,
        }, {
            owner: { kind: "authenticated", userId: "user-a" },
            idempotencyKey: "5df6e92a-a9b9-4f4b-a035-f948ea2028fb",
            request: { cart: [{ productId: 1, quantity: 1 }], totalPrice: 10, loyaltyPoints: 3 },
        });

        expect(repository.insertPendingCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ loyaltyPointsRedeemed: 3 }));
        expect(loyalty.holdCheckoutPoints).toHaveBeenCalledWith(expect.anything(), "user-a", 1, 3, 10, 0);
        expect(attempts.claim).toHaveBeenCalledWith(expect.objectContaining({
            expectedAmountVnd: 7,
            snapshot: expect.objectContaining({ discountVnd: 3 }),
        }), expect.anything());
        expect(result.pricingSnapshot).toEqual({ totalPrice: 10, discount: 3 });
    });

    it("releases a loyalty point hold with the checkout reservation", async () => {
        const { repository } = createMockRepository();
        const loyalty = { releaseCheckoutPoints: vi.fn().mockResolvedValue(true) };
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never,
            undefined, undefined, undefined, loyalty as never);
        const transaction = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };
        transactionRunner.mockImplementationOnce(async (work: (tx: unknown) => Promise<unknown>) => work(transaction));

        await service.releaseReservation("reservation-token", "customer-canceled");

        expect(loyalty.releaseCheckoutPoints).toHaveBeenCalledWith(transaction, 1);
    });

    it("rejects a PayOS reservation when the locked catalog price changed after quote creation", async () => {
        const { repository } = createMockRepository();
        repository.lockProducts.mockResolvedValueOnce([{ id: 1, name: "Product 1", price: 11, sale_price: null, stock: 1 }]);
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);

        await expect(service.reserveInventory(reservationInput("user-a"))).rejects.toThrow(/price changed/i);
        expect(repository.insertPendingCheckout).not.toHaveBeenCalled();
    });

    it("persists a guest contact snapshot without assigning a user ID", async () => {
        const { repository } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);

        await service.reserveInventory({
            deliveryCheckout: { ...deliveryCheckout, quoteIdentity: { kind: "guest", guestCartId: "11111111-1111-4111-8111-111111111111" } },
            authoritativeCart: [{ product_id: 1, product_name: "Product 1", price: 10, sale_price: null, quantity: 1 }],
            authoritativeTotalPrice: 10,
            discount: 0,
            shippingAddress: "1 Test Street",
            databaseExpiresAt: new Date(Date.now() + 35 * 60_000),
            identity: {
                kind: "guest",
                userId: null,
                guestContact: {
                    guestEmail: "guest@example.com",
                    guestName: "Guest Buyer",
                    guestPhone: "+84123456789",
                },
                guestOrderTokenHash: hashGuestOrderToken("guest-order-access-token"),
            },
        });

        expect(repository.insertPendingCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            userId: null,
            guestEmail: "guest@example.com",
            guestName: "Guest Buyer",
            guestPhone: "+84123456789",
            guestOrderTokenHash: hashGuestOrderToken("guest-order-access-token"),
        }));
    });

    it("allows only one concurrent quantity-one reservation against stock one", async () => {
        const { repository } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);

        const results = await Promise.allSettled([
            service.reserveInventory(reservationInput("user-a")),
            service.reserveInventory(reservationInput("user-b")),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected?.status === "rejected" && rejected.reason.statusCode).toBe(409);
    });

    it("does not subtract expired, released, or consumed reservations", async () => {
        const { repository, state } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);
        const expiresAt = new Date(Date.now() + 35 * 60_000);

        state.checkouts.push({ id: 1, status: "PENDING", expiresAt, reservationToken: "pending-token" });
        state.reservations.push({ pendingCheckoutId: 1, productId: 1, quantity: 1 });
        expect(await service.getAvailableQuantity(1)).toBe(0);

        state.checkouts[0].status = "EXPIRED";
        expect(await service.getAvailableQuantity(1)).toBe(1);
        state.checkouts[0].status = "RELEASED";
        expect(await service.getAvailableQuantity(1)).toBe(1);
        state.checkouts[0].status = "CONSUMED";
        expect(await service.getAvailableQuantity(1)).toBe(1);
    });

    it("releases a reservation idempotently", async () => {
        const { repository } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);
        const reservation = await service.reserveInventory(reservationInput("user-a"));

        await expect(service.releaseReservation(reservation.reservationToken, "provider_session_creation_failed")).resolves.toBeUndefined();
        await expect(service.releaseReservation(reservation.reservationToken, "repeated_delivery")).resolves.toBeUndefined();
        expect(repository.releaseReservation).toHaveBeenCalledTimes(2);
        expect(repository.releaseReservation).toHaveBeenLastCalledWith(
            expect.anything(),
            reservation.reservationToken,
            "repeated_delivery",
        );
    });

    it("reserves promotion quota in the same checkout transaction", async () => {
        const { repository } = createMockRepository();
        vi.mocked(promotionsRepository.reservePromotion).mockResolvedValue({
            discountId: 3,
            discount: 3,
            promotion: { id: 3, discount_code: "SAVE10", discount_percent: 10 },
        });
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never, quoteService as never);

        const result = await service.reserveInventory({
            ...reservationInput("user-promo"),
            discount: 99,
            discountCode: "SAVE10",
        });

        expect(promotionsRepository.reservePromotion).toHaveBeenCalledWith(
            expect.anything(),
            "SAVE10",
            1,
            "user-promo",
            expect.any(Date),
            10,
        );
        expect(result.pricingSnapshot.discount).toBe(3);
    });
});
