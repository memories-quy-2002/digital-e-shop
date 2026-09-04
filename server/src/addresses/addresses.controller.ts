import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestAddressesService } from "./addresses.service";

import { addressSchema } from "./addresses.validator";

// Mirrors the existing addresses.controller.ts catch blocks: on error it
// returns { msg } with the error's own statusCode (defaulting to 500 with a
// generic message), not the AllExceptionsFilter's default { error } shape.
function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    const statusCode = err.statusCode || 500;
    const msg = err.statusCode ? err.message : fallbackMessage;
    return new HttpException({ msg }, statusCode);
}

@Controller(["users/:id/addresses", "user/:id/addresses"])
@UseGuards(AuthGuard, RolesGuard)
@OwnerParam("id")
export class AddressesController {
    constructor(private readonly addressesService: NestAddressesService) {}

    @Get()
    async getAddresses(@Param("id") id: string) {
        try {
            const addresses = await this.addressesService.getAddresses(id);
            return { addresses, msg: "Addresses retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to load addresses");
        }
    }

    @Post()
    async createAddress(@Param("id") id: string, @Body(new ZodValidationPipe(addressSchema)) body: unknown) {
        try {
            const address = await this.addressesService.createAddress(id, body);
            return { address, msg: "Address created successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to save address");
        }
    }

    @Put(":addressId")
    async updateAddress(
        @Param("id") id: string,
        @Param("addressId") addressId: string,
        @Body(new ZodValidationPipe(addressSchema)) body: unknown,
    ) {
        try {
            const address = await this.addressesService.updateAddress(id, addressId, body);
            return { address, msg: "Address updated successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to update address");
        }
    }

    @Delete(":addressId")
    async deleteAddress(@Param("id") id: string, @Param("addressId") addressId: string) {
        try {
            const address = await this.addressesService.deleteAddress(id, addressId);
            return { address, msg: "Address deleted successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to delete address");
        }
    }
}
