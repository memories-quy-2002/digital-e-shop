import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
const reviewService = require("./reviews.service");
const { createReviewSchema, reviewListQuerySchema } = require("./reviews.validator");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");

const addReview = async (req: AppRequest, res: AppResponse) => {
    let payload;
    try {
        payload = parseBody(createReviewSchema, req.body);
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }
    const { uid, pid, rating, comment, reviewText } = payload;
    const safeRating = Number(rating);
    const safeProductId = Number(pid);
    const safeComment = String(comment || reviewText || "").trim();

    try {
        const result = await reviewService.addReview(uid, safeProductId, safeRating, safeComment);
        return res.status(201).json(result);
    } catch (err) {
        const error = err as Error;
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: error.message });
    }
};

async function getReviews(req: AppRequest, res: AppResponse) {
    try {
        const { pid, page, limit } = parseBody(reviewListQuerySchema, { ...req.query, pid: req.params.pid });
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 50) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;
        const summary = await reviewService.getRatingSummary(pid);

        if (usePagination) {
            const [results, total] = await Promise.all([
                reviewService.getReviewsPaginated(pid, safeLimit, offset),
                reviewService.getReviewsCount(pid),
            ]);

            return res.status(200).json({
                reviews: results,
                summary,
                pagination: {
                    page,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Reviews have been retrieved successfully",
            });
        }

        const results = await reviewService.getReviews(pid);
        return res.status(200).json({
            reviews: results,
            summary,
            msg: "Reviews have been retrieved successfully",
        });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        const error = err as Error;
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: error.message });
    }
}

module.exports = {
    addReview,
    getReviews,
};

