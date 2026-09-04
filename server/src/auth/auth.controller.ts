import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { isProduction } from "#src/config/env.config";
import { NestAuthService } from "./auth.service";
import { registerUserSchema, userLoginSchema } from "./auth.validator";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import type { AuthSessionPayload } from "./auth.types";
import { buildErrorResponse, buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

const baseCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
};

const withMaxAge = (maxAge: number) => ({
    ...baseCookieOptions,
    maxAge,
});

const setAuthCookies = (res: Response, payload: AuthSessionPayload, rememberMe: boolean) => {
    const sessionCookieOptions = rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions;

    res.cookie("session", payload.sessionId, sessionCookieOptions);
    res.cookie(
        "userInfo",
        JSON.stringify({ uid: payload.user.id, token: payload.token }),
        rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions,
    );
    res.cookie("accessToken", payload.token, rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions);

    if (rememberMe && payload.refreshToken) {
        res.cookie("refreshToken", payload.refreshToken, withMaxAge(THIRTY_DAYS));
    }
};

const clearAuthCookies = (res: Response) => {
    res.clearCookie("session", baseCookieOptions);
    res.clearCookie("userInfo", baseCookieOptions);
    res.clearCookie("accessToken", baseCookieOptions);
    res.clearCookie("refreshToken", baseCookieOptions);
};

@Controller("users")
export class NestAuthController {
    constructor(private readonly authService: NestAuthService) {}

    @Get("session/check")
    @HttpCode(HttpStatus.OK)
    async checkSession(@Req() req: Request, @Res() res: Response) {
        const requestId = requestIdFrom(req);
        const { valid, message } = await this.authService.verifySessionToken(req);
        if (!valid) {
            return res.status(401).json(buildErrorResponse({
                statusCode: 401,
                code: "UNAUTHORIZED",
                message: message || "Not authenticated",
                details: { sessionActive: false },
                requestId,
            }));
        }
        return res.status(200).json(buildSuccessResponse({ sessionActive: true, msg: "Session is valid" }, requestId));
    }

    @Post("register")
    @HttpCode(HttpStatus.OK)
    async registerUser(
        @Body(new ZodValidationPipe(registerUserSchema)) body: { uid: string; user: { username: string; email: string; password: string; role: string } },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const { uid, user } = body;
        const { uid: newUid, token, sessionId } = await this.authService.registerUser(uid, user);

        res.cookie("session", sessionId, withMaxAge(THIRTY_DAYS));
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), withMaxAge(THIRTY_DAYS));
        res.cookie("accessToken", token, withMaxAge(THIRTY_DAYS));

        return res.status(200).json(buildSuccessResponse(
            { uid: newUid, token, msg: "User created successfully" },
            requestIdFrom(req),
        ));
    }

    @Post("login")
    @HttpCode(HttpStatus.OK)
    async userLogin(
        @Body(new ZodValidationPipe(userLoginSchema)) body: { uid: string; role?: string; rememberMe?: boolean },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const { uid, role, rememberMe } = body;
        const { user, token: accessToken, sessionId, refreshToken } = await this.authService.loginUser(uid, role, rememberMe);
        setAuthCookies(res, { user, token: accessToken, sessionId, refreshToken }, Boolean(rememberMe));

        return res.status(200).json(buildSuccessResponse({
            userData: user,
            token: accessToken,
            msg: "Login successfully",
        }, requestIdFrom(req)));
    }

    @Post("refresh")
    @HttpCode(HttpStatus.OK)
    async userRefreshToken(@Req() req: Request, @Res() res: Response) {
        const refreshTokenCookie = req.cookies.refreshToken;
        if (!refreshTokenCookie) {
            return res.status(401).json(buildErrorResponse({
                statusCode: 401,
                code: "UNAUTHORIZED",
                message: "No refresh token",
                requestId: requestIdFrom(req),
            }));
        }

        try {
            const newAccessToken = await this.authService.refreshToken(refreshTokenCookie);
            return res.status(200).json(buildSuccessResponse({
                token: newAccessToken,
                msg: "Token refreshed successfully",
            }, requestIdFrom(req)));
        } catch {
            return res.status(403).json(buildErrorResponse({
                statusCode: 403,
                code: "INVALID_REFRESH_TOKEN",
                message: "Invalid refresh token",
                requestId: requestIdFrom(req),
            }));
        }
    }

    @Post("logout")
    @HttpCode(HttpStatus.OK)
    async userLogout(@Req() req: Request, @Res() res: Response) {
        const sessionId = req.cookies.session;

        if (!sessionId || sessionId === "undefined") {
            clearAuthCookies(res);
            return res.status(200).json(buildSuccessResponse(
                { msg: "You have been logout successfully (no session)" },
                requestIdFrom(req),
            ));
        }

        const session = await this.authService.endSession(sessionId);
        clearAuthCookies(res);

        if (!session) {
            return res.status(200).json(buildSuccessResponse(
                { msg: "You have been logout successfully (session not found)" },
                requestIdFrom(req),
            ));
        }

        return res.status(200).json(buildSuccessResponse(
            { msg: "You have been logout successfully" },
            requestIdFrom(req),
        ));
    }

    @Get("csrf")
    @HttpCode(HttpStatus.OK)
    async getCsrfToken(@Req() req: Request, @Res() res: Response) {
        const { generateCsrfToken } = await import("#src/middleware/csrf.middleware");
        const token = generateCsrfToken(req as Request, res as Response);
        return res.status(HttpStatus.OK).json(buildSuccessResponse({ csrfToken: token }, requestIdFrom(req)));
    }
}
