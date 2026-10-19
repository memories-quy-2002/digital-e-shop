import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { withTransaction } from "../database/transaction";
import { FulfillmentService } from "./fulfillment.service";
import type { FulfillmentState } from "./fulfillment.policy";
import { packingTransitionSchema } from "./shipping.validator";

const orderId = (id: string) => z.coerce.number().int().positive().parse(id);
@Controller("admin/shipping") @UseGuards(AuthGuard, RolesGuard) @Roles("admin")
export class AdminShippingController {
    constructor(private readonly fulfillment: FulfillmentService) {}
    @Get() list() {
        return withTransaction((tx) => tx.query("SELECT o.id AS orderId, COALESCE(s.state, 'UNFULFILLED') AS state, s.provider, s.provider_order_code AS trackingCode, s.sandbox FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE o.delivery_snapshot IS NOT NULL ORDER BY o.id DESC LIMIT 100"));
    }
    @Get(":id") detail(@Param("id") id: string) { return this.fulfillment.summary(orderId(id)); }
    @Post(":id/transition") update(@Param("id") id: string, @Req() req: Request, @Body(new ZodValidationPipe(packingTransitionSchema)) body: { state: FulfillmentState }) { return this.fulfillment.transition(orderId(id), body.state, String(req.user?.id)); }
}
