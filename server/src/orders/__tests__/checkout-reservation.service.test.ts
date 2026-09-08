import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionRunner = vi.hoisted(() => vi.fn());

vi.mock("../../database/transaction", () => ({
    withTransaction: transactionRunner,
}));

import { CheckoutReservationService } from "../checkout-reservation.service";

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
            return await work({});
        } finally {
            release();
        }
    });
}

const reservationInput = (uid: string, quantity = 1, expiresAt = new Date(Date.now() + 35 * 60_000)) => ({
    uid,
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
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);

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

    it("persists a guest contact snapshot without assigning a user ID", async () => {
        const { repository } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);

        await service.reserveInventory({
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
                guestOrderTokenHash: "a".repeat(64),
            },
        });

        expect(repository.insertPendingCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            userId: null,
            guestEmail: "guest@example.com",
            guestName: "Guest Buyer",
            guestPhone: "+84123456789",
            guestOrderTokenHash: "a".repeat(64),
        }));
    });

    it("allows only one concurrent quantity-one reservation against stock one", async () => {
        const { repository } = createMockRepository();
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);

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
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);
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
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);
        const reservation = await service.reserveInventory(reservationInput("user-a"));

        await expect(service.releaseReservation(reservation.reservationToken, "stripe_session_creation_failed")).resolves.toBeUndefined();
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
        const service = new CheckoutReservationService(repository as never, promotionsRepository as never);

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
