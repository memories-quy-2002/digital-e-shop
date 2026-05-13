const promotionService = require("../services/promotionService");

async function getPromotions(req, res) {
    try {
        const promotions = await promotionService.getPromotions();
        return res.status(200).json({ promotions, msg: "Promotions retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
}

async function createPromotion(req, res) {
    try {
        const promotion = await promotionService.createPromotion(req.body);
        return res.status(201).json({ promotion, msg: "Promotion created successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

async function updatePromotion(req, res) {
    try {
        const promotion = await promotionService.updatePromotion(req.params.id, req.body);
        return res.status(200).json({ promotion, msg: "Promotion updated successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

async function deletePromotion(req, res) {
    try {
        const promotion = await promotionService.deletePromotion(req.params.id);
        return res.status(200).json({ promotion, msg: "Promotion deactivated successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Internal server error" });
    }
}

module.exports = {
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
};
