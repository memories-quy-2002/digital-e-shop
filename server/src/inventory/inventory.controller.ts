import { Controller, Get, HttpException, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestInventoryService } from "./inventory.service";
import { inventoryMovementsQuerySchema } from "./inventory.validator";

@Controller("inventory-movements")
@UseGuards(AuthGuard, RolesGuard)
export class InventoryController {
    constructor(private readonly inventoryService: NestInventoryService) {}

    @Get()
    async getInventoryMovements(@Query() query: Record<string, unknown>) {
        const { limit } = new ZodValidationPipe(inventoryMovementsQuerySchema).transform(query);

        try {
            const movements = await this.inventoryService.getMovements(limit);
            return { movements, msg: "Inventory movements retrieved successfully" };
        } catch (err) {
            const error = err as Error;
            throw new HttpException({ msg: "Unable to load inventory movements", error: error.message }, 500);
        }
    }
}
