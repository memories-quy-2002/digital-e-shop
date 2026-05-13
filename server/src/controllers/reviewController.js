const reviewService = require("../services/reviewService");

const addReview = async (req, res) => {
    const { uid, pid, rating, comment, reviewText } = req.body;
    const safeRating = Number(rating);
    const safeProductId = Number(pid);
    const safeComment = String(comment || reviewText || "").trim();

    if (!uid || !Number.isInteger(safeProductId) || safeProductId <= 0) {
        return res.status(400).json({ msg: "User and product are required" });
    }

    if (!Number.isInteger(safeRating) || safeRating < 1 || safeRating > 5) {
        return res.status(400).json({ msg: "Rating must be between 1 and 5" });
    }

    if (!safeComment) {
        return res.status(400).json({ msg: "Please write a review before submitting" });
    }

    try {
        const result = await reviewService.addReview(uid, safeProductId, safeRating, safeComment);
        return res.status(201).json(result);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
    }
};

async function getReviews(req, res) {
    const pid = Number(req.params.pid);

    if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ msg: "Invalid product id" });
    }

    try {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
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
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
    }
}

module.exports = {
    addReview,
    getReviews,
};
