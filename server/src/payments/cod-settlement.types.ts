import type { TransactionContext } from "../database/transaction";

export type CodSettlementStatus = "PENDING" | "MATCHED" | "MISMATCH";
export type CodSettlement = {
    sandbox?: boolean;
    id: number;
    orderId: number;
    expectedCodVnd: number;
    collectedVnd: number;
    carrierFeeVnd: number;
    remittedVnd: number;
    currency: "VND";
    status: CodSettlementStatus;
    actualCarrierFeeVnd?: number | null;
};
export type SettlementInput = {
    remittedVnd: number;
    transferReference: string;
    transferDate: string;
    evidenceId: number;
};
export type CodTransferReference = {
    orderId: number;
    transferReference: string;
    actorId: string;
    amountVnd: number;
    carrierFeeVnd: number;
    transferDate: string;
    evidenceId: number;
};
export type CodSettlementRepositoryPort = {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
    ensureForOrder(orderId: number, expectedCodVnd: number): Promise<CodSettlement>;
    recordCollection(tx: TransactionContext, orderId: number, amountVnd: number): Promise<void>;
    getForUpdate(tx: TransactionContext, orderId: number): Promise<CodSettlement | null>;
    findByTransferReference(tx: TransactionContext, reference: string): Promise<CodTransferReference | null>;
    insertRemittance(tx: TransactionContext, settlement: CodSettlement, input: SettlementInput, actorId: string, actualCarrierFeeVnd: number, expectedNetVnd: number, status: CodSettlementStatus): Promise<CodSettlement>;
};
