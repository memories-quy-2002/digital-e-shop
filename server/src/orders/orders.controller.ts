import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestOrdersService } from "./orders.service";
import { NestOrdersStripeService } from "./orders.stripe.service";
import { orderStatusSchema, purchaseSchema, checkoutSessionSchema, applyDiscountSchema } from "./orders.validator";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    const statusCode = err.statusCode || 500;
    const msg = err.statusCode ? err.message : fallbackMessage;
    return new HttpException({ msg }, statusCode);
}

@Controller("orders")
export class OrdersController {
    constructor(
        private readonly ordersService: NestOrdersService,
        private readonly ordersStripeService: NestOrdersStripeService,
    ) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("Admin")
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
    @Roles("Admin")
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

    @Get("/by-session/:sessionId")
    @UseGuards(AuthGuard)
    async getOrderBySessionId(@Param("sessionId") sessionId: string, @Req() req?: Request) {
        try {
            const order = await this.ordersService.getOrderByStripeSessionId(
                sessionId,
                String(req?.user?.id || ""),
                String(req?.user?.role || ""),
            );
            if (!order) {
                throw new HttpException({ msg: "Order not ready yet" }, 404);
            }
            return { order, msg: "Order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to retrieve order right now");
        }
    }

    @Get("/:oid")
    @UseGuards(AuthGuard)
    async getOrderDetail(@Param("oid") oid: string, @Req() req?: Request) {
        try {
            const order = await this.ordersService.getOrderDetail(
                Number(oid),
                String(req?.user?.id || ""),
                String(req?.user?.role || ""),
            );
            if (!order) {
                throw new HttpException({ msg: "Order not found" }, 404);
            }
            return { order, msg: "Order detail retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to retrieve order detail");
        }
    }

    @Post("/status/:oid")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("Admin")
    async changeOrderStatus(
        @Param("oid") oid: string,
        @Body(new ZodValidationPipe(orderStatusSchema)) body: { status: number },
    ) {
        try {
            const order = await this.ordersService.changeOrderStatus(Number(oid), body.status);
            if (!order) {
                throw new HttpException({ msg: "Order not found" }, 404);
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

    @Post("/purchase/:uid")
    @HttpCode(201)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async makePurchase(
        @Param("uid") uid: string,
        @Body(new ZodValidationPipe(purchaseSchema)) body: {
            totalPrice: number;
            cart: Array<{ productId: number; quantity: number; price: number; sale_price?: number | null }>;
            discountCode?: string | null;
            discount?: number;
            shippingAddress: string;
            paymentMethod: string;
        },
    ) {
        const { totalPrice, cart, discountCode, shippingAddress, paymentMethod } = body;

        if (!cart || cart.length === 0) {
            throw new HttpException({ msg: "Cart cannot be empty" }, 400);
        }
        if (!["bank_transfer", "cash"].includes(paymentMethod)) {
            throw new HttpException({ msg: "Unsupported payment method" }, 400);
        }

        try {
            const order = await this.ordersService.makePurchase(uid, {
                totalPrice,
                cart,
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
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || 500;
            throw new HttpException(
                {
                    msg: statusCode === 500 ? "Unable to place order right now" : error.message,
                    ...(statusCode === 500 ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/checkout-session/:uid")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async createCheckoutSession(
        @Param("uid") uid: string,
        @Body(new ZodValidationPipe(checkoutSessionSchema)) body: {
            totalPrice: number;
            cart: Array<{ productId: number; quantity: number; price: number; sale_price?: number | null }>;
            discountCode?: string | null;
            discount?: number;
            shippingAddress: string;
        },
    ) {
        try {
            const result = await this.ordersStripeService.createCheckoutSession(uid, body);
            return { url: result.url, msg: "Checkout session created" };
        } catch (err) {
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || 500;
            throw new HttpException(
                {
                    msg: statusCode === 500 ? "Unable to start checkout right now" : error.message,
                    ...(statusCode === 500 ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/discount")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("Customer", "Admin")
    async applyDiscount(@Body(new ZodValidationPipe(applyDiscountSchema)) body: { discountCode: string; price: number }) {
        try {
            const discount = await this.ordersService.applyDiscount(body.discountCode);
            if (!discount) {
                throw new HttpException({ msg: "Discount code not found" }, 404);
            }

            const minOrderValue = Number(discount.min_order_value) || 0;
            if (Number(body.price) < minOrderValue) {
                throw new HttpException(
                    { msg: `This promotion requires a minimum order of $${minOrderValue.toFixed(2)}` },
                    400,
                );
            }

            const discountPercent = Number(discount.discount_percent);
            const newPrice = (body.price * (100 - discountPercent)) / 100;
            return {
                newPrice,
                msg: "Discount code has been applied successfully",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Internal server error");
        }
    }
}
