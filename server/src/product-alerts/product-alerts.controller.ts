import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { ProductAlertsService } from "./product-alerts.service";
import {
    productAlertProductIdSchema,
    productAlertUpdateSchema,
    productAlertUserParamSchema,
} from "./product-alerts.validator";
import type { ProductAlertUpdateInput } from "./product-alerts.dto";

@Controller(["users/:uid/product-alerts", "user/:uid/product-alerts"])
@UseGuards(AuthGuard, RolesGuard)
@OwnerParam("uid")
export class ProductAlertsController {
    constructor(private readonly productAlertsService: ProductAlertsService) {}

    @Get()
    async getAlerts(
        @Param("uid", new ZodValidationPipe(productAlertUserParamSchema)) uid: string,
    ) {
        const alerts = await this.productAlertsService.getForUser(uid);
        return { alerts, msg: "Product alerts retrieved successfully" };
    }

    @Get(":productId")
    async getAlert(
        @Param("uid", new ZodValidationPipe(productAlertUserParamSchema)) uid: string,
        @Param("productId", new ZodValidationPipe(productAlertProductIdSchema)) productId: number,
    ) {
        const alert = await this.productAlertsService.getForProduct(uid, Number(productId));
        return { alert, msg: "Product alert retrieved successfully" };
    }

    @Put(":productId")
    async updateAlert(
        @Param("uid", new ZodValidationPipe(productAlertUserParamSchema)) uid: string,
        @Param("productId", new ZodValidationPipe(productAlertProductIdSchema)) productId: number,
        @Body(new ZodValidationPipe(productAlertUpdateSchema)) body: ProductAlertUpdateInput,
    ) {
        const alert = await this.productAlertsService.updateForUser(uid, Number(productId), body);
        return { alert, msg: "Product alert preferences updated successfully" };
    }
}
