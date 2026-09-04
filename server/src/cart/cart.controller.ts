import { Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Put, UseGuards, UsePipes } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestCartService } from "./cart.service";

import { cartAddItemSchema, cartDeleteItemSchema, cartUpdateQuantitySchema } from "./cart.validator";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    const statusCode = err.statusCode || 500;
    const msg = err.statusCode ? err.message : fallbackMessage;
    return new HttpException({ msg }, statusCode);
}

@Controller("cart")
export class CartController {
    constructor(private readonly cartService: NestCartService) {}

    @Get(":uid")
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async getCartItems(@Param("uid") uid: string) {
        try {
            const cartItems = await this.cartService.getCartItems(uid);
            return { cartItems, msg: "Cart items retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Error retrieving cart items");
        }
    }

    @Get(":uid/validation")
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async validateCartForCheckout(@Param("uid") uid: string) {
        try {
            const result = await this.cartService.validateCartForCheckout(uid);
            return {
                msg: result.valid
                    ? "Cart is valid for checkout"
                    : "Some cart items are unavailable or exceed current stock",
                ...result,
            };
        } catch (err) {
            throw toHttpException(err as Error, "Error validating cart items");
        }
    }

    @Post()
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(cartAddItemSchema))
    async addItemToCart(@Body() body: { pid: number; uid: string; quantity: number }) {
        try {
            const { pid, uid, quantity } = body;
            const msg = await this.cartService.addItemToCart(pid, uid, quantity);
            return { msg };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: (err as Error).message }, 400);
            }
            throw toHttpException(err as Error, "Error adding item to cart");
        }
    }

    @Put()
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(cartUpdateQuantitySchema))
    async updateCartItemQuantity(@Body() body: { cartItemId: number; quantity: number; uid: string }) {
        try {
            const { cartItemId, quantity } = body;
            const msg = await this.cartService.updateCartItemQuantity(cartItemId, quantity);
            return { msg };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: (err as Error).message }, 400);
            }
            throw toHttpException(err as Error, "Error updating cart item");
        }
    }

    @Delete()
    @HttpCode(200)
    @UseGuards(AuthGuard)
    @UsePipes(new ZodValidationPipe(cartDeleteItemSchema))
    async deleteCartItem(@Body() body: { cartItemId: number }) {
        try {
            const { cartItemId } = body;
            const msg = await this.cartService.deleteCartItem(cartItemId);
            return { msg };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: (err as Error).message }, 400);
            }
            throw toHttpException(err as Error, "Error deleting cart item");
        }
    }
}
