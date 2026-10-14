import { Injectable } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "#src/database/transaction";
import type { CodSettlement, CodSettlementRepositoryPort, CodSettlementStatus, CodTransferReference, SettlementInput } from "./cod-settlement.types";
export type { CodSettlementRepositoryPort } from "./cod-settlement.types";

type RawSettlement = Record<string, unknown>;

const parseVnd = (value: unknown): number => {
    const text = String(value ?? "0");
    if (!/^\d+(?:\.0+)?$/.test(text)) throw new Error("Stored VND amount is not an integer");
    const amount = Number(text);
    if (!Number.isSafeInteger(amount)) throw new Error("Stored VND amount exceeds the safe integer range");
    return amount;
};
const dateValue = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const normalize = (row: RawSettlement): CodSettlement => ({
    id: Number(row.id), orderId: Number(row.order_id), expectedCodVnd: parseVnd(row.expected_cod_vnd),
    collectedVnd: parseVnd(row.collected_vnd), carrierFeeVnd: parseVnd(row.carrier_fee_vnd),
    remittedVnd: parseVnd(row.remitted_vnd), currency: "VND", status: String(row.status) as CodSettlementStatus,
    actualCarrierFeeVnd: row.actual_fee_vnd == null ? null : parseVnd(row.actual_fee_vnd),
    sandbox: Boolean(row.sandbox),
});

const columns = "id, order_id, expected_cod_vnd, collected_vnd, carrier_fee_vnd, remitted_vnd, currency, status";

