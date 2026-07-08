import { describe, expect, it, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { ReviewsModule } from "../reviews.module";
import { ReviewsController } from "../reviews.controller";
import { NestReviewsService } from "../reviews.service";
import { AuthModule } from "../../auth/auth.module";
import { NestAuthService } from "../../auth/auth.service";
import { UsersRepository } from "../../users/users.repository";

vi.mock("#src/config/database.config", () => ({
    default: { query: vi.fn() },
}));

describe("ReviewsController", () => {
    let controller: ReviewsController;
    let service: NestReviewsService;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [ReviewsModule, AuthModule],
        })
            .overrideProvider(NestAuthService)
            .useValue({ verifySessionToken: vi.fn().mockResolvedValue({ valid: true }) })
            .overrideProvider(UsersRepository)
            .useValue({ findById: vi.fn() })
            .compile();

        controller = moduleRef.get(ReviewsController);
        service = moduleRef.get(NestReviewsService);
    });

    it("module compiles with the guards, pipes, and rate-limit middleware wired without error", () => {
        expect(controller).toBeDefined();
    });

    it("getReviews returns the non-paginated response shape when no page/limit given", async () => {
        vi.spyOn(service, "getRatingSummary").mockResolvedValue({ total: 1, average: 5 } as never);
        vi.spyOn(service, "getReviews").mockResolvedValue([{ id: 1 }] as never);

        const result = await controller.getReviews("10", {});

        expect(service.getRatingSummary).toHaveBeenCalledWith(10);
        expect(service.getReviews).toHaveBeenCalledWith(10);
        expect(result).toEqual({
            reviews: [{ id: 1 }],
            summary: { total: 1, average: 5 },
            msg: "Reviews have been retrieved successfully",
        });
    });

    it("getReviews returns the paginated response shape when page/limit given", async () => {
        vi.spyOn(service, "getRatingSummary").mockResolvedValue({ total: 2, average: 4 } as never);
        vi.spyOn(service, "getReviewsPaginated").mockResolvedValue([{ id: 1 }] as never);
        vi.spyOn(service, "getReviewsCount").mockResolvedValue(2 as never);

        const result = await controller.getReviews("10", { page: "1", limit: "1" });

        expect(service.getReviewsPaginated).toHaveBeenCalledWith(10, 1, 0);
        expect(result).toEqual({
            reviews: [{ id: 1 }],
            summary: { total: 2, average: 4 },
            pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
            msg: "Reviews have been retrieved successfully",
        });
    });

    it("addReview trims comment/reviewText and delegates to the service", async () => {
        vi.spyOn(service, "addReview").mockResolvedValue({ msg: "Review added successfully" } as never);

        const result = await controller.addReview({ uid: "42", pid: 10, rating: 5, comment: "  great  " });

        expect(service.addReview).toHaveBeenCalledWith("42", 10, 5, "great");
        expect(result).toEqual({ msg: "Review added successfully" });
    });
});
