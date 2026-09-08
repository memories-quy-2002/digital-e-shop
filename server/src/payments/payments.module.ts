import { Module } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { StripeService } from "../stripe/stripe.service";
import { PaymentProviderService } from "./payment-provider.service";

@Module({
    imports: [NestConfigModule],
    providers: [StripeService, PaymentProviderService],
    exports: [StripeService, PaymentProviderService],
})
export class PaymentsModule {}
