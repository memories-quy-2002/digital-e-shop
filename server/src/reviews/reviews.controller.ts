import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestReviewsService } from "./reviews.service";

import * as reviewsValidator from "./reviews.validator";
const { reviewListQuerySchema } = reviewsValidator;

@Controller("reviews")
export class ReviewsController {
    constructor(private readonly reviewsService: NestReviewsService) {}

    @Get(":pid")
    async getReviews(@Param("pid") pidParam: string, @Query() query: Record<string, unknown>) {
        const { pid, page, limit } = new ZodValidationPipe(reviewListQuerySchema).transform({
            ...query,
            pid: pidParam,
        });

        try {
            const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
            const safeLimit = usePagination ? Math.min(limit, 50) : null;
            const offset = usePagination ? (page - 1) * safeLimit : 0;
            const summary = await this.reviewsService.getRatingSummary(pid);

            if (usePagination) {
                const [results, total] = await Promise.all([
                    this.reviewsService.getReviewsPaginated(pid, safeLimit as number, offset),
                    this.reviewsService.getReviewsCount(pid),
                ]);

                return {
                    reviews: results,
                    summary,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / (safeLimit as number)),
                    },
                    msg: "Reviews have been retrieved successfully",
                };
            }

            const results = await this.reviewsService.getReviews(pid);
            return { reviews: results, summary, msg: "Reviews have been retrieved successfully" };
        } catch (err) {
            const error = err as Error;
            throw new HttpException({ msg: "Internal server error", error: error.message }, 500);
        }
    }

    @Post()
    @HttpCode(201)
    @UseGuards(AuthGuard, RolesGuard)
    @OwnerParam("uid")
    async addReview(@Body(new ZodValidationPipe(reviewsValidator.createReviewSchema)) body: {
        uid: string;
        pid: number;
        rating: number;
        comment?: string;
        reviewText?: string;
    }) {
        const { uid, pid, rating, comment, reviewText } = body;
        const safeComment = String(comment || reviewText || "").trim();
        try {
            return await this.reviewsService.addReview(uid, pid, rating, safeComment);
        } catch (err) {
            const error = err as Error;
            throw new HttpException({ msg: "Internal server error", error: error.message }, 500);
        }
    }
}
