import { Body, Controller, Get, Param, Post, Req, UseGuards, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../guards/auth.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestOrdersService } from "../orders/orders.service";
import { FulfillmentService } from "./fulfillment.service";
import { guestOrderLookupSchema } from "../orders/orders.validator";

@Controller("shipping")
export class CustomerShippingController {
    constructor(private readonly orders: NestOrdersService, private readonly fulfillment: FulfillmentService) {}
    @Get("orders/:id") @UseGuards(AuthGuard)
    async get(@Param("id") id: string, @Req() req: Request) {
        const orderId = z.coerce.number().int().positive().parse(id);
        const order = await this.orders.getOrderDetail(orderId);
        if (!order || (order.user_id !== String(req.user?.id) && String(req.user?.role).toLowerCase() !== "admin")) throw new NotFoundException("Order not found");
        return { shipment: await this.fulfillment.summary(orderId) };
    }
    @Post("guest/shipment")
    async guest(@Body(new ZodValidationPipe(guestOrderLookupSchema)) body: { orderId: number; guestOrderToken: string }) {
        try {
            await this.orders.lookupGuestOrder(body.orderId, body.guestOrderToken);
        } catch (error) {
            if ((error as { statusCode?: number })?.statusCode === 404) throw new NotFoundException("Order not found");
            throw error;
        }
        return { shipment: await this.fulfillment.summary(body.orderId) };
    }
}
