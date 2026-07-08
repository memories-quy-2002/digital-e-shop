import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BadRequestException } from "@nestjs/common";
import { ZodValidationPipe } from "../zod-validation.pipe";

describe("ZodValidationPipe", () => {
    const schema = z.object({
        uid: z.string().min(1, "User id is required"),
    });

    it("returns the parsed value when validation succeeds", () => {
        const pipe = new ZodValidationPipe(schema);

        expect(pipe.transform({ uid: "42" })).toEqual({ uid: "42" });
    });

    it("throws a BadRequestException with an { msg } body matching the existing controller contract", () => {
        const pipe = new ZodValidationPipe(schema);

        try {
            pipe.transform({ uid: "" });
            expect.unreachable("expected transform to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestException);
            const response = (err as BadRequestException).getResponse();
            expect(response).toHaveProperty("msg");
            expect(response).not.toHaveProperty("statusCode");
            expect(response).not.toHaveProperty("error");
        }
    });
});
