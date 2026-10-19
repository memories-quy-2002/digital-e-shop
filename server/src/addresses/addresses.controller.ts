import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestAddressesService } from "./addresses.service";

import { addressLocationSchema, addressSchema } from "./addresses.validator";

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
            throw mapToHttpException(err, "Unable to load addresses");
        }
    }

    @Post()
    async createAddress(@Param("id") id: string, @Body(new ZodValidationPipe(addressSchema)) body: unknown) {
        try {
            const address = await this.addressesService.createAddress(id, body);
            return { address, msg: "Address created successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to save address");
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
            throw mapToHttpException(err, "Unable to update address");
        }
    }

    @Patch(":addressId/location")
    async updateAddressLocation(@Param("id") id: string, @Param("addressId") addressId: string, @Body(new ZodValidationPipe(addressLocationSchema)) body: { latitude: number; longitude: number }) {
        try {
            const address = await this.addressesService.updateAddressLocation(id, addressId, body.latitude, body.longitude);
            return { address, msg: "Address location updated successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to update address location");
        }
    }

    @Delete(":addressId")
    async deleteAddress(@Param("id") id: string, @Param("addressId") addressId: string) {
        try {
            const address = await this.addressesService.deleteAddress(id, addressId);
            return { address, msg: "Address deleted successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to delete address");
        }
    }
}
