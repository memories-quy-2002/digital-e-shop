const Review = require("../models/reviewModel");

const normalizeSummary = (row = {}) => ({
    total: Number(row.total) || 0,
    average: Number(row.average) || 0,
    distribution: {
        5: Number(row.five) || 0,
        4: Number(row.four) || 0,
        3: Number(row.three) || 0,
        2: Number(row.two) || 0,
        1: Number(row.one) || 0,
    },
});

async function addReview(uid, pid, rating, comment) {
    const safeRating = Number(rating);
    const safeComment = String(comment || "").trim();

    return new Promise((resolve, reject) => {
        Review.getReviewByUserAndProduct(uid, pid, (findErr, existingRows) => {
            if (findErr) return reject(findErr);

            const saveCallback = (saveErr) => {
                if (saveErr) return reject(saveErr);

                Review.getRatingSummary(pid, (summaryErr, summaryRows) => {
                    if (summaryErr) return reject(summaryErr);
                    resolve({
                        summary: normalizeSummary(summaryRows[0]),
                        msg: existingRows.length > 0 ? "Review updated successfully" : "Review added successfully",
                    });
                });
            };

            if (existingRows.length > 0) {
                Review.updateReviewByUserAndProduct(uid, pid, safeRating, safeComment, saveCallback);
                return;
            }

            Review.addReviewByUserId(uid, pid, safeRating, safeComment, saveCallback);
        });
    });
}

async function getReviews(pid) {
    return new Promise((resolve, reject) => {
        Review.getReviews(pid, (err, results) => {
            if (err) return reject(err);
            resolve((results || []).map((review) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
        });
    });
}

async function getReviewsPaginated(pid, limit, offset) {
    return new Promise((resolve, reject) => {
        Review.getReviewsPaginated(pid, limit, offset, (err, results) => {
            if (err) return reject(err);
            resolve((results || []).map((review) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
        });
    });
}

async function getReviewsCount(pid) {
    return new Promise((resolve, reject) => {
        Review.getReviewsCount(pid, (err, results) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function getRatingSummary(pid) {
    return new Promise((resolve, reject) => {
        Review.getRatingSummary(pid, (err, results) => {
            if (err) return reject(err);
            resolve(normalizeSummary(results[0]));
        });
    });
}

module.exports = {
    addReview,
    getReviews,
    getReviewsPaginated,
    getReviewsCount,
    getRatingSummary,
};
