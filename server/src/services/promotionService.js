const Promotion = require("../models/promotionModel");

const normalizeDateInput = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace("T", " ");
};

const normalizePromotionPayload = (data) => {
    const discountCode = String(data.discountCode || data.discount_code || "").trim().toUpperCase();
    const discountPercent = Number(data.discountPercent ?? data.discount_percent);
    const minOrderValue = Number(data.minOrderValue ?? data.min_order_value ?? 0);
    const usageLimitValue = data.usageLimit ?? data.usage_limit;
    const usageLimit = usageLimitValue === "" || usageLimitValue === null || usageLimitValue === undefined ? null : Number(usageLimitValue);

    if (!discountCode || Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
        throw Object.assign(new Error("Code and discount percent must be valid"), { statusCode: 400 });
    }

    if (Number.isNaN(minOrderValue) || minOrderValue < 0) {
        throw Object.assign(new Error("Minimum order value cannot be negative"), { statusCode: 400 });
    }

    if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 1)) {
        throw Object.assign(new Error("Usage limit must be empty or greater than zero"), { statusCode: 400 });
    }

    return {
        discountCode,
        discountPercent,
        active: data.active === false || data.active === 0 || data.active === "0" ? 0 : 1,
        minOrderValue,
        startsAt: normalizeDateInput(data.startsAt ?? data.starts_at),
        expiresAt: normalizeDateInput(data.expiresAt ?? data.expires_at),
        usageLimit,
    };
};

const normalizePromotion = (promotion = {}) => ({
    id: Number(promotion.id),
    discount_code: promotion.discount_code,
    discount_percent: Number(promotion.discount_percent) || 0,
    active: Boolean(Number(promotion.active ?? 1)),
    min_order_value: Number(promotion.min_order_value) || 0,
    starts_at: promotion.starts_at,
    expires_at: promotion.expires_at,
    usage_limit: promotion.usage_limit === null ? null : Number(promotion.usage_limit) || null,
});

async function getPromotions() {
    return new Promise((resolve, reject) => {
        Promotion.getPromotions((err, results) => {
            if (err) return reject(err);
            resolve((results || []).map(normalizePromotion));
        });
    });
}

async function createPromotion(data) {
    const promotion = normalizePromotionPayload(data);
    return new Promise((resolve, reject) => {
        Promotion.createPromotion(promotion, (err, result) => {
            if (err) return reject(err);
            resolve({ id: result.insertId, ...promotion });
        });
    });
}

async function updatePromotion(id, data) {
    const promotion = normalizePromotionPayload(data);
    return new Promise((resolve, reject) => {
        Promotion.updatePromotion(id, promotion, (err, result) => {
            if (err) return reject(err);
            if (result.affectedRows === 0) return reject(Object.assign(new Error("Promotion not found"), { statusCode: 404 }));
            resolve({ id: Number(id), ...promotion });
        });
    });
}

async function deletePromotion(id) {
    return new Promise((resolve, reject) => {
        Promotion.deletePromotion(id, (err, result) => {
            if (err) return reject(err);
            if (result.affectedRows === 0) return reject(Object.assign(new Error("Promotion not found"), { statusCode: 404 }));
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
