import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards, UsePipes } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestWishlistService } from "./wishlist.service";

const {
    wishlistAddSchema,
    wishlistBulkDeleteSchema,
    wishlistDeleteSchema,
} = require("#src/modules/wishlist/wishlist.validator");

@Controller("wishlist")
@UseGuards(AuthGuard, RolesGuard)
export class WishlistController {
    constructor(private readonly wishlistService: NestWishlistService) {}

    @Get(":uid")
    @OwnerParam("uid")
    async getWishlist(@Param("uid") uid: string) {
        const results = await this.wishlistService.getWishlist(uid);
        return {
            msg: `Get wishlist with user_id = ${uid} successfully`,
            wishlist: results,
        };
    }

    @Post()
    @HttpCode(200)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(wishlistAddSchema))
    async addItemToWishlist(@Body() body: { uid: string; pid: number }) {
        const msg = await this.wishlistService.addItemToWishlist(body.uid, body.pid);
        return { msg };
    }

    @Delete()
    @HttpCode(200)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(wishlistBulkDeleteSchema))
    async deleteWishlistItems(@Body() body: { uid: string; productIds: number[] }) {
        const msg = await this.wishlistService.deleteWishlistItems(body.uid, body.productIds);
        return { msg };
    }

    @Delete(":pid")
    @HttpCode(200)
    @OwnerParam("uid")
    async deleteWishlistItem(@Param("pid") pid: string, @Body("uid") uid: string) {
        const payload = new ZodValidationPipe(wishlistDeleteSchema).transform({ uid, pid });
        const msg = await this.wishlistService.deleteWishlistItem(payload.uid, payload.pid);
        return { msg };
    }
}