@Injectable()
export class CodSettlementRepository implements CodSettlementRepositoryPort {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async ensureForOrder(orderId: number, expectedCodVnd: number): Promise<CodSettlement> {
        return this.withTransaction(async (tx) => {
            await tx.query(`INSERT INTO cod_settlements (order_id, expected_cod_vnd, collected_vnd, carrier_fee_vnd, remitted_vnd, currency, status, created_at, updated_at)
                VALUES (?, ?, 0, 0, 0, 'VND', 'PENDING', UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [orderId, expectedCodVnd]);
            const rows = await tx.query<RawSettlement[]>(`SELECT ${columns} FROM cod_settlements WHERE order_id = ? LIMIT 1 FOR UPDATE`, [orderId]);
            if (!rows[0]) throw new Error("COD settlement could not be created");
            const settlement = normalize(rows[0]);
            if (settlement.expectedCodVnd !== expectedCodVnd && settlement.collectedVnd === 0 && settlement.remittedVnd === 0) {
                await tx.query(`UPDATE cod_settlements SET expected_cod_vnd = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [expectedCodVnd, settlement.id]);
                settlement.expectedCodVnd = expectedCodVnd;
            } else if (settlement.expectedCodVnd !== expectedCodVnd) {
                throw Object.assign(new Error("COD expectation cannot change after collection or remittance has started."), { statusCode: 409 });
            }
            return settlement;
        });
    }

    async recordCollection(tx: TransactionContext, orderId: number, amountVnd: number): Promise<void> {
        const rows = await tx.query<RawSettlement[]>(`SELECT s.id, s.order_id, s.expected_cod_vnd, s.collected_vnd, s.carrier_fee_vnd,
                s.remitted_vnd, s.currency, s.status, sh.actual_fee_vnd FROM cod_settlements s
            LEFT JOIN shipments sh ON sh.order_id = s.order_id WHERE s.order_id = ? LIMIT 1 FOR UPDATE`, [orderId]);
        const current = rows[0] ? normalize(rows[0]) : null;
        if (!current) throw Object.assign(new Error("COD settlement was not initialized."), { statusCode: 409 });
        if (current.expectedCodVnd === 0 && amountVnd !== 0) throw Object.assign(new Error("Prepaid orders cannot record COD collection."), { statusCode: 409 });
        if (current.collectedVnd !== 0 && current.collectedVnd !== amountVnd) throw Object.assign(new Error("Conflicting COD collection amount."), { statusCode: 409 });
        if (current.collectedVnd === amountVnd) return;
        const nextStatus = amountVnd !== current.expectedCodVnd ? "MISMATCH"
            : current.remittedVnd === 0 ? "PENDING"
                : current.remittedVnd === amountVnd - current.carrierFeeVnd ? "MATCHED" : "MISMATCH";
        await tx.query(`UPDATE cod_settlements SET collected_vnd = ?, status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [amountVnd, nextStatus, current.id]);
        await tx.query(`INSERT INTO cod_settlement_events (settlement_id, event_type, actor_id, amount_vnd, carrier_fee_vnd, previous_values, new_values, created_at)
            VALUES (?, 'COLLECTION', NULL, ?, ?, ?, ?, UTC_TIMESTAMP())`, [current.id, amountVnd, current.carrierFeeVnd, JSON.stringify(current), JSON.stringify({ ...current, collectedVnd: amountVnd, status: nextStatus })]);
    }

    async getForUpdate(tx: TransactionContext, orderId: number): Promise<CodSettlement | null> {
        await tx.query("SELECT id FROM orders WHERE id = ? FOR UPDATE", [orderId]);
        const rows = await tx.query<RawSettlement[]>(`SELECT ${columns}, (SELECT actual_fee_vnd FROM shipments WHERE order_id = ?) AS actual_fee_vnd FROM cod_settlements WHERE order_id = ? LIMIT 1 FOR UPDATE`, [orderId, orderId]);
        return rows[0] ? normalize(rows[0]) : null;
    }

    async findByTransferReference(tx: TransactionContext, reference: string): Promise<CodTransferReference | null> {
        const rows = await tx.query<RawSettlement[]>(`SELECT s.order_id, e.transfer_reference, e.actor_id, e.amount_vnd, e.carrier_fee_vnd,
                e.transfer_date, e.evidence_id
            FROM cod_settlement_events e JOIN cod_settlements s ON s.id = e.settlement_id
            WHERE e.transfer_reference = ? LIMIT 1`, [reference]);
        const row = rows[0];
        return row ? {
            orderId: Number(row.order_id), transferReference: String(row.transfer_reference), actorId: String(row.actor_id),
            amountVnd: parseVnd(row.amount_vnd), carrierFeeVnd: parseVnd(row.carrier_fee_vnd),
            transferDate: dateValue(row.transfer_date), evidenceId: Number(row.evidence_id),
        } : null;
    }

    async insertRemittance(tx: TransactionContext, settlement: CodSettlement, input: SettlementInput, actorId: string, actualCarrierFeeVnd: number, expectedNetVnd: number, status: CodSettlementStatus): Promise<CodSettlement> {
        const next = { ...settlement, carrierFeeVnd: actualCarrierFeeVnd, remittedVnd: settlement.remittedVnd + input.remittedVnd, status };
        await tx.query(`UPDATE cod_settlements SET carrier_fee_vnd = ?, remitted_vnd = ?, status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [actualCarrierFeeVnd, next.remittedVnd, status, settlement.id]);
        await tx.query(`INSERT INTO cod_settlement_events (settlement_id, event_type, actor_id, amount_vnd, carrier_fee_vnd, transfer_reference, transfer_date, evidence_id, previous_values, new_values, created_at)
            VALUES (?, 'REMITTANCE', ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`, [settlement.id, actorId, input.remittedVnd, actualCarrierFeeVnd, input.transferReference, input.transferDate, input.evidenceId, JSON.stringify(settlement), JSON.stringify({ ...next, expectedNetVnd })]);
        return next;
    }

    list(limit: number, afterId: number) {
        return this.withTransaction(async (tx) => {
            const rows = await tx.query<RawSettlement[]>(`SELECT ${columns}, (SELECT actual_fee_vnd FROM shipments WHERE order_id = cod_settlements.order_id) AS actual_fee_vnd, (SELECT sandbox FROM shipments WHERE order_id = cod_settlements.order_id) AS sandbox FROM cod_settlements WHERE expected_cod_vnd > 0 AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT ?`, [afterId, afterId, limit]);
            return rows.map(normalize);
        });
    }
}
