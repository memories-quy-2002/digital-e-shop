import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculatePricing, quoteFingerprint, assertQuoteMatches } from "../shipping-quote.policy";
import { ShippingQuoteService } from "../shipping-quote.service";
import { deliveryAddressSchema } from "../shipping.validator";

const { tx } = vi.hoisted(() => ({ tx: { query: vi.fn() } }));
vi.mock("../../database/transaction", () => ({ withTransaction: vi.fn((work) => work(tx)) }));

const internalAddress = {
    recipientName: "Test Buyer",
    recipientPhone: "0900000000",
    addressLine: "1 Test Street",
    city: "Ho Chi Minh City",
    country: "VN" as const,
    latitude: 10.7769,
    longitude: 106.7009,
};
const deliverySettings = {
    storeAddress: "Digital-E Store",
    storeLatitude: 10.78,
    storeLongitude: 106.7,
    fee5To20Vnd: 25000,
    feeOver20Vnd: 50000,
    routingEndpoint: "https://router.example.test",
    tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
    tileAttribution: "Map provider",
    version: 2,
};
const cart = [{ product_id: 7, quantity: 2, price: 100000, sale_price: null }] as never;

function buildQuoteService() {
    const quotes = new Map<string, Record<string, unknown>>();
    const repository = {
        saveQuote: vi.fn(async (_tx, input) => {
            quotes.set(input.id, {
                ...input,
                provider: "INTERNAL",
                owner_hash: input.ownerHash,
                origin_latitude: input.origin.latitude,
                origin_longitude: input.origin.longitude,
                destination_latitude: input.destination.latitude,
                destination_longitude: input.destination.longitude,
                distance_meters: input.distanceMeters,
                route_geometry: input.routeGeometry,
                settings_version: input.settingsVersion,
                expires_at: input.expiresAt,
                consumed_at: null,
            });
        }),
        findForUpdate: vi.fn(async (_tx, id) => quotes.get(id) ?? null),
        consume: vi.fn(async (_tx, id) => {
            const quote = quotes.get(id);
            if (quote) quotes.set(id, { ...quote, consumed_at: new Date() });
        }),
    };
    const settings = {
        get: vi.fn(async () => deliverySettings),
        getForQuote: vi.fn(async () => deliverySettings),
    };
    const routes = {
        getRoute: vi.fn(async () => ({
            distanceMeters: 5000,
            geometry: [[106.7, 10.78], [106.7009, 10.7769]],
        })),
    };
    const service = new ShippingQuoteService(repository as never, settings as never, routes as never);
    return { service, repository, settings, routes, quotes };
}

