import { Module } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { PayOSService } from "./payos.service";
import { PaymentProviderService } from "./payment-provider.service";

@Module({
    imports: [NestConfigModule],
    providers: [PayOSService, PaymentProviderService],
    exports: [PayOSService, PaymentProviderService],
})
export class PaymentsModule {}
