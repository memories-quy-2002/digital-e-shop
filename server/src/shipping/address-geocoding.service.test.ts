import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressGeocodingService } from "./address-geocoding.service";

describe("AddressGeocodingService", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("returns bounded Vietnam address suggestions with validated coordinates", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                features: [
                    { properties: { name: "12 Nguyen Hue", city: "Ho Chi Minh City", country: "Vietnam" }, geometry: { coordinates: [106.7, 10.77] } },
                    { properties: { city: "Ho Chi Minh City" }, geometry: { coordinates: [999, 10.7] } },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const service = new AddressGeocodingService("https://photon.example/api/");

        const suggestions = await service.find({ addressLine: "12 Nguyen Hue", city: "Ho Chi Minh City", locale: "vi" });

        expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("q")).toBe("12 Nguyen Hue, Ho Chi Minh City, Vietnam");
        expect(suggestions).toEqual([{ label: "12 Nguyen Hue, Ho Chi Minh City, Vietnam", city: "Ho Chi Minh City", state: undefined, latitude: 10.77, longitude: 106.7 }]);
    });

    it("geocodes a single address field and returns a usable locality", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ features: [{ properties: { name: "46 HT35 Street", locality: "Ho Chi Minh City" }, geometry: { coordinates: [106.62, 10.84] } }] }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const service = new AddressGeocodingService("https://photon.example/api/");

        const suggestions = await service.find({ addressLine: "46 HT35 Street, Ho Chi Minh City", locale: "vi" });

        expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("q")).toBe("46 HT35 Street, Ho Chi Minh City, Vietnam");
        expect(suggestions[0]).toMatchObject({ city: "Ho Chi Minh City", latitude: 10.84, longitude: 106.62 });
    });

    it("does not contact a provider when geocoding is not configured", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const service = new AddressGeocodingService("");

        await expect(service.find({ addressLine: "12 Nguyen Hue", city: "HCMC", locale: "en" })).rejects.toMatchObject({ status: 503 });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