describe("internal delivery quote orchestration", () => {
    beforeEach(() => vi.clearAllMocks());

    it("requires a complete manually pinned Vietnam delivery address", () => {
        expect(deliveryAddressSchema.parse(internalAddress)).toEqual(internalAddress);
        expect(() => deliveryAddressSchema.parse({ ...internalAddress, longitude: 181 })).toThrow();
        expect(() => deliveryAddressSchema.parse({ ...internalAddress, latitude: undefined })).toThrow();
        expect(() => deliveryAddressSchema.parse({ ...internalAddress, provinceCode: "legacy" })).toThrow();
    });

    it("uses the configured road route and returns the matching band, map and settings snapshot", async () => {
        const { service, repository, routes } = buildQuoteService();
        const result = await service.createQuote({ kind: "guest", guestCartId: "guest-a" }, {
            address: internalAddress as never, cart, subtotal: 200000, discount: 10000,
        });

        expect(routes.getRoute).toHaveBeenCalledWith(
            { latitude: deliverySettings.storeLatitude, longitude: deliverySettings.storeLongitude },
            { latitude: internalAddress.latitude, longitude: internalAddress.longitude },
            deliverySettings.routingEndpoint,
        );
        expect(result).toMatchObject({
            address: internalAddress,
            origin: { latitude: deliverySettings.storeLatitude, longitude: deliverySettings.storeLongitude },
            destination: { latitude: internalAddress.latitude, longitude: internalAddress.longitude },
            distanceMeters: 5000,
            pricing: { itemsSubtotal: 200000, merchandiseDiscount: 10000, shippingFee: 25000, payableTotal: 215000 },
            settingsVersion: 2,
            tileUrl: deliverySettings.tileUrl,
            tileAttribution: deliverySettings.tileAttribution,
        });
        expect(repository.saveQuote).toHaveBeenCalledOnce();
    });

    it("binds the owner, address text, pin, cart facts and settings version into the saved fingerprint", async () => {
        const makeQuote = async (
            overrides: Record<string, unknown> = {},
            version = deliverySettings.version,
            identity = { kind: "guest" as const, guestCartId: "guest-a" },
        ) => {
            const { service, repository, settings } = buildQuoteService();
            const saved: Record<string, unknown>[] = [];
            repository.saveQuote.mockImplementation(async (_tx, input) => { saved.push(input); });
            settings.get.mockResolvedValue({ ...deliverySettings, version });
            settings.getForQuote.mockResolvedValue({ ...deliverySettings, version });
            const input = {
                address: internalAddress,
                cart,
                subtotal: 200000,
                discount: 10000,
                ...overrides,
            };
            await service.createQuote(identity, input as never);
            return saved[0].fingerprint;
        };

        const baseline = await makeQuote();
        expect(await makeQuote({ address: { ...internalAddress, addressLine: "2 Test Street" } })).not.toBe(baseline);
        expect(await makeQuote({ address: { ...internalAddress, latitude: 10.777 } })).not.toBe(baseline);
        expect(await makeQuote({ cart: [{ product_id: 7, quantity: 3, price: 100000, sale_price: null }] as never })).not.toBe(baseline);
        expect(await makeQuote({}, 3)).not.toBe(baseline);
        expect(await makeQuote({}, deliverySettings.version, { kind: "guest", guestCartId: "guest-b" })).not.toBe(baseline);
    });

    it("consumes an internal quote once and snapshots route, fee and destination", async () => {
        const { service, repository } = buildQuoteService();
        const identity = { kind: "guest" as const, guestCartId: "guest-a" };
        const quote = await service.createQuote(identity, { address: internalAddress as never, cart, subtotal: 200000, discount: 10000 });
        const result = await service.validateQuote(tx as never, {
            shippingQuoteId: quote.id,
            deliveryAddress: internalAddress as never,
            quoteIdentity: identity,
        }, cart, 200000, 10000);

        expect(result.pricing.payableTotal).toBe(215000);
        expect(result.delivery).toMatchObject({
            provider: "INTERNAL",
            quoteId: quote.id,
            distanceMeters: 5000,
            settingsVersion: 2,
            address: internalAddress,
            destination: { latitude: 10.7769, longitude: 106.7009 },
        });
        expect(repository.consume).toHaveBeenCalledWith(tx, quote.id);
    });

    it("rejects historical provider quotes and quotes created against outdated settings", async () => {
        const { service, repository, settings, quotes } = buildQuoteService();
        const identity = { kind: "guest" as const, guestCartId: "guest-a" };
        const quote = await service.createQuote(identity, { address: internalAddress as never, cart, subtotal: 200000, discount: 10000 });
        const quoteRow = quotes.get(quote.id)!;

        quotes.set(quote.id, { ...quoteRow, provider: "GHN" });
        await expect(service.validateQuote(tx as never, {
            shippingQuoteId: quote.id, deliveryAddress: internalAddress as never, quoteIdentity: identity,
        }, cart, 200000, 10000)).rejects.toThrow();

        quotes.set(quote.id, quoteRow);
        settings.getForQuote.mockResolvedValue({ ...deliverySettings, version: 3 });
        await expect(service.validateQuote(tx as never, {
            shippingQuoteId: quote.id, deliveryAddress: internalAddress as never, quoteIdentity: identity,
        }, cart, 200000, 10000)).rejects.toThrow();
        expect(repository.consume).not.toHaveBeenCalled();
    });

    it("does not create a quote when delivery settings or a road route are unavailable", async () => {
        const unconfigured = buildQuoteService();
        unconfigured.settings.get.mockResolvedValue(null);
        await expect(unconfigured.service.createQuote({ kind: "guest", guestCartId: "guest-a" }, {
            address: internalAddress as never, cart, subtotal: 200000, discount: 10000,
        })).rejects.toThrow();
        expect(unconfigured.routes.getRoute).not.toHaveBeenCalled();
        expect(unconfigured.repository.saveQuote).not.toHaveBeenCalled();

        const noRoute = buildQuoteService();
        noRoute.routes.getRoute.mockRejectedValue(new Error("route unavailable"));
        await expect(noRoute.service.createQuote({ kind: "guest", guestCartId: "guest-a" }, {
            address: internalAddress as never, cart, subtotal: 200000, discount: 10000,
        })).rejects.toThrow();
        expect(noRoute.repository.saveQuote).not.toHaveBeenCalled();
    });

    it("does not persist a route priced against settings changed during route calculation", async () => {
        const { service, repository, settings } = buildQuoteService();
        settings.getForQuote.mockResolvedValue({ ...deliverySettings, version: 3 });

        await expect(service.createQuote({ kind: "guest", guestCartId: "guest-a" }, {
            address: internalAddress as never, cart, subtotal: 200000, discount: 10000,
        })).rejects.toThrow(/settings changed/i);
        expect(repository.saveQuote).not.toHaveBeenCalled();
    });
});

describe("owner-bound delivery quotes", () => {
    it("discounts merchandise without discounting delivery", () => {
        expect(calculatePricing(9000000, 900000, 99000)).toEqual({ itemsSubtotal: 9000000, merchandiseDiscount: 900000, shippingFee: 99000, payableTotal: 8199000, currency: "VND" });
        expect(() => calculatePricing(10.5, 0, 1)).toThrow();
        expect(() => calculatePricing(Number.MAX_SAFE_INTEGER, 0, 1)).toThrow();
    });
    it("prices delivery separately from merchandise discounts", () => {
        expect(calculatePricing(200000, 10000, 25000)).toEqual({
            itemsSubtotal: 200000, merchandiseDiscount: 10000, shippingFee: 25000, payableTotal: 215000, currency: "VND",
        });
    });
    it("separates guest capability, signed-in identity, changed cart and address", () => {
        const base = { owner: { kind: "guest", guestCartId: "guest-a" }, cart: [{ id: 1, quantity: 1, price: 100 }], address: { ward: "1" } };
        const hash = quoteFingerprint(base);
        expect(hash).not.toBe(quoteFingerprint({ ...base, owner: { kind: "authenticated", userId: "guest-a" } }));
        expect(hash).not.toBe(quoteFingerprint({ ...base, cart: [{ id: 1, quantity: 2, price: 100 }] }));
        expect(hash).not.toBe(quoteFingerprint({ ...base, address: { ward: "2" } }));
    });
    it("rejects foreign, expired, consumed and repriced quotes", () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const row = { fingerprint: "mine", expiresAt: new Date(now.getTime() + 1), consumed: false };
        expect(() => assertQuoteMatches(row, "mine", now)).not.toThrow();
        expect(() => assertQuoteMatches(row, "foreign", now)).toThrow();
        expect(() => assertQuoteMatches(row, "mine", row.expiresAt)).toThrow();
        expect(() => assertQuoteMatches({ ...row, consumed: true }, "mine", now)).toThrow();
    });
});
