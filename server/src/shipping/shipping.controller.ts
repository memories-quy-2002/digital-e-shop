import { Body, Controller, Get, Post, Req, UseGuards, ForbiddenException, ConflictException } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../guards/auth.guard";
import { NestCartService } from "../cart/cart.service";
import { GUEST_CART_COOKIE, isGuestCartId } from "../cart/guest-cart";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { deliveryAddressSchema } from "./shipping.validator";
import { ShippingQuoteService } from "./shipping-quote.service";
import { DeliverySettingsService } from "./delivery-settings.service";

const quoteInput = z.object({ address: deliveryAddressSchema, discountCode: z.string().max(50).optional(), locale: z.enum(["en", "vi"]).optional() });
const guestQuoteInput = quoteInput.extend({ cart: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99) })).min(1).max(50) });

@Controller("shipping")
export class ShippingController {
    constructor(private readonly quotes: ShippingQuoteService, private readonly cart: NestCartService, private readonly deliverySettings: DeliverySettingsService) {}
    @Get("delivery/map-config") async deliveryMapConfig() { return { map: await this.deliverySettings.getMapConfig() }; }
    @Post("quotes") @UseGuards(AuthGuard)
    async create(@Req() req: Request, @Body(new ZodValidationPipe(quoteInput)) body: z.infer<typeof quoteInput>) {
        const userId = String(req.user?.id || "");
        const validation = await this.cart.validateCartForCheckout(userId);
        if (validation.issues.length || !validation.cartItems.length) throw new ConflictException("Update cart before requesting delivery");
        const preview = await this.cart.previewGuestCart(validation.cartItems.map((item) => ({ productId: Number(item.product_id), quantity: Number(item.quantity) })), body.discountCode, userId);
        if (body.discountCode && !preview.promotion.valid) throw new ConflictException("Promotion is unavailable");
        return this.quotes.createQuote({ kind: "authenticated", userId }, { ...body, cart: preview.cartItems, subtotal: preview.merchandiseTotal, discount: preview.promotion.discount });
    }
    @Post("guest/quotes")
    async guest(@Req() req: Request, @Body(new ZodValidationPipe(guestQuoteInput)) body: z.infer<typeof guestQuoteInput>) {
        const guestCartId = req.cookies?.[GUEST_CART_COOKIE];
        if (req.cookies?.accessToken || !isGuestCartId(guestCartId)) throw new ForbiddenException("Refresh your cart identity before requesting delivery");
        const preview = await this.cart.previewGuestCart(body.cart, body.discountCode);
        if (preview.issues.length || (body.discountCode && !preview.promotion.valid)) throw new ConflictException("Update cart before requesting delivery");
        return this.quotes.createQuote({ kind: "guest", guestCartId }, { ...body, cart: preview.cartItems, subtotal: preview.merchandiseTotal, discount: preview.promotion.discount });
    }
}
