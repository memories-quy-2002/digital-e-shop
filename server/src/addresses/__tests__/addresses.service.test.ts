import { describe, expect, it, vi } from "vitest";
import { NestAddressesService } from "../addresses.service";

describe("NestAddressesService", () => {
    it("does not write retired carrier location codes from address input", async () => {
        const repository = {
            createAddress: vi.fn().mockResolvedValue({ insertId: 7 }),
        };
        const service = new NestAddressesService(repository as never);

        const result = await service.createAddress("customer-1", {
            addressLine: "12 Main Street",
            provinceCode: "202",
            provinceName: "Ho Chi Minh City",
            wardCode: "26734",
            wardName: "Ben Nghe Ward",
        } as never);

        const savedAddress = vi.mocked(repository.createAddress).mock.calls[0][1];
        expect(savedAddress).toMatchObject({ addressLine: "12 Main Street" });
        expect(savedAddress).not.toHaveProperty("provinceCode");
        expect(result).toMatchObject({ id: 7, addressLine: "12 Main Street" });
        expect(result).not.toHaveProperty("provinceCode");
    });

    it("preserves the optional delivery pin when saving and returning an address", async () => {
        const repository = { createAddress: vi.fn().mockResolvedValue({ insertId: 9 }) };
        const service = new NestAddressesService(repository as never);

        const result = await service.createAddress("customer-1", {
            addressLine: "12 Main Street",
            latitude: 10.7769,
            longitude: 106.7009,
        });

        expect(repository.createAddress).toHaveBeenCalledWith("customer-1", expect.objectContaining({
            latitude: 10.7769,
            longitude: 106.7009,
        }));
        expect(result).toMatchObject({ latitude: 10.7769, longitude: 106.7009 });
    });
});
