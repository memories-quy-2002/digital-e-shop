import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { InsertResult, LooseRecord, QueryCallback } from "#src/shared/interfaces/domain";
import type { PromotionPayload } from "./promotions.dto";
import type { PromotionRow } from "./promotions.types";
import type { TransactionContext } from "../database/transaction";

const createDiscountsTableSql = `
    CREATE TABLE IF NOT EXISTS discounts (
        id INT NOT NULL AUTO_INCREMENT,
        discount_code VARCHAR(50) NOT NULL,
        discount_percent DECIMAL(5,2) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0,
        starts_at DATETIME NULL,
        expires_at DATETIME NULL,
        usage_limit INT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY discounts_discount_code_unique (discount_code)
    )
`;

type QueryParams = unknown[] | Record<string, unknown> | QueryCallback | undefined;

export type PromotionReservationResult = {
    discountId: number;
    discount: number;
    promotion: PromotionRow;
};

type PromotionUsageRow = { used: number | string };

const promotionUsageError = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

const optionalInsertFields: Array<[string, keyof PromotionPayload]> = [
    ["active", "active"],
    ["min_order_value", "minOrderValue"],
    ["starts_at", "startsAt"],
    ["expires_at", "expiresAt"],
    ["usage_limit", "usageLimit"],
];

@Injectable()
export class PromotionsRepository {
    private promotionColumns: Set<string> | null = null;

    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    private ensureDiscountsTable(callback: QueryCallback) {
        // Some deployments already have a discounts table with fewer columns. Create
        // only when missing, then adapt queries to whichever optional columns exist.
        this.query("SHOW COLUMNS FROM discounts", (selectErr: (Error & { code?: string }) | null) => {
            if (!selectErr) {
                callback();
                return;
            }

            if (selectErr.code !== "ER_NO_SUCH_TABLE") {
                callback(selectErr);
                return;
            }

            this.query(createDiscountsTableSql, callback);
        });
    }

    private loadPromotionColumns(callback: QueryCallback) {
        this.query("SHOW COLUMNS FROM discounts", (err: Error | null, rows: LooseRecord[]) => {
            if (err) return callback(err);
            this.promotionColumns = new Set(((rows as Array<{ Field: string }> | undefined) || []).map((row) => row.Field));
            callback();
        });
    }

    private ensurePromotionColumns(callback: QueryCallback) {
        if (this.promotionColumns) {
            callback();
            return;
        }

        this.ensureDiscountsTable((tableErr: Error | null) => {
            if (tableErr) {
                callback(tableErr);
                return;
            }

            this.loadPromotionColumns(callback);
        });
    }

    private hasColumn(column: string) {
        return this.promotionColumns?.has(column);
    }

    private getPromotionSelect() {
        return [
            "id",
            "discount_code",
            "discount_percent",
            this.hasColumn("active") ? "active" : "1 AS active",
            this.hasColumn("min_order_value") ? "min_order_value" : "0 AS min_order_value",
            this.hasColumn("starts_at") ? "DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS starts_at" : "NULL AS starts_at",
            this.hasColumn("expires_at") ? "DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expires_at" : "NULL AS expires_at",
            this.hasColumn("usage_limit") ? "usage_limit" : "NULL AS usage_limit",
        ].join(",\n    ");
    }

    private getPromotionOrder() {
        return `${this.hasColumn("active") ? "active DESC, " : ""}id DESC`;
    }

