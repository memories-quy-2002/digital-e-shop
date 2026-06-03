import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export const validateRequest = (schema: ZodType, source: "body" | "query" | "params" = "body") => {
    return (req: Request, _res: Response, next: NextFunction) => {
        req[source] = schema.parse(req[source]);
        next();
    };
};
