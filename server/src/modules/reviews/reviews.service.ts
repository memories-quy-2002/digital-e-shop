const Review = require("./reviews.repository");
import type { CountRow, DbError } from "#/shared/interfaces/domain";
import type { RatingSummaryRow, ReviewRow } from "./reviews.types";

const normalizeSummary = (row: RatingSummaryRow = {}) => ({
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

async function addReview(uid: string, pid: number, rating: number, comment: string) {
    const safeRating = Number(rating);
    const safeComment = String(comment || "").trim();

    return new Promise((resolve, reject) => {
        Review.getReviewByUserAndProduct(uid, pid, (findErr: DbError | null, existingRows: ReviewRow[]) => {
            if (findErr) return reject(findErr);

            const saveCallback = (saveErr: DbError | null) => {
                if (saveErr) return reject(saveErr);

                Review.getRatingSummary(pid, (summaryErr: DbError | null, summaryRows: RatingSummaryRow[]) => {
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

async function getReviews(pid: number): Promise<Array<ReviewRow & { verified_purchase: boolean }>> {
    return new Promise((resolve, reject) => {
        Review.getReviews(pid, (err: DbError | null, results: ReviewRow[]) => {
            if (err) return reject(err);
            resolve((results || []).map((review: ReviewRow) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
        });
    });
}

async function getReviewsPaginated(pid: number, limit: number, offset: number): Promise<Array<ReviewRow & { verified_purchase: boolean }>> {
    return new Promise((resolve, reject) => {
        Review.getReviewsPaginated(pid, limit, offset, (err: DbError | null, results: ReviewRow[]) => {
            if (err) return reject(err);
            resolve((results || []).map((review: ReviewRow) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
        });
    });
}

async function getReviewsCount(pid: number): Promise<number> {
    return new Promise((resolve, reject) => {
        Review.getReviewsCount(pid, (err: DbError | null, results: CountRow[]) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function getRatingSummary(pid: number): Promise<ReturnType<typeof normalizeSummary>> {
    return new Promise((resolve, reject) => {
        Review.getRatingSummary(pid, (err: DbError | null, results: RatingSummaryRow[]) => {
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
