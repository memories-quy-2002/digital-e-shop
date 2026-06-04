const Promotion = require("./promotions.repository");
type LooseRecord = Record<string, unknown>;
import type { DbError, InsertResult, UpdateResult } from "#src/shared/interfaces/domain";
import type { PromotionInput, PromotionPayload } from "./promotions.dto";
import type { PromotionRow } from "./promotions.types";

type HttpError = Error & { statusCode?: number };
type PromotionError = DbError & HttpError;

const createHttpError = (message: string, statusCode: number): HttpError => Object.assign(new Error(message), { statusCode });

const normalizeDateInput = (value: unknown): string | null => {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace("T", " ");
};

const normalizePromotionPayload = (data: PromotionInput): PromotionPayload => {
    // Accept both client camelCase and database snake_case keys so admin forms
    // and direct API callers can share the same service path.
    const discountCode = String(data.discountCode || data.discount_code || "").trim().toUpperCase();
    const discountPercent = Number(data.discountPercent ?? data.discount_percent);
    const minOrderValue = Number(data.minOrderValue ?? data.min_order_value ?? 0);
    const usageLimitValue = data.usageLimit ?? data.usage_limit;
    const usageLimit = usageLimitValue === "" || usageLimitValue === null || usageLimitValue === undefined ? null : Number(usageLimitValue);

    if (!discountCode || Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
        throw createHttpError("Code and discount percent must be valid", 400);
    }

    if (Number.isNaN(minOrderValue) || minOrderValue < 0) {
        throw createHttpError("Minimum order value cannot be negative", 400);
    }

    if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 1)) {
        throw createHttpError("Usage limit must be empty or greater than zero", 400);
    }

    const startsAt = normalizeDateInput(data.startsAt ?? data.starts_at);
    const expiresAt = normalizeDateInput(data.expiresAt ?? data.expires_at);
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
        throw createHttpError("Expiry date must be after the start date", 400);
    }

    return {
        discountCode,
        discountPercent,
        active: data.active === false || data.active === 0 || data.active === "0" ? 0 : 1,
        minOrderValue,
        startsAt,
        expiresAt,
        usageLimit,
    };
};

const normalizeDatabaseError = (err?: PromotionError | null) => {
    // Convert low-level MySQL failures into messages the admin UI can display
    // without exposing SQL details.
    if (!err) return err;
    if (err.statusCode) return err;

    if (err.code === "ER_DUP_ENTRY") {
        return createHttpError("Promotion code already exists", 409);
    }

    if (err.code === "ER_NO_SUCH_TABLE") {
        return createHttpError("Discounts table is missing. Please run the database setup before creating promotions.", 500);
    }

    if (err.code === "ER_BAD_FIELD_ERROR") {
        return createHttpError("Discounts table is missing a required promotion column.", 500);
    }

    if (err.code === "ER_NO_DEFAULT_FOR_FIELD") {
        return createHttpError(`Discounts table requires a value for ${err.sqlMessage || "a column without a default"}`, 500);
    }

    if (err.code === "ER_DATA_TOO_LONG") {
        return createHttpError("Promotion data is too long for the discounts table.", 400);
    }

    if (err.code === "ER_TRUNCATED_WRONG_VALUE" || err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD") {
        return createHttpError("Promotion contains a value that does not match the discounts table column type.", 400);
    }

    return err;
};

const normalizePromotion = (promotion: LooseRecord = {}) => ({
    id: Number(promotion.id),
    discount_code: promotion.discount_code,
    discount_percent: Number(promotion.discount_percent) || 0,
    active: Boolean(Number(promotion.active ?? 1)),
    min_order_value: Number(promotion.min_order_value) || 0,
    starts_at: promotion.starts_at,
    expires_at: promotion.expires_at,
    usage_limit: promotion.usage_limit === null ? null : Number(promotion.usage_limit) || null,
});

async function getPromotions(): Promise<ReturnType<typeof normalizePromotion>[]> {
    return new Promise((resolve, reject) => {
        Promotion.getPromotions((err: DbError | null, results: PromotionRow[]) => {
            if (err) return reject(err);
            resolve((results || []).map(normalizePromotion));
        });
    });
}

async function createPromotion(data: PromotionInput) {
    const promotion = normalizePromotionPayload(data);
    return new Promise((resolve, reject) => {
        Promotion.createPromotion(promotion, (err: DbError | null, result: InsertResult) => {
            if (err) return reject(normalizeDatabaseError(err));
            resolve({ id: result.insertId, ...promotion });
        });
    });
}

async function updatePromotion(id: number | string, data: PromotionInput) {
    const promotion = normalizePromotionPayload(data);
    return new Promise((resolve, reject) => {
        Promotion.updatePromotion(id, promotion, (err: DbError | null, result: UpdateResult) => {
            if (err) return reject(normalizeDatabaseError(err));
            if (result.affectedRows === 0) return reject(createHttpError("Promotion not found", 404));
            resolve({ id: Number(id), ...promotion });
        });
    });
}

async function deletePromotion(id: number | string) {
    return new Promise((resolve, reject) => {
        Promotion.deletePromotion(id, (err: DbError | null, result: UpdateResult) => {
            if (err) return reject(normalizeDatabaseError(err));
            if (result.affectedRows === 0) return reject(createHttpError("Promotion not found", 404));
            resolve({ id: Number(id), active: false });
        });
    });
}

module.exports = {
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
};

