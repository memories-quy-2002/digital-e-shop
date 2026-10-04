import { z } from "zod";

export const parseBody = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => schema.parse(body);

export const getValidationMessage = (error: unknown) => {
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => issue.message).join("; ");
    }

    return "Invalid request payload";
};
