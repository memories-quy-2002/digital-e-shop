import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { withTransaction } from "#src/database/transaction";
import type { TransactionContext } from "#src/database/transaction";
import type { CreateSupplierInput, PageResult, Supplier, SupplierActionInput, SupplierRow, UpdateSupplierInput } from "./suppliers.types";

type QueryResult = { affectedRows?: number; insertId?: number };
const dateText = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value ?? "");
const mapSupplier = (row: SupplierRow): Supplier => ({
    id: Number(row.id), code: String(row.code), name: String(row.name),
    contactName: row.contact_name == null ? null : String(row.contact_name), email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone), address: row.address == null ? null : String(row.address), notes: row.notes == null ? null : String(row.notes),
    active: Number(row.active) === 1, version: Number(row.version), createdAt: dateText(row.created_at), updatedAt: dateText(row.updated_at),
});

@Injectable()
export class SuppliersRepository {
    private async audit(tx: TransactionContext, actorId: string, action: string, supplierId: number, reason: string | null, changes: unknown): Promise<void> {
        await tx.query(
            `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
             VALUES (?, ?, 'supplier', ?, ?, ?)`,
            [actorId, action, String(supplierId), reason, JSON.stringify(changes)],
        );
    }

    list(page: number, limit: number, search: string, status: string): Promise<PageResult<Supplier>> {
        const where: string[] = [];
        const values: unknown[] = [];
        if (status !== "all") {
            where.push("active = ?");
            values.push(status === "active" ? 1 : 0);
        }
        if (search) {
            const term = `%${search.replace(/[!%_]/g, "!$&")}%`;
            where.push("(LOWER(code) LIKE ? ESCAPE '!' OR LOWER(name) LIKE ? ESCAPE '!' OR LOWER(COALESCE(contact_name, '')) LIKE ? ESCAPE '!')");
            values.push(term, term, term);
        }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const offset = (page - 1) * limit;
        return new Promise((resolve, reject) => {
            pool.query(`SELECT COUNT(*) AS total FROM suppliers ${clause}`, values, (countError: Error | null, countRows: Array<{ total: number }>) => {
                if (countError) return reject(countError);
                const total = Number(countRows?.[0]?.total) || 0;
                pool.query(
                    `SELECT id, code, name, contact_name, email, phone, address, notes, active, version,
                            created_at, updated_at
                     FROM suppliers ${clause} ORDER BY active DESC, name ASC, id DESC LIMIT ? OFFSET ?`,
                    [...values, limit, offset],
                    (error: Error | null, rows: SupplierRow[]) => error ? reject(error) : resolve({
                        items: (rows || []).map(mapSupplier),
                        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
                    }),
                );
            });
        });
    }

    async get(id: number, tx?: TransactionContext): Promise<Supplier | null> {
        const query = async (context?: TransactionContext) => context
            ? context.query<SupplierRow[]>("SELECT * FROM suppliers WHERE id = ? LIMIT 1", [id])
            : new Promise<SupplierRow[]>((resolve, reject) => pool.query("SELECT * FROM suppliers WHERE id = ? LIMIT 1", [id], (error: Error | null, rows: SupplierRow[]) => error ? reject(error) : resolve(rows || [])));
        const rows = await query(tx);
        return rows[0] ? mapSupplier(rows[0]) : null;
    }

    create(actorId: string, input: CreateSupplierInput): Promise<Supplier> {
        return withTransaction(async (tx) => {
            const normalizedCode = input.code.trim().toUpperCase();
            const result = await tx.query<QueryResult>(
                `INSERT INTO suppliers (code, normalized_code, name, contact_name, email, phone, address, notes, created_by_id, updated_by_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [normalizedCode, normalizedCode, input.name.trim(), input.contactName || null, input.email || null, input.phone || null, input.address || null, input.notes || null, actorId, actorId],
            );
            const id = Number(result.insertId);
            await this.audit(tx, actorId, "supplier.created", id, null, { code: normalizedCode, name: input.name.trim() });
            const supplier = await this.get(id, tx);
            if (!supplier) throw new AppError("Supplier could not be loaded after creation.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            return supplier;
        });
    }

    update(actorId: string, id: number, input: UpdateSupplierInput): Promise<Supplier> {
        return withTransaction(async (tx) => {
            const rows = await tx.query<SupplierRow[]>("SELECT * FROM suppliers WHERE id = ? FOR UPDATE", [id]);
            const current = rows[0];
            if (!current) throw new AppError("Supplier not found.", HTTP_STATUS.NOT_FOUND);
            if (Number(current.version) !== input.version) throw new AppError("Supplier changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            const values = {
                code: input.code === undefined ? String(current.code) : input.code.trim().toUpperCase(),
                name: input.name ?? String(current.name),
                contactName: input.contactName === undefined ? current.contact_name : input.contactName || null,
                email: input.email === undefined ? current.email : input.email || null,
                phone: input.phone === undefined ? current.phone : input.phone || null,
                address: input.address === undefined ? current.address : input.address || null,
                notes: input.notes === undefined ? current.notes : input.notes || null,
            };
            const result = await tx.query<QueryResult>(
                `UPDATE suppliers SET code = ?, normalized_code = ?, name = ?, contact_name = ?, email = ?, phone = ?, address = ?, notes = ?,
                    version = version + 1, updated_by_id = ?, updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ? AND version = ?`,
                [values.code, values.code, values.name, values.contactName, values.email, values.phone, values.address, values.notes, actorId, id, input.version],
            );
            if (result.affectedRows !== 1) throw new AppError("Supplier changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            await this.audit(tx, actorId, "supplier.updated", id, null, { fields: Object.keys(input).filter((key) => key !== "version") });
            const supplier = await this.get(id, tx);
            if (!supplier) throw new AppError("Supplier could not be loaded after update.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            return supplier;
        });
    }

    archive(actorId: string, id: number, input: SupplierActionInput): Promise<Supplier> {
        return withTransaction(async (tx) => {
            const rows = await tx.query<SupplierRow[]>("SELECT * FROM suppliers WHERE id = ? FOR UPDATE", [id]);
            const current = rows[0];
            if (!current) throw new AppError("Supplier not found.", HTTP_STATUS.NOT_FOUND);
            if (Number(current.version) !== input.version) throw new AppError("Supplier changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            if (Number(current.active) === 1) {
                await tx.query("UPDATE suppliers SET active = 0, version = version + 1, updated_by_id = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [actorId, id, input.version]);
                await this.audit(tx, actorId, "supplier.archived", id, input.reason, { active: { before: true, after: false } });
            }
            const supplier = await this.get(id, tx);
            if (!supplier) throw new AppError("Supplier could not be loaded after archive.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            return supplier;
        });
    }
}
