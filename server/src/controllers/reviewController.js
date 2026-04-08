const pool = require("../config/db");
const reviewService = require("../services/reviewService");

const addReview = (req, res) => {
    const { uid, pid, rating, comment } = req.body;
    if (!rating) {
        return res.status(400).json({ msg: 'Please provide rating' });
    }
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ msg: 'Rating must be between 1 and 5' });
    }
    try {
        const msg = reviewService.addReview(uid, pid, rating, comment);
        return res.status(201).json({
            msg: msg
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
}

async function getReviews(req, res) {
    const pid = req.params.pid;
    try {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 50) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;

        if (usePagination) {
            const [results, total] = await Promise.all([
                reviewService.getReviewsPaginated(pid, safeLimit, offset),
                reviewService.getReviewsCount(pid),
            ]);
            if (results.length > 0) {
                return res.status(200).json({
                    reviews: results,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                    msg: "Reviews have been retrieved successfully",
                });
            }
            return res.status(204).json({ msg: "No reviews found for this product" });
        }

        const results = await reviewService.getReviews(pid);
        if (results.length > 0) {
            return res.status(200).json({
                reviews: results,
                msg: "Reviews have been retrieved successfully",
            });
        } else {
            return res.status(204).json({ msg: "No reviews found for this product" });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
}

module.exports = {
    addReview,
    getReviews
};
