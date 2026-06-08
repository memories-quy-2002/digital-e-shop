import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
import { logger } from "#src/shared/utils/logger";
const promotionService = require("./promotions.service");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");
const { promotionSchema } = require("./promotions.validator");

async function getPromotions(req: AppRequest, res: AppResponse) {
    try {
        const promotions = await promotionService.getPromotions();
        return res.status(200).json({ promotions, msg: "Promotions retrieved successfully" });
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
}

async function createPromotion(req: AppRequest, res: AppResponse) {
    try {
        const payload = parseBody(promotionSchema, req.body);
        const promotion = await promotionService.createPromotion(payload);
        return res.status(201).json({ promotion, msg: "Promotion created successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

async function updatePromotion(req: AppRequest, res: AppResponse) {
    try {
        const payload = parseBody(promotionSchema, req.body);
        const promotion = await promotionService.updatePromotion(req.params.id, payload);
        return res.status(200).json({ promotion, msg: "Promotion updated successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

async function deletePromotion(req: AppRequest, res: AppResponse) {
    try {
        const promotion = await promotionService.deletePromotion(req.params.id);
        return res.status(200).json({ promotion, msg: "Promotion deactivated successfully" });
    } catch (err) {
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

module.exports = {
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
};

