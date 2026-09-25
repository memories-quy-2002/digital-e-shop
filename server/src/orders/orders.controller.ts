import { Body, Controller, Get, HttpCode, HttpException, Optional, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, Roles, RolesGuard } from "../guards/roles.guard";
import { RequireVerifiedEmail, VerifiedEmailGuard } from "../guards/verified-email.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestOrdersService } from "./orders.service";
import { NestOrdersPayOSService } from "./orders.payos.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import { calculatePromotionDiscount } from "./orders.pricing";
import { PAYMENT_PROVIDER, type PaymentProviderName } from "../payments/payment.types";
import type { GuestOrderLookupPayload, GuestPurchasePayload, GuestPayOSCheckoutPayload, GuestPayOSOrderLookupPayload, MockPayOSConfirmPayload } from "./orders.dto";
import { orderStatusSchema, purchaseSchema, checkoutSessionSchema, applyDiscountSchema, cancelOrderSchema, guestOrderLookupSchema, guestPurchaseSchema, guestPayOSCheckoutSchema, guestPayOSOrderLookupSchema, mockPayOSConfirmSchema } from "./orders.validator";

type AuthenticatedRequest = Request & {
    user?: { id?: string | number; role?: string };
};

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    if (err instanceof HttpException) return err;
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : err.message || fallbackMessage;
    return createHttpException(err, { msg }, statusCode);
}

function canAccessOrder(req: AuthenticatedRequest, ownerId: string | number): boolean {
    return String(req.user?.role || "").toLowerCase() === "admin" || String(req.user?.id) === String(ownerId);
}

@Controller("orders")
export class OrdersController {
    constructor(
        private readonly ordersService: NestOrdersService,
        @Optional() private readonly ordersPayOSService?: NestOrdersPayOSService,
    ) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async getOrders(@Query() query: Record<string, unknown>) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
            const safeLimit = usePagination ? Math.min(limit, 100) : null;
            const offset = usePagination ? (page - 1) * safeLimit : 0;

            if (usePagination) {
                const [orders, total] = await Promise.all([
                    this.ordersService.getOrdersPaginated(safeLimit as number, offset),
                    this.ordersService.getOrdersCount(),
                ]);
                return {
                    orders,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                    msg: "Orders retrieved successfully",
                };
            }