    private buildPromotionInsert(promotion: PromotionPayload) {
        const fields = ["discount_code", "discount_percent"];
        const values: Array<string | number | null> = [promotion.discountCode, promotion.discountPercent];

        optionalInsertFields.forEach(([column, key]) => {
            if (this.hasColumn(column)) {
                fields.push(column);
                values.push(promotion[key]);
            }
        });

        return {
            sql: `INSERT INTO discounts (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
            values,
        };
    }

    private buildPromotionUpdate(promotion: PromotionPayload, id: number | string) {
        const assignments = ["discount_code = ?", "discount_percent = ?"];
        const values: Array<string | number | null> = [promotion.discountCode, promotion.discountPercent];

        optionalInsertFields.forEach(([column, key]) => {
            if (this.hasColumn(column)) {
                assignments.push(`${column} = ?`);
                values.push(promotion[key]);
            }
        });

        values.push(id);

        return {
            sql: `UPDATE discounts SET ${assignments.join(", ")} WHERE id = ?`,
            values,
        };
    }

    getPromotions(callback: QueryCallback) {
        this.ensurePromotionColumns((err: Error | null) => {
            if (err) return callback(err);
            this.query(`SELECT ${this.getPromotionSelect()} FROM discounts ORDER BY ${this.getPromotionOrder()}`, callback);
        });
    }

    createPromotion(promotion: PromotionPayload, callback: QueryCallback) {
        this.ensurePromotionColumns((err: Error | null) => {
            if (err) return callback(err);
            const insert = this.buildPromotionInsert(promotion);
            this.query(insert.sql, insert.values, callback);
        });
    }

    updatePromotion(id: number | string, promotion: PromotionPayload, callback: QueryCallback) {
        this.ensurePromotionColumns((err: Error | null) => {
            if (err) return callback(err);
            const update = this.buildPromotionUpdate(promotion, id);
            this.query(update.sql, update.values, callback);
        });
    }

    deletePromotion(id: number | string, callback: QueryCallback) {
        this.ensurePromotionColumns((err: Error | null) => {
            if (err) return callback(err);
            if (this.hasColumn("active")) {
                this.query("UPDATE discounts SET active = 0 WHERE id = ?", [id], callback);
                return;
            }
            this.query("DELETE FROM discounts WHERE id = ?", [id], callback);
        });
    }

    getActivePromotionByCode(discountCode: string, callback: QueryCallback) {
        this.ensurePromotionColumns((err: Error | null) => {
            if (err) return callback(err);

            const conditions = ["discount_code = ?"];
            if (this.hasColumn("active")) conditions.push("active = 1");
            if (this.hasColumn("starts_at")) conditions.push("(starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())");
            if (this.hasColumn("expires_at")) conditions.push("(expires_at IS NULL OR expires_at >= UTC_TIMESTAMP())");

            this.query(
                `SELECT ${this.getPromotionSelect()}
                FROM discounts
                WHERE ${conditions.join(" AND ")}`,
                [discountCode],
                callback,
            );
        });
    }

    async reservePromotion(
        tx: TransactionContext,
        discountCode: string,
        pendingCheckoutId: number,
        userId: string,
        expiresAt: Date,
        totalPrice: number,
    ): Promise<PromotionReservationResult> {
        const promotion = await this.getPromotionForUpdate(tx, discountCode, totalPrice);
        const used = await this.getPromotionUsage(tx, promotion.id);
        this.assertUsageAvailable(promotion, used);

        const discount = calculateDiscount(promotion, totalPrice);
        const pendingUpdate = await tx.query<{ affectedRows: number }>(
            `UPDATE pending_checkouts
             SET discount_id = ?, discount = ?
             WHERE id = ? AND status = 'PENDING'`,
            [promotion.id, discount, pendingCheckoutId],
        );
        if (pendingUpdate.affectedRows !== 1) {
            throw promotionUsageError("Checkout reservation is no longer available.", 409);
        }
        await tx.query<InsertResult>(
            `INSERT INTO discount_redemptions
                (discount_id, pending_checkout_id, user_id, status, expires_at)
             VALUES (?, ?, ?, 'RESERVED', ?)`,
            [promotion.id, pendingCheckoutId, userId, expiresAt],
        );

        return { discountId: promotion.id, discount, promotion };
    }

    async consumePromotion(
        tx: TransactionContext,
        discountCode: string,
        userId: string,
        orderId: number,
        totalPrice: number,
    ): Promise<PromotionReservationResult> {
        const promotion = await this.getPromotionForUpdate(tx, discountCode, totalPrice);
        const used = await this.getPromotionUsage(tx, promotion.id);
        this.assertUsageAvailable(promotion, used);
        const discount = calculateDiscount(promotion, totalPrice);

        await tx.query<InsertResult>(
            `INSERT INTO discount_redemptions
                (discount_id, order_id, user_id, status, consumed_at)
             VALUES (?, ?, ?, 'CONSUMED', UTC_TIMESTAMP())`,
            [promotion.id, orderId, userId],
        );
        return { discountId: promotion.id, discount, promotion };
    }

    async consumePromotionReservation(tx: TransactionContext, pendingCheckoutId: number, orderId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = 'CONSUMED', order_id = ?, consumed_at = UTC_TIMESTAMP()
             WHERE pending_checkout_id = ? AND status = 'RESERVED'`,
            [orderId, pendingCheckoutId],
        );
        return result.affectedRows;
    }

    async releasePromotionReservation(tx: TransactionContext, pendingCheckoutId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = 'RELEASED'
             WHERE pending_checkout_id = ? AND status = 'RESERVED'`,
            [pendingCheckoutId],
        );
        return result.affectedRows;
    }

    private async getPromotionForUpdate(
        tx: TransactionContext,
        discountCode: string,
        totalPrice: number,
    ): Promise<PromotionRow> {
        const rows = await tx.query<PromotionRow[]>(
            `SELECT id, discount_code, discount_percent, active, min_order_value,
                    starts_at, expires_at, usage_limit
             FROM discounts
             WHERE discount_code = ?
             FOR UPDATE`,
            [String(discountCode || "").trim().toUpperCase()],
        );
        const promotion = rows[0];
        if (!promotion || Number(promotion.active ?? 1) !== 1) {
            throw promotionUsageError("Discount code is no longer valid.", 400);
        }

        const now = Date.now();
        if (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) {
            throw promotionUsageError("Discount code is not active yet.", 400);
        }
        if (promotion.expires_at && new Date(promotion.expires_at).getTime() <= now) {
            throw promotionUsageError("Discount code has expired.", 400);
        }
        if (Number(totalPrice) < (Number(promotion.min_order_value) || 0)) {
            throw promotionUsageError(
                `This promotion requires a minimum order of $${(Number(promotion.min_order_value) || 0).toFixed(2)}`,
                400,
            );
        }
        return promotion;
    }

    private async getPromotionUsage(tx: TransactionContext, discountId: number): Promise<number> {
        const rows = await tx.query<PromotionUsageRow[]>(
            `SELECT COUNT(*) AS used
             FROM discount_redemptions
             WHERE discount_id = ?
               AND (
                   status = 'CONSUMED'
                   OR (status = 'RESERVED' AND expires_at > UTC_TIMESTAMP())
               )`,
            [discountId],
        );
        return Number(rows[0]?.used) || 0;
    }

    private assertUsageAvailable(promotion: PromotionRow, used: number): void {
        const usageLimit = promotion.usage_limit === null || promotion.usage_limit === undefined
            ? null
            : Number(promotion.usage_limit);
        if (usageLimit !== null && used >= usageLimit) {
            throw promotionUsageError("Discount code has reached its usage limit.", 409);
        }
    }
}

const calculateDiscount = (promotion: PromotionRow, totalPrice: number): number => {
    const percent = Math.min(Math.max(Number(promotion.discount_percent) || 0, 0), 100);
    return Math.min(Number(totalPrice), (Number(totalPrice) * percent) / 100);
};
