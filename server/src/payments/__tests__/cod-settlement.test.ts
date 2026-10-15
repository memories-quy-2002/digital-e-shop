import { describe, expect, it, vi } from "vitest";
import { CodSettlementService } from "../cod-settlement.service";
import type { CodSettlementRepositoryPort } from "../cod-settlement.repository";
import type { EvidenceService } from "../../operations/evidence.service";
import { settlementInputSchema } from "../cod-settlement.validator";

const evidence = { readForAdmin: vi.fn().mockResolvedValue({ id: 4, uploadedBy: "admin-1" }) } as unknown as EvidenceService;

function makeRepository(): CodSettlementRepositoryPort {
    return {
        withTransaction: vi.fn(async (work) => work({} as never)),
        ensureForOrder: vi.fn().mockResolvedValue({ id: 1, orderId: 7, expectedCodVnd: 8_199_000, collectedVnd: 0, carrierFeeVnd: 0, remittedVnd: 0, status: "PENDING", currency: "VND" }),
        recordCollection: vi.fn().mockResolvedValue(undefined),
        getForUpdate: vi.fn().mockResolvedValue({ id: 1, orderId: 7, expectedCodVnd: 8_199_000, collectedVnd: 8_199_000, carrierFeeVnd: 0, actualCarrierFeeVnd: 99_000, remittedVnd: 0, status: "PENDING", currency: "VND" }),
        findByTransferReference: vi.fn().mockResolvedValue(null),
        insertRemittance: vi.fn().mockResolvedValue({ id: 1, orderId: 7, expectedCodVnd: 8_199_000, collectedVnd: 8_199_000, carrierFeeVnd: 99_000, remittedVnd: 8_100_000, status: "MATCHED", currency: "VND" }),
    };
}

describe("CodSettlementService", () => {
    it("calculates expected net remittance from collection minus actual carrier fees", async () => {
        const repository = makeRepository();
        const service = new CodSettlementService(repository, evidence);
        await expect(service.recordRemittance(7, "admin-1", { remittedVnd: 8_100_000, transferReference: "bank-1", transferDate: "2026-10-14", evidenceId: 4 }))
            .resolves.toMatchObject({ expectedCodVnd: 8_199_000, remittedVnd: 8_100_000, status: "MATCHED" });
    });

    it("keeps collection distinct from remittance and ignores COD for prepaid orders", async () => {
        const repository = makeRepository();
        const service = new CodSettlementService(repository, evidence);
        await service.recordCollection({} as never, 7, 8_199_000);
        expect(repository.recordCollection).toHaveBeenCalledWith(expect.anything(), 7, 8_199_000);
        vi.mocked(repository.ensureForOrder).mockResolvedValueOnce({ id: 2, orderId: 8, expectedCodVnd: 0, collectedVnd: 0, carrierFeeVnd: 0, remittedVnd: 0, status: "MATCHED", currency: "VND" });
        await expect(service.ensureForOrder(8, 0, "payos")).resolves.toMatchObject({ expectedCodVnd: 0 });
        await expect(service.ensureForOrder(8, 10, "payos")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects reused transfer references and non-matching amounts", async () => {
        const repository = makeRepository();
        vi.mocked(repository.findByTransferReference).mockResolvedValueOnce({ id: 5, orderId: 99 } as never);
        const service = new CodSettlementService(repository, evidence);
        await expect(service.recordRemittance(7, "admin-1", { remittedVnd: 1, transferReference: "bank-1", transferDate: "2026-10-14", evidenceId: 4 })).rejects.toMatchObject({ statusCode: 409 });
        vi.mocked(repository.findByTransferReference).mockResolvedValueOnce(null);
        vi.mocked(repository.insertRemittance).mockResolvedValueOnce({ id: 1, orderId: 7, expectedCodVnd: 8_199_000, collectedVnd: 8_199_000, carrierFeeVnd: 99_000, remittedVnd: 8_000_000, status: "MISMATCH", currency: "VND" });
        await expect(service.recordRemittance(7, "admin-1", { remittedVnd: 8_000_000, transferReference: "bank-2", transferDate: "2026-10-14", evidenceId: 4 })).resolves.toMatchObject({ status: "MISMATCH" });
        expect(repository.insertRemittance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), "admin-1", 99_000, 8_100_000, "MISMATCH");
    });

    it("validates integer VND amounts and real transfer dates", () => {
        expect(settlementInputSchema.safeParse({ remittedVnd: 100.5, transferReference: "x", transferDate: "2026-02-31", evidenceId: 1 }).success).toBe(false);
    });
});
