import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ProductAlertsModule } from "../product-alerts/product-alerts.module";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersRepository } from "./purchase-orders.repository";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PurchaseReceiptsController } from "./purchase-receipts.controller";
import { PurchaseReceiptsRepository } from "./purchase-receipts.repository";
import { PurchaseReceiptsService } from "./purchase-receipts.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersRepository } from "./suppliers.repository";
import { SuppliersService } from "./suppliers.service";

@Module({
    imports: [NestConfigModule, ProductAlertsModule, InventoryModule],
    controllers: [SuppliersController, PurchaseOrdersController, PurchaseReceiptsController],
    providers: [
        AuthGuard, RolesGuard,
        SuppliersRepository, SuppliersService,
        PurchaseOrdersRepository, PurchaseOrdersService,
        PurchaseReceiptsRepository, PurchaseReceiptsService,
    ],
})
export class ProcurementModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(SuppliersController, PurchaseOrdersController, PurchaseReceiptsController);
    }
}
