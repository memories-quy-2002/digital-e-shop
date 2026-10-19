import { forwardRef, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { EvidenceRepository } from "./evidence.repository";
import { EvidenceService } from "./evidence.service";
import { AdminEvidenceController } from "./admin-evidence.controller";
import { CodSettlementRepository } from "../payments/cod-settlement.repository";
import { CodSettlementService } from "../payments/cod-settlement.service";
import { AdminCodSettlementsController } from "../payments/admin-cod-settlements.controller";
import { AdminPaymentAttemptsController } from "../payments/admin-payment-attempts.controller";
import { AdminPaymentAttemptsRepository } from "../payments/admin-payment-attempts.repository";
import { AdminPaymentAttemptsService } from "../payments/admin-payment-attempts.service";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    imports: [UsersModule, forwardRef(() => OrdersModule), PaymentsModule],
    controllers: [AdminEvidenceController, AdminCodSettlementsController, AdminPaymentAttemptsController],
    providers: [
        AuthGuard,
        RolesGuard,
        EvidenceRepository,
        EvidenceService,
        CodSettlementRepository,
        CodSettlementService,
        AdminPaymentAttemptsRepository,
        AdminPaymentAttemptsService,
    ],
    exports: [EvidenceService, CodSettlementService],
})
export class FinancialOperationsModule {}
