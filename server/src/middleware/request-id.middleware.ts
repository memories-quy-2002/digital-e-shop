import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const resolveRequestId = (value: unknown): string => {
    const candidate = Array.isArray(value) ? value[0] : value;
    return typeof candidate === "string" && requestIdPattern.test(candidate) ? candidate : randomUUID();
};

export const requestIdMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
};
