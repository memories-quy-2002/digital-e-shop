import { forwardRef, Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { UsersModule } from "../users/users.module";
import { ShippingQuoteRepository } from "./shipping-quote.repository";
import { ShippingQuoteService } from "./shipping-quote.service";
import { DeliverySettingsRepository } from "./delivery-settings.repository";
import { DeliverySettingsService } from "./delivery-settings.service";
import { RoadRouteService } from "./road-route.service";
import { ShippingController } from "./shipping.controller";
import { ShippingRepository } from "./shipping.repository";
import { FulfillmentService } from "./fulfillment.service";
import { AdminShippingController } from "./admin-shipping.controller";
import { FinancialOperationsModule } from "../operations/financial-operations.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { AdminDeliveryController } from "./admin-delivery.controller";
import { DeliveryStaffController } from "./delivery-staff.controller";
import { DeliveryAssignmentRepository } from "./delivery-assignment.repository";
import { DeliveryAssignmentService } from "./delivery-assignment.service";

@Module({
    imports: [CartModule, UsersModule, forwardRef(() => FinancialOperationsModule), LoyaltyModule],
    controllers: [ShippingController, AdminShippingController, AdminDeliveryController, DeliveryStaffController],
    providers: [
        AuthGuard,
        RolesGuard,
        ShippingQuoteRepository,
        ShippingQuoteService,
        DeliverySettingsRepository,
        DeliverySettingsService,
        DeliveryAssignmentRepository,
        DeliveryAssignmentService,
        RoadRouteService,
        ShippingRepository,
        FulfillmentService,
    ],
    exports: [ShippingQuoteService, DeliverySettingsService, DeliveryAssignmentService, RoadRouteService, ShippingRepository, FulfillmentService],
})
export class ShippingModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(ShippingController, AdminShippingController, AdminDeliveryController, DeliveryStaffController);
    }
}
