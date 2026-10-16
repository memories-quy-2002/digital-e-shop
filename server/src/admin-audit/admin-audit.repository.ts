import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError } from "#src/shared/interfaces/database";
import type { z } from "zod";
import type { adminAuditQuerySchema } from "./admin-audit.validator";

export type AdminAuditFilters = Pick<z.infer<typeof adminAuditQuerySchema>, "search" | "entityType">;

export type AdminAuditEventRow = {
    id: number;
    actor_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    reason: string | null;
    changes: unknown;
    created_at: Date | string;
};

const getWhereClause = (filters: AdminAuditFilters) => {
    const conditions: string[] = [];
    const params: Array<string> = [];
    const search = filters.search?.trim().toLowerCase();

    if (search) {
        const escaped = `%${search.replace(/[!%_]/g, "!$&")}%`;
        conditions.push(`(
            LOWER(actor_id) LIKE ? ESCAPE '!'
            OR LOWER(action) LIKE ? ESCAPE '!'
            OR LOWER(entity_type) LIKE ? ESCAPE '!'
            OR LOWER(entity_id) LIKE ? ESCAPE '!'
            OR LOWER(COALESCE(reason, '')) LIKE ? ESCAPE '!'
        )`);
        params.push(escaped, escaped, escaped, escaped, escaped);
    }

    if (filters.entityType) {
        conditions.push("entity_type = ?");
        params.push(filters.entityType);
    }

    return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

@Injectable()
export class AdminAuditRepository {
    getPage(limit: number, offset: number, filters: AdminAuditFilters): Promise<AdminAuditEventRow[]> {
        const { where, params } = getWhereClause(filters);
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT id, actor_id, action, entity_type, entity_id, reason, changes, created_at
                 FROM admin_audit_events ${where}
                 ORDER BY created_at DESC, id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset],
                (error: DbError | null, rows?: AdminAuditEventRow[]) => {
                    if (error) return reject(error);
                    resolve(rows || []);
                },
            );
        });
    }

    getCount(filters: AdminAuditFilters): Promise<number> {
        const { where, params } = getWhereClause(filters);
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT COUNT(*) AS total FROM admin_audit_events ${where}`,
                params,
                (error: DbError | null, rows?: Array<{ total: number }>) => {
                    if (error) return reject(error);
                    resolve(Number(rows?.[0]?.total) || 0);
                },
            );
        });
    }
}
