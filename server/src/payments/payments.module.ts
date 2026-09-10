import { Module } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { PayOSService } from "./payos.service";
import { StripeService } from "../stripe/stripe.service";
import { PaymentProviderService } from "./payment-provider.service";

@Module({
    imports: [NestConfigModule],
    providers: [PayOSService, StripeService, PaymentProviderService],
    exports: [PayOSService, StripeService, PaymentProviderService],
})
export class PaymentsModule {}
