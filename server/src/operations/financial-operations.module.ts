import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { EvidenceRepository } from "./evidence.repository";
import { EvidenceService } from "./evidence.service";
import { AdminEvidenceController } from "./admin-evidence.controller";
import { CodSettlementRepository } from "../payments/cod-settlement.repository";
import { CodSettlementService } from "../payments/cod-settlement.service";
import { AdminCodSettlementsController } from "../payments/admin-cod-settlements.controller";

@Module({ imports: [UsersModule], controllers: [AdminEvidenceController, AdminCodSettlementsController], providers: [EvidenceRepository, EvidenceService, CodSettlementRepository, CodSettlementService], exports: [EvidenceService, CodSettlementService] })
export class FinancialOperationsModule {}
