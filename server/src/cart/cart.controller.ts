import { Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Put, Req, Res, UseGuards, UsePipes } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestCartService } from "./cart.service";

import { cartAddItemSchema, cartDeleteItemSchema, cartUpdateQuantitySchema, guestCartClearSchema, guestCartPreviewSchema, guestCartSyncSchema } from "./cart.validator";
import type { GuestCartPreviewInput, GuestCartSyncInput } from "./cart.types";
import { createGuestCartId, GUEST_CART_COOKIE, GUEST_CART_TTL_DAYS, isGuestCartId } from "./guest-cart";
import { isProduction } from "#src/config/env.config";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    if (err instanceof HttpException) return err;
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : err.message || fallbackMessage;
    return createHttpException(err, { msg }, statusCode);
}

@Controller("cart")
export class CartController {
    constructor(private readonly cartService: NestCartService) {}

    private setGuestCartCookie(response: Response, guestCartId: string) {
        response.cookie(GUEST_CART_COOKIE, guestCartId, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000,
            path: "/",
        });
    }

    private resolveGuestCartId(request: Request, response: Response) {
        const current = request.cookies?.[GUEST_CART_COOKIE];
        if (isGuestCartId(current)) return current;
        const guestCartId = createGuestCartId();
        this.setGuestCartCookie(response, guestCartId);
        return guestCartId;
    }

    @Get("guest")
    @HttpCode(HTTP_STATUS.OK)
    async getGuestCart(@Req() request: Request) {
        try {
            const guestCartId = request.cookies?.[GUEST_CART_COOKIE];
            const items = isGuestCartId(guestCartId) ? await this.cartService.getGuestCart(guestCartId) : [];
            return { items, msg: "Guest cart retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Error retrieving guest cart");
        }
    }

    @Post("guest/sync")
    @HttpCode(HTTP_STATUS.OK)
    @UsePipes(new ZodValidationPipe(guestCartSyncSchema))
    async syncGuestCart(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: GuestCartSyncInput,
    ) {
        try {
            const guestCartId = this.resolveGuestCartId(request, response);
            const items = await this.cartService.syncGuestCart(guestCartId, body.items);
            return { items, msg: "Guest cart synchronized successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Error synchronizing guest cart");
        }
    }

    @Post("guest/clear")
    @HttpCode(HTTP_STATUS.OK)
    @UsePipes(new ZodValidationPipe(guestCartClearSchema))
    async clearGuestCart(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: { converted?: boolean },
    ) {
        try {
            const guestCartId = request.cookies?.[GUEST_CART_COOKIE];
            if (isGuestCartId(guestCartId)) {
                await this.cartService.clearGuestCart(guestCartId, body.converted === true);
            }
            if (body.converted === true) {
                response.clearCookie(GUEST_CART_COOKIE, {
                    path: "/",
                    secure: isProduction,
                    sameSite: isProduction ? "none" : "lax",
                });
            }
            return { msg: "Guest cart cleared successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Error clearing guest cart");
        }
    }

    @Post("guest/preview")
    @HttpCode(HTTP_STATUS.OK)
    @UsePipes(new ZodValidationPipe(guestCartPreviewSchema))
    async previewGuestCart(@Body() body: GuestCartPreviewInput) {
        try {
            const result = await this.cartService.previewGuestCart(body.items, body.discountCode);
            return {
                msg: result.valid ? "Guest cart preview retrieved successfully" : "Guest cart requires attention",
                ...result,
            };
        } catch (err) {
            throw toHttpException(err as Error, "Error previewing guest cart");
        }
    }

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
    @HttpCode(HTTP_STATUS.OK)
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
                throw new HttpException({ msg: (err as Error).message }, HTTP_STATUS.BAD_REQUEST);
            }
            throw toHttpException(err as Error, "Error adding item to cart");
        }
    }

    @Put()
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(cartUpdateQuantitySchema))
    async updateCartItemQuantity(@Body() body: { cartItemId: number; quantity: number; uid: string }) {
        try {
            const { cartItemId, quantity } = body;
            const msg = await this.cartService.updateCartItemQuantity(cartItemId, body.uid, quantity);
            return { msg };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: (err as Error).message }, HTTP_STATUS.BAD_REQUEST);
            }
            throw toHttpException(err as Error, "Error updating cart item");
        }
    }

    @Delete()
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    @UsePipes(new ZodValidationPipe(cartDeleteItemSchema))
    async deleteCartItem(@Body() body: { cartItemId: number; uid: string }) {
        try {
            const { cartItemId, uid } = body;
            const msg = await this.cartService.deleteCartItem(cartItemId, uid);
            return { msg };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: (err as Error).message }, HTTP_STATUS.BAD_REQUEST);
            }
            throw toHttpException(err as Error, "Error deleting cart item");
        }
    }
}
