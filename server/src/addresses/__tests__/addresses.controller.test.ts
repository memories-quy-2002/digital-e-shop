import { describe, expect, it, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { HttpException } from "@nestjs/common";
import { AddressesModule } from "../addresses.module";
import { AddressesController } from "../addresses.controller";
import { NestAddressesService } from "../addresses.service";
import { AuthModule } from "../../auth/auth.module";
import { NestAuthService } from "../../auth/auth.service";
import { UsersRepository } from "../../users/users.repository";

vi.mock("#src/config/database.config", () => ({
    default: { query: vi.fn() },
}));

describe("AddressesController", () => {
    let controller: AddressesController;
    let service: NestAddressesService;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AddressesModule, AuthModule],
        })
            .overrideProvider(NestAuthService)
            .useValue({ verifySessionToken: vi.fn().mockResolvedValue({ valid: true }) })
            .overrideProvider(UsersRepository)
            .useValue({ findById: vi.fn() })
            .compile();

        controller = moduleRef.get(AddressesController);
        service = moduleRef.get(NestAddressesService);
    });

    it("module compiles with the guards, pipes, and rate-limit middleware wired without error", () => {
        expect(controller).toBeDefined();
    });

    it("getAddresses returns the existing controller's response shape", async () => {
        vi.spyOn(service, "getAddresses").mockResolvedValue([{ id: 1 }] as never);

        const result = await controller.getAddresses("42");

        expect(service.getAddresses).toHaveBeenCalledWith("42");
        expect(result).toEqual({ addresses: [{ id: 1 }], msg: "Addresses retrieved successfully" });
    });

    it("createAddress delegates to the service and returns { address, msg }", async () => {
        vi.spyOn(service, "createAddress").mockResolvedValue({ id: 1, user_id: "42" } as never);

        const result = await controller.createAddress("42", { addressLine: "1 Main St" });

        expect(service.createAddress).toHaveBeenCalledWith("42", { addressLine: "1 Main St" });
        expect(result).toEqual({ address: { id: 1, user_id: "42" }, msg: "Address created successfully" });
    });

    it("updateAddress surfaces the service's statusCode/message as an HttpException with { msg }", async () => {
        vi.spyOn(service, "updateAddress").mockRejectedValue(Object.assign(new Error("Address not found"), { statusCode: 404 }));

        await expect(controller.updateAddress("42", "5", { addressLine: "1 Main St" })).rejects.toMatchObject({
            status: 404,
            response: { msg: "Address not found" },
        });
    });

    it("deleteAddress falls back to a generic 500 message when the error has no statusCode", async () => {
        vi.spyOn(service, "deleteAddress").mockRejectedValue(new Error("boom"));

        const rejection = await controller.deleteAddress("42", "5").catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(500);
        expect(rejection.getResponse()).toEqual({ msg: "Unable to delete address" });
    });
});