            const orders = await this.ordersService.getOrders();
            return { orders, msg: "Orders retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to retrieve orders");
        }
    }

    @Get("/item")
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async getOrderItems(@Query() query: Record<string, unknown>) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
            const safeLimit = usePagination ? Math.min(limit, 100) : null;
            const offset = usePagination ? (page - 1) * safeLimit : 0;

            if (usePagination) {
                const [results, total] = await Promise.all([
                    this.ordersService.getOrderItemsPaginated(safeLimit as number, offset),
                    this.ordersService.getOrderItemsCount(),
                ]);
                return {
                    orderItems: results,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                    msg: "Products sales and revenue retrieved successfully",
                };
            }

            const results = await this.ordersService.getOrderItems();
            return {
                orderItems: results,
                msg: "Products sales and revenue retrieved successfully",
            };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to retrieve order items");
        }
    }

    @Get("/user/:uid")
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async getCustomerOrders(@Param("uid") uid: string) {
        try {
            const orders = await this.ordersService.getOrdersByUserId(uid);
            return { orders, msg: "Customer orders retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to retrieve customer orders");
        }
    }

    @Get("/:oid")
    @UseGuards(AuthGuard)
    async getOrderDetail(@Param("oid") oid: string, @Req() req: AuthenticatedRequest) {
        try {
            const order = await this.ordersService.getOrderDetail(Number(oid));
            if (!order || !canAccessOrder(req, order.user_id)) {
                throw new HttpException({ msg: "Order not found" }, HTTP_STATUS.NOT_FOUND);
            }
            return { order, msg: "Order detail retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to retrieve order detail");
        }
    }

    @Post("/status/:oid")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async changeOrderStatus(
        @Param("oid") oid: string,
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(orderStatusSchema)) body: { status: number },
    ) {
        try {
            const order = await this.ordersService.changeOrderStatus(Number(oid), body.status, String(req.user?.id || ""));
            if (!order) {
                throw new HttpException({ msg: "Order not found" }, HTTP_STATUS.NOT_FOUND);
            }
            return {
                order,
                msg: "Order status has been updated successfully",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to change order status");
        }
    }

    @Post(":oid/cancel")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    async cancelOrder(
        @Param("oid") oid: string,
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(cancelOrderSchema)) body: { reason?: string },
    ) {
        try {
            const actorId = String(req.user?.id || "");
            const admin = String(req.user?.role || "").toLowerCase() === "admin";
            const order = await this.ordersService.cancelOrder(Number(oid), actorId, admin, body.reason);
            return { order, msg: "Order has been canceled successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to cancel order");
        }
    }

    @Post("/guest/purchase")
    @HttpCode(HTTP_STATUS.CREATED)
    async makeGuestPurchase(
        @Body(new ZodValidationPipe(guestPurchaseSchema)) body: GuestPurchasePayload,
    ) {
        try {
            const result = await this.ordersService.makeGuestPurchase(body);
            return {
                orderId: result.order.id,
                order: result.order,
                guestOrderToken: result.guestOrderToken,
                paymentMethod: body.paymentMethod,
                msg: `Order has been created successfully with id = ${result.order.id}`,
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to place order right now" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async lookupGuestOrder(
        @Body(new ZodValidationPipe(guestOrderLookupSchema)) body: GuestOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.lookupGuestOrder(body.orderId, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }

    @Post("/guest/payos-checkout-session")
    @HttpCode(HTTP_STATUS.OK)
    async createGuestPayOSCheckoutSession(
        @Body(new ZodValidationPipe(guestPayOSCheckoutSchema)) body: GuestPayOSCheckoutPayload,
    ) {
        try {
            if (!this.ordersPayOSService) throw new HttpException({ msg: "PayOS checkout is not configured" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
            const result = await this.ordersPayOSService.createGuestCheckoutSession(body);
            return {
                url: result.url,
                orderCode: result.orderCode,
                paymentLinkId: result.paymentLinkId,
                amount: result.amount,
                currency: result.currency,
                guestOrderToken: result.guestOrderToken,
                msg: "PayOS checkout session created",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to start guest PayOS checkout" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/mock-payos/confirm")
    @HttpCode(HTTP_STATUS.OK)
    async confirmMockPayOSPayment(
        @Body(new ZodValidationPipe(mockPayOSConfirmSchema)) body: MockPayOSConfirmPayload,
    ) {
        try {
            if (!this.ordersPayOSService) throw new HttpException({ msg: "PayOS checkout is not configured" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
            const order = await this.ordersPayOSService.confirmMockPayment(body.orderCode, body.paymentLinkId, body.amount);
            return { orderId: order.id, order, msg: "Mock PayOS payment confirmed" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to confirm mock PayOS payment" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Get("/by-payos-order-code/:orderCode")
    @UseGuards(AuthGuard)
    async getOrderByPayOSOrderCode(@Param("orderCode") orderCode: string, @Req() req: AuthenticatedRequest) {
        try {
            const parsedOrderCode = Number(orderCode);
            const order = Number.isSafeInteger(parsedOrderCode) && parsedOrderCode > 0
                ? await this.ordersService.getOrderByPayOSOrderCode(parsedOrderCode)
                : null;
            if (!order || !canAccessOrder(req, order.user_id)) {
                throw new HttpException({ msg: "Order not ready yet" }, HTTP_STATUS.NOT_FOUND);
            }
            return { order, msg: "Order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to retrieve order right now");
        }
    }

    @Post("/purchase/:uid")
    @HttpCode(HTTP_STATUS.CREATED)
    @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard)
    @OwnerParam("uid")
    @RequireVerifiedEmail()
    async makePurchase(
        @Param("uid") uid: string,
        @Body(new ZodValidationPipe(purchaseSchema)) body: {
            totalPrice: number;
            cart: Array<{ productId: number; quantity: number; price: number; sale_price?: number | null }>;
            discount: number;
            discountCode?: string;
            shippingAddress: string;
            paymentMethod: PaymentProviderName;
        },
    ) {
        const { totalPrice, cart, discountCode, shippingAddress, paymentMethod } = body;

        if (!cart || cart.length === 0) {
            throw new HttpException({ msg: "Cart cannot be empty" }, HTTP_STATUS.BAD_REQUEST);
        }
        if (paymentMethod !== PAYMENT_PROVIDER.CASH && paymentMethod !== PAYMENT_PROVIDER.PAYOS) {
            throw new HttpException({ msg: "Unsupported payment method" }, HTTP_STATUS.BAD_REQUEST);
        }

        try {
            const promotion = discountCode ? await this.ordersService.applyDiscount(discountCode) : null;
            if (discountCode && !promotion) {
                throw new HttpException({ msg: "Discount code is no longer valid." }, HTTP_STATUS.BAD_REQUEST);
            }
            const discount = calculatePromotionDiscount(promotion, totalPrice);
            const order = await this.ordersService.makePurchase(uid, {
                totalPrice,
                cart,
                discount,
                discountCode,
                shippingAddress,
                paymentMethod,
            });
            return {
                orderId: order.id,
                order,
                paymentMethod,
                msg: `Order has been created successfully with id = ${order.id}`,
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to place order right now" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/payos-checkout-session/:uid")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard)
    @OwnerParam("uid")
    @RequireVerifiedEmail()
    async createPayOSCheckoutSession(
        @Param("uid") uid: string,
        @Body(new ZodValidationPipe(checkoutSessionSchema)) body: {
            totalPrice: number;
            cart: Array<{ productId: number; quantity: number; price: number; sale_price?: number | null }>;
            discount: number;
            discountCode?: string;
            shippingAddress: string;
        },
    ) {
        try {
            if (!this.ordersPayOSService) throw new HttpException({ msg: "PayOS checkout is not configured" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
            const result = await this.ordersPayOSService.createCheckoutSession(uid, body);
            return {
                url: result.url,
                orderCode: result.orderCode,
                paymentLinkId: result.paymentLinkId,
                amount: result.amount,
                currency: result.currency,
                msg: "PayOS checkout session created",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to start authenticated PayOS checkout" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/by-payos-order-code")
    @HttpCode(HTTP_STATUS.OK)
    async getGuestOrderByPayOSOrderCode(
        @Body(new ZodValidationPipe(guestPayOSOrderLookupSchema)) body: GuestPayOSOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.getGuestOrderByPayOSOrderCode(body.orderCode, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }

    @Post("/discount")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("customer", "admin")
    async applyDiscount(@Body(new ZodValidationPipe(applyDiscountSchema)) body: { discountCode: string; price: number }) {
        try {
            const promotion = await this.ordersService.applyDiscount(body.discountCode);
            if (!promotion) {
                throw new HttpException({ msg: "Discount code not found" }, HTTP_STATUS.NOT_FOUND);
            }

            const discount = calculatePromotionDiscount(promotion, Number(body.price));
            return {
                newPrice: Math.max(Number(body.price) - discount, 0),
                msg: "Discount code has been applied successfully",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err, "Unable to apply discount code");
        }
    }
}
