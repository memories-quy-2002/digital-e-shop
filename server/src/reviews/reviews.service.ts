import { Injectable } from "@nestjs/common";
import type { DbError } from "#src/shared/interfaces/domain";
import type { RatingSummaryRow, ReviewRow } from "./reviews.types";
import { ReviewsRepository } from "./reviews.repository";
import { HTTP_STATUS } from "#src/shared/constants/http-status";

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

        const eligible = await this.reviewsRepository.hasCompletedPurchase(uid, pid);
        if (!eligible) {
            throw Object.assign(new Error("You can review this product after a completed order."), { statusCode: HTTP_STATUS.FORBIDDEN });
        }

        const inserted = await this.reviewsRepository.saveReviewForUser(uid, pid, safeRating, safeComment);
        const summary = await new Promise<RatingSummaryRow[]>((resolve, reject) => {
            this.reviewsRepository.getRatingSummary(pid, (error: DbError | null, rows: RatingSummaryRow[]) => {
                if (error) return reject(error);
                resolve(rows);
            });
        });
        return {
            summary: normalizeSummary(summary[0]),
            msg: inserted ? "Review added successfully" : "Review updated successfully",
        };
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
