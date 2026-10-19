import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AddressesModule } from "../../addresses/addresses.module";
import { AdminAlertsModule } from "../../admin-alerts/admin-alerts.module";
import { AfterSalesModule } from "../../after-sales/after-sales.module";
import { AnalyticsModule } from "../../analytics/analytics.module";
import { BlobModule } from "../../blob/blob.module";
import { CartModule } from "../../cart/cart.module";
import { InventoryModule } from "../../inventory/inventory.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { OrdersModule } from "../../orders/orders.module";
import { ProductAlertsModule } from "../../product-alerts/product-alerts.module";
import { ProductsModule } from "../../products/products.module";
import { PromotionsModule } from "../../promotions/promotions.module";
import { ReviewsModule } from "../../reviews/reviews.module";
import { ShippingModule } from "../../shipping/shipping.module";
import { SupportModule } from "../../support/support.module";
import { EmailModule } from "../../transactional-email/email.module";
import { UsersModule } from "../../users/users.module";
import { WishlistModule } from "../../wishlist/wishlist.module";
import { AuthGuard } from "../auth.guard";
import { RolesGuard } from "../roles.guard";
import { VerifiedEmailGuard } from "../verified-email.guard";
import { FinancialOperationsModule } from "../../operations/financial-operations.module";
import { TaskRunnerModule } from "../../operations/task-runner.module";

const guardedModules = [
    AddressesModule,
    AdminAlertsModule,
    AfterSalesModule,
    AnalyticsModule,
    BlobModule,
    CartModule,
    FinancialOperationsModule,
    InventoryModule,
    NotificationsModule,
    OrdersModule,
    ProductAlertsModule,
    ProductsModule,
    PromotionsModule,
    ReviewsModule,
    ShippingModule,
    SupportModule,
    UsersModule,
    WishlistModule,
];

describe("feature guard registration", () => {
    it.each(guardedModules)("registers guards for %s", (featureModule) => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, featureModule) as unknown[];

        expect(providers).toContain(AuthGuard);
        expect(providers).toContain(RolesGuard);
    });

    it("registers authorization guards in dynamic modules", () => {
        const emailProviders = EmailModule.register({ mode: "disabled", production: false }).providers as unknown[];
        const taskRunnerProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TaskRunnerModule) as unknown[];

        expect(emailProviders).toContain(AuthGuard);
        expect(emailProviders).toContain(RolesGuard);
        expect(taskRunnerProviders).toContain(AuthGuard);
        expect(taskRunnerProviders).toContain(RolesGuard);
    });

    it("registers verified-email guards where checkout and review writes use them", () => {
        const orderProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OrdersModule) as unknown[];
        const reviewProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ReviewsModule) as unknown[];

        expect(orderProviders).toContain(VerifiedEmailGuard);
        expect(reviewProviders).toContain(VerifiedEmailGuard);
    });
});
