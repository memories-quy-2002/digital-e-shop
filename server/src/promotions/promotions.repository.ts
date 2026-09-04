import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { LooseRecord, QueryCallback } from "#src/shared/interfaces/domain";
import type { PromotionPayload } from "./promotions.dto";

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
}
