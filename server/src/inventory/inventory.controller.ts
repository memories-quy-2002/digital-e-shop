import { Controller, Get, HttpException, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestInventoryService } from "./inventory.service";
import { inventoryMovementsQuerySchema } from "./inventory.validator";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

@Controller("products/admin/inventory-movements")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class InventoryController {
    constructor(private readonly inventoryService: NestInventoryService) {}

    @Get()
    async getInventoryMovements(@Query() query: Record<string, unknown>) {
        const { limit } = new ZodValidationPipe(inventoryMovementsQuerySchema).transform(query);

        try {
            const movements = await this.inventoryService.getMovements(limit);
            return { movements, msg: "Inventory movements retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw createHttpException(err, { msg: "Unable to load inventory movements" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }
}
