import { Module } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { PayOSService } from "./payos.service";
import { PaymentProviderService } from "./payment-provider.service";
import { PaymentReconciliationRepository } from "./payment-reconciliation.repository";
import { PaymentAttemptRepository } from "./payment-attempt.repository";
import { PaymentAttemptService } from "./payment-attempt.service";

@Module({
    imports: [NestConfigModule],
    providers: [PayOSService, PaymentProviderService, PaymentReconciliationRepository, PaymentAttemptRepository, PaymentAttemptService],
    exports: [PayOSService, PaymentProviderService, PaymentReconciliationRepository, PaymentAttemptRepository, PaymentAttemptService],
})
export class PaymentsModule {}
