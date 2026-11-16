import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliverySettingsService } from "./delivery-settings.service";
import type { DeliverySettings } from "./delivery-settings.service";
import type { DeliverySettingsRepository } from "./delivery-settings.repository";

const { allowedRoutingEndpoints, allowedTileUrls } = vi.hoisted(() => ({
    allowedRoutingEndpoints: [
        "http://10.20.0.5:5000",
        "https://router.example.test",
        "https://api.geoapify.com/v1/routing",
        "https://user:secret@router.example.test",
    ],
    allowedTileUrls: [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png",
        "http://tiles.example.test/{z}/{x}/{y}.png",
    ],
}));

vi.mock("../database/transaction", () => ({
    withTransaction: vi.fn((work) => work({ query: vi.fn() })),
}));
vi.mock("../config/env.config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config/env.config")>();
    return {
        ...actual,
        env: {
            ...actual.env,
            deliveryRoutingEndpointAllowlist: allowedRoutingEndpoints,
            deliveryTileUrlAllowlist: allowedTileUrls,
            geoapifyApiKey: "server-test-key",
        },
    };
});

const validInput = (): Omit<DeliverySettings, "version"> => ({
    storeAddress: "Digital-E Store, Ho Chi Minh City",
    storeLatitude: 10.7769,
    storeLongitude: 106.7009,
    fee5To20Vnd: 25000,
    feeOver20Vnd: 50000,
    routingEndpoint: "https://api.geoapify.com/v1/routing",
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "© OpenStreetMap contributors",
});

describe("DeliverySettingsService", () => {
    let current: DeliverySettings | null;
    let version: number;
    let repository: DeliverySettingsRepository;
    let service: DeliverySettingsService;

    beforeEach(() => {
        current = null;
        version = 0;
        repository = {
            get: vi.fn(async () => current),
            lockCurrent: vi.fn(async () => ({ settings: current, version })),
            save: vi.fn(async (_tx, settings) => { current = settings; version = settings.version; }),
            recordAudit: vi.fn(async () => undefined),
        } as unknown as DeliverySettingsRepository;
        service = new DeliverySettingsService(repository);
    });

    it("returns null when delivery has not been configured", async () => {
        await expect(service.get()).resolves.toBeNull();
        await expect(service.getMapConfig()).resolves.toBeNull();
    });

    it("returns only normalized allowlisted endpoints for admin settings choices", async () => {
        await expect(service.getAdminConfig()).resolves.toEqual({
            settings: null,
            allowedRoutingEndpoints: ["https://api.geoapify.com/v1/routing"],
            allowedTileUrls: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        });
    });

    it("returns only the public map fields and enforces the tile allowlist", async () => {
        current = { ...validInput(), version: 2 };
        await expect(service.getMapConfig()).resolves.toEqual({
            storeAddress: current.storeAddress,
            origin: { latitude: current.storeLatitude, longitude: current.storeLongitude },
            tileUrl: current.tileUrl,
            tileAttribution: current.tileAttribution,
        });

        current = { ...current, tileUrl: "https://retired.example.test/{z}/{x}/{y}.png" };
        await expect(service.getMapConfig()).rejects.toThrow(/routing or map configuration/i);
    });

    it.each([
        [{ storeLatitude: 91 }],
        [{ storeLongitude: -181 }],
        [{ fee5To20Vnd: 25000, feeOver20Vnd: 25000 }],
        [{ fee5To20Vnd: 25000.5 }],
        [{ routingEndpoint: "https://user:secret@router.example.test" }],
        [{ routingEndpoint: "https://router.project-osrm.org" }],
        [{ tileUrl: "http://tiles.example.test/{z}/{x}/{y}.png" }],
        [{ tileUrl: "https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png" }],
        [{ tileUrl: "https://unlisted.example.test/{z}/{x}/{y}.png" }],
        [{ tileAttribution: "Map tiles" }],
    ])("rejects unusable delivery settings %j before persistence", async (overrides) => {
        await expect(service.update({ ...validInput(), ...overrides }, "admin-1")).rejects.toThrow();
        expect(repository.lockCurrent).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
    });

    it("allows only an explicitly configured Geoapify route endpoint", async () => {
        await expect(service.update(validInput(), "admin-1"))
            .resolves.toMatchObject({ routingEndpoint: "https://api.geoapify.com/v1/routing", version: 1 });
    });

    it("locks only fully configured and currently allowlisted settings for quote use", async () => {
        current = { ...validInput(), version: 1 };
        await expect(service.getForQuote({} as never)).resolves.toEqual(current);

        current = { ...current, tileUrl: "https://retired.example.test/{z}/{x}/{y}.png" };
        await expect(service.getForQuote({} as never)).rejects.toThrow(/routing or map configuration/i);
    });

    it("increments the settings version and audits the previous and new values", async () => {
        const first = await service.update(validInput(), "admin-1");
        const second = await service.update({ ...validInput(), fee5To20Vnd: 30000, feeOver20Vnd: 60000 }, "admin-2");

        expect(first.version).toBe(1);
        expect(second.version).toBe(2);
        expect(repository.recordAudit).toHaveBeenLastCalledWith(
            expect.anything(),
            "admin-2",
            expect.objectContaining({ version: 1, fee5To20Vnd: 25000 }),
            expect.objectContaining({ version: 2, fee5To20Vnd: 30000 }),
        );
    });
});
