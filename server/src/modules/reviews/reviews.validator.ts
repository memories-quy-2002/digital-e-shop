import { z } from "zod";

const positiveInt = (field: string) => z.coerce.number({ error: `${field} must be a number` }).int(`${field} must be a whole number`).positive(`${field} must be greater than zero`);
const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);

export const createReviewSchema = z.object({
    uid: requiredText("User id"),
    pid: positiveInt("Product id"),
    rating: z.coerce.number().int("Rating must be a whole number").min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
    comment: z.string().trim().optional(),
    reviewText: z.string().trim().optional(),
}).superRefine((data, context) => {
    const content = String(data.comment || data.reviewText || "").trim();
    if (!content) {
        context.addIssue({ code: "custom", path: ["comment"], message: "Please write a review before submitting" });
    }
});

export const reviewListQuerySchema = z.object({
    pid: positiveInt("Product id"),
    page: z.union([z.coerce.number().int().positive(), z.undefined()]).optional(),
    limit: z.union([z.coerce.number().int().positive(), z.undefined()]).optional(),
});
