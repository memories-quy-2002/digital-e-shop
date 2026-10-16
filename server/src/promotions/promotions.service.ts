import { Injectable } from "@nestjs/common";
import type { DbError } from "#src/shared/interfaces/domain";
import type { PromotionInput, PromotionPayload } from "./promotions.dto";
import type { PromotionRow } from "./promotions.types";
import { PromotionsRepository } from "./promotions.repository";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { MAX_LOYALTY_POINTS } from "../loyalty/loyalty.policy";

type LooseRecord = Record<string, unknown>;
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
    const discountCode = String(data.discountCode || data.discount_code || "").trim().toUpperCase();
    const discountPercent = Number(data.discountPercent ?? data.discount_percent);
    const minOrderValue = Number(data.minOrderValue ?? data.min_order_value ?? 0);
    const usageLimitValue = data.usageLimit ?? data.usage_limit;
    const usageLimit = usageLimitValue === "" || usageLimitValue === null || usageLimitValue === undefined ? null : Number(usageLimitValue);
    const loyaltyPointsCostValue = data.loyaltyPointsCost ?? data.loyalty_points_cost;
    const loyaltyPointsCost = loyaltyPointsCostValue === "" || loyaltyPointsCostValue === null || loyaltyPointsCostValue === undefined
        ? null
        : Number(loyaltyPointsCostValue);

    if (!discountCode || Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
        throw createHttpError("Code and discount percent must be valid", HTTP_STATUS.BAD_REQUEST);
    }

    if (Number.isNaN(minOrderValue) || minOrderValue < 0) {
        throw createHttpError("Minimum order value cannot be negative", HTTP_STATUS.BAD_REQUEST);
    }

    if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 1)) {
        throw createHttpError("Usage limit must be empty or greater than zero", HTTP_STATUS.BAD_REQUEST);
    }
    if (loyaltyPointsCost !== null && (!Number.isSafeInteger(loyaltyPointsCost) || loyaltyPointsCost < 1 || loyaltyPointsCost > MAX_LOYALTY_POINTS)) {
        throw createHttpError("Loyalty points cost must be a positive whole number", HTTP_STATUS.BAD_REQUEST);
    }

    const startsAt = normalizeDateInput(data.startsAt ?? data.starts_at);
    const expiresAt = normalizeDateInput(data.expiresAt ?? data.expires_at);
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
        throw createHttpError("Expiry date must be after the start date", HTTP_STATUS.BAD_REQUEST);
    }

    return {
        discountCode,
        discountPercent,
        active: data.active === false || data.active === 0 || data.active === "0" ? 0 : 1,
        minOrderValue,
        startsAt,
        expiresAt,
        usageLimit,
        loyaltyPointsCost,
    };
};

const normalizeDatabaseError = (err?: PromotionError | null) => {
    if (!err) return err;
    if (err.statusCode) return err;

    if (err.code === "ER_DUP_ENTRY") {
        return createHttpError("Promotion code already exists", HTTP_STATUS.CONFLICT);
    }

    if (err.code === "ER_NO_SUCH_TABLE") {
        return createHttpError("Discounts table is missing. Please run the database setup before creating promotions.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    if (err.code === "ER_BAD_FIELD_ERROR") {
        return createHttpError("Discounts table is missing a required promotion column.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    if (err.code === "ER_NO_DEFAULT_FOR_FIELD") {
        return createHttpError(`Discounts table requires a value for ${err.sqlMessage || "a column without a default"}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    if (err.code === "ER_DATA_TOO_LONG") {
        return createHttpError("Promotion data is too long for the discounts table.", HTTP_STATUS.BAD_REQUEST);
    }

    if (err.code === "ER_TRUNCATED_WRONG_VALUE" || err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD") {
        return createHttpError("Promotion contains a value that does not match the discounts table column type.", HTTP_STATUS.BAD_REQUEST);
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
    usage_count: Number(promotion.usage_count) || 0,
    remaining_uses: promotion.remaining_uses === null || promotion.remaining_uses === undefined
        ? (promotion.usage_limit === null || promotion.usage_limit === undefined ? null : Math.max(Number(promotion.usage_limit) - (Number(promotion.usage_count) || 0), 0))
        : Number(promotion.remaining_uses),
    loyalty_points_cost: promotion.loyalty_points_cost === null || promotion.loyalty_points_cost === undefined
        ? null
        : Number(promotion.loyalty_points_cost),
});

@Injectable()
export class NestPromotionsService {
    constructor(private readonly promotionsRepository: PromotionsRepository) {}

    async getPromotions(): Promise<ReturnType<typeof normalizePromotion>[]> {
        return new Promise((resolve, reject) => {
            this.promotionsRepository.getPromotions((err: DbError | null, results: PromotionRow[]) => {
                if (err) return reject(err);
                resolve((results || []).map(normalizePromotion));
            });
        });
    }

    async createPromotion(data: PromotionInput, actorId: string) {
        const promotion = normalizePromotionPayload(data);
        try {
            const result = await this.promotionsRepository.createPromotionForAdmin(promotion, actorId);
            return { id: result.insertId, ...promotion };
        } catch (error) {
            throw normalizeDatabaseError(error as PromotionError);
        }
    }

    async updatePromotion(id: number | string, data: PromotionInput, actorId: string) {
        const promotion = normalizePromotionPayload(data);
        try {
            const result = await this.promotionsRepository.updatePromotionForAdmin(id, promotion, actorId);
            if (result.affectedRows === 0) throw createHttpError("Promotion not found", HTTP_STATUS.NOT_FOUND);
            return { id: Number(id), ...promotion };
        } catch (error) {
            throw normalizeDatabaseError(error as PromotionError);
        }
    }

    async deletePromotion(id: number | string, actorId: string) {
        try {
            const result = await this.promotionsRepository.deactivatePromotionForAdmin(id, actorId);
            if (result.affectedRows === 0) throw createHttpError("Promotion not found", HTTP_STATUS.NOT_FOUND);
            return { id: Number(id), active: false };
        } catch (error) {
            throw normalizeDatabaseError(error as PromotionError);
        }
    }
}
