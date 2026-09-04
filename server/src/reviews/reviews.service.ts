import { Injectable } from "@nestjs/common";
import type { DbError } from "#src/shared/interfaces/domain";
import type { RatingSummaryRow, ReviewRow } from "./reviews.types";
import { ReviewsRepository } from "./reviews.repository";

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

@Injectable()
export class NestReviewsService {
    constructor(private readonly reviewsRepository: ReviewsRepository) {}

    async addReview(uid: string, pid: number, rating: number, comment: string) {
        const safeRating = Number(rating);
        const safeComment = String(comment || "").trim();

        return new Promise((resolve, reject) => {
            this.reviewsRepository.getReviewByUserAndProduct(uid, pid, (findErr: DbError | null, existingRows: ReviewRow[]) => {
                if (findErr) return reject(findErr);

                const saveCallback = (saveErr: DbError | null) => {
                    if (saveErr) return reject(saveErr);

                    this.reviewsRepository.getRatingSummary(pid, (summaryErr: DbError | null, summaryRows: RatingSummaryRow[]) => {
                        if (summaryErr) return reject(summaryErr);
                        resolve({
                            summary: normalizeSummary(summaryRows[0]),
                            msg: existingRows.length > 0 ? "Review updated successfully" : "Review added successfully",
                        });
                    });
                };

                if (existingRows.length > 0) {
                    this.reviewsRepository.updateReviewByUserAndProduct(uid, pid, safeRating, safeComment, saveCallback);
                    return;
                }

                this.reviewsRepository.addReviewByUserId(uid, pid, safeRating, safeComment, saveCallback);
            });
        });
    }

    getReviews(pid: number): Promise<Array<ReviewRow & { verified_purchase: boolean }>> {
        return new Promise((resolve, reject) => {
            this.reviewsRepository.getReviews(pid, (err: DbError | null, results: ReviewRow[]) => {
                if (err) return reject(err);
                resolve((results || []).map((review: ReviewRow) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
            });
        });
    }

    getReviewsPaginated(pid: number, limit: number, offset: number): Promise<Array<ReviewRow & { verified_purchase: boolean }>> {
        return new Promise((resolve, reject) => {
            this.reviewsRepository.getReviewsPaginated(pid, limit, offset, (err: DbError | null, results: ReviewRow[]) => {
                if (err) return reject(err);
                resolve((results || []).map((review: ReviewRow) => ({ ...review, verified_purchase: Boolean(review.verified_purchase) })));
            });
        });
    }

    getReviewsCount(pid: number): Promise<number> {
        return new Promise((resolve, reject) => {
            this.reviewsRepository.getReviewsCount(pid, (err: DbError | null, results: { total?: number }[]) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
            });
        });
    }

    getRatingSummary(pid: number): Promise<ReturnType<typeof normalizeSummary>> {
        return new Promise((resolve, reject) => {
            this.reviewsRepository.getRatingSummary(pid, (err: DbError | null, results: RatingSummaryRow[]) => {
                if (err) return reject(err);
                resolve(normalizeSummary(results[0]));
            });
        });
    }
}
