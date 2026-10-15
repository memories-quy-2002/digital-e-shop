import { Injectable } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { EvidenceService } from "../operations/evidence.service";
import { CodSettlementRepository, type CodSettlementRepositoryPort } from "./cod-settlement.repository";
import type { CodSettlement, SettlementInput } from "./cod-settlement.types";

const settlementError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const validVnd = (value: number, name: string) => {
    if (!Number.isSafeInteger(value) || value < 0) throw settlementError(`${name} must be a non-negative integer VND amount.`, HTTP_STATUS.BAD_REQUEST);
};

@Injectable()
export class CodSettlementService {
    constructor(private readonly repository: CodSettlementRepository = new CodSettlementRepository(), private readonly evidence: EvidenceService) {}

    async ensureForOrder(orderId: number, expectedCodVnd: number, paymentMethod: string): Promise<CodSettlement> {
        if (!Number.isSafeInteger(orderId) || orderId < 1) throw settlementError("orderId must be a positive integer.", HTTP_STATUS.BAD_REQUEST);
        validVnd(expectedCodVnd, "expectedCodVnd");
        if (paymentMethod !== "cash" && expectedCodVnd !== 0) throw settlementError("Prepaid orders cannot have expected COD.", HTTP_STATUS.CONFLICT);
        return this.repository.ensureForOrder(orderId, expectedCodVnd);
    }

    recordCollection(tx: Parameters<CodSettlementRepositoryPort["recordCollection"]>[0], orderId: number, amountVnd: number): Promise<void> {
        validVnd(amountVnd, "amountVnd");
        return this.repository.recordCollection(tx, orderId, amountVnd);
    }

    async recordRemittance(orderId: number, actorId: string, input: SettlementInput): Promise<CodSettlement> {
        validVnd(input.remittedVnd, "remittedVnd");
        if (!Number.isSafeInteger(orderId) || orderId < 1 || !actorId) throw settlementError("A valid order and admin actor are required.", HTTP_STATUS.BAD_REQUEST);
        await this.evidence.readForAdmin(input.evidenceId, actorId);
        try {
            return await this.repository.withTransaction(async (tx) => {
                const settlement = await this.repository.getForUpdate(tx, orderId);
                if (!settlement) throw settlementError("COD settlement not found.", HTTP_STATUS.NOT_FOUND);
                const existing = await this.repository.findByTransferReference(tx, input.transferReference);
                const actualCarrierFeeVnd = settlement.actualCarrierFeeVnd;
                if (actualCarrierFeeVnd == null) throw settlementError("Carrier fee has not been verified yet.", HTTP_STATUS.CONFLICT);
                validVnd(actualCarrierFeeVnd, "actualCarrierFeeVnd");
                const expectedNetVnd = settlement.collectedVnd - actualCarrierFeeVnd;
                if (expectedNetVnd < 0) throw settlementError("Carrier fees cannot exceed collected COD.", HTTP_STATUS.CONFLICT);
                if (existing) {
                    const same = existing.orderId === orderId && existing.actorId === actorId
                        && existing.amountVnd === input.remittedVnd && existing.carrierFeeVnd === actualCarrierFeeVnd
                        && existing.transferDate === input.transferDate && existing.evidenceId === input.evidenceId;
                    if (same) return settlement;
                    throw settlementError("Transfer reference has already been used.", HTTP_STATUS.CONFLICT);
                }
                validVnd(settlement.remittedVnd + input.remittedVnd, "cumulativeRemittanceVnd");
                const status = settlement.remittedVnd + input.remittedVnd === expectedNetVnd && settlement.collectedVnd === settlement.expectedCodVnd ? "MATCHED" : "MISMATCH";
                return this.repository.insertRemittance(tx, settlement, input, actorId, actualCarrierFeeVnd, expectedNetVnd, status);
            });
        } catch (error) {
            if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw settlementError("Transfer reference has already been used.", HTTP_STATUS.CONFLICT);
            throw error;
        }
    }

    list(limit: number, afterId: number) { return this.repository.list(limit, afterId); }
}
