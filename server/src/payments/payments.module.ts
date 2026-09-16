import { Module } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { PayOSService } from "./payos.service";
import { PaymentProviderService } from "./payment-provider.service";
import { PaymentReconciliationRepository } from "./payment-reconciliation.repository";

@Module({
    imports: [NestConfigModule],
    providers: [PayOSService, PaymentProviderService, PaymentReconciliationRepository],
    exports: [PayOSService, PaymentProviderService, PaymentReconciliationRepository],
})
export class PaymentsModule {}
