import type { Request, Response, NextFunction, RequestHandler } from "express";
import { doubleCsrf } from "csrf-csrf";
import { env, isProduction } from "#src/config/env.config";

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => env.csrfSecret,
    getSessionIdentifier: (req: Request) => String(req.cookies?.session || req.ip || "anonymous"),
    cookieName: "csrfToken",
    cookieOptions: {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getCsrfTokenFromRequest: (req: Request) => String(req.headers["x-csrf-token"] || ""),
});

export const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    doubleCsrfProtection(req, res, next);
};

export const createCsrfMiddleware = (): RequestHandler => csrfProtection;

export const CsrfError = invalidCsrfTokenError;

export { generateCsrfToken };
