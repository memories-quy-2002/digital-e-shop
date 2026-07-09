import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { isProduction } from "#src/config/env.config";
import { NestAuthService } from "./auth.service";
import { registerUserSchema, userLoginSchema } from "./auth.validator";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import type { AuthSessionPayload } from "./auth.types";

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
        const { valid, message } = await this.authService.verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ sessionActive: false, msg: message });
        }
        return res.status(200).json({ sessionActive: true, msg: "Session is valid" });
    }

    @Post("register")
    @HttpCode(HttpStatus.OK)
    async registerUser(
        @Body(new ZodValidationPipe(registerUserSchema)) body: { uid: string; user: { username: string; email: string; password: string; role: string } },
        @Res() res: Response,
    ) {
        const { uid, user } = body;
        const { uid: newUid, token, sessionId } = await this.authService.registerUser(uid, user);

        res.cookie("session", sessionId, withMaxAge(THIRTY_DAYS));
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), withMaxAge(THIRTY_DAYS));
        res.cookie("accessToken", token, withMaxAge(THIRTY_DAYS));

        return res.status(200).json({ uid: newUid, token, msg: "User created successfully" });
    }

    @Post("login")
    @HttpCode(HttpStatus.OK)
    async userLogin(
        @Body(new ZodValidationPipe(userLoginSchema)) body: { uid: string; role?: string; rememberMe?: boolean },
        @Res() res: Response,
    ) {
        const { uid, role, rememberMe } = body;
        const { user, token: accessToken, sessionId, refreshToken } = await this.authService.loginUser(uid, role, rememberMe);
        setAuthCookies(res, { user, token: accessToken, sessionId, refreshToken }, Boolean(rememberMe));

        return res.status(200).json({
            userData: user,
            token: accessToken,
            msg: "Login successfully",
        });
    }

    @Post("refresh")
    @HttpCode(HttpStatus.OK)
    async userRefreshToken(@Req() req: Request, @Res() res: Response) {
        const refreshTokenCookie = req.cookies.refreshToken;
        if (!refreshTokenCookie) {
            return res.status(401).json({ msg: "No refresh token" });
        }

        try {
            const newAccessToken = await this.authService.refreshToken(refreshTokenCookie);
            return res.status(200).json({
                token: newAccessToken,
                msg: "Token refreshed successfully",
            });
        } catch {
            return res.status(403).json({ msg: "Invalid refresh token" });
        }
    }

    @Post("logout")
    @HttpCode(HttpStatus.OK)
    async userLogout(@Req() req: Request, @Res() res: Response) {
        const sessionId = req.cookies.session;

        if (!sessionId || sessionId === "undefined") {
            clearAuthCookies(res);
            return res.status(200).json({ msg: "You have been logout successfully (no session)" });
        }

        const session = await this.authService.endSession(sessionId);
        clearAuthCookies(res);

        if (!session) {
            return res.status(200).json({ msg: "You have been logout successfully (session not found)" });
        }

        return res.status(200).json({ msg: "You have been logout successfully" });
    }

    @Get("csrf")
    @HttpCode(HttpStatus.OK)
    async getCsrfToken(@Req() req: Request, @Res() res: Response) {
        const { generateCsrfToken } = await import("#src/middleware/csrf.middleware");
        const token = generateCsrfToken(req as Request, res as Response);
        return res.status(HttpStatus.OK).json({ csrfToken: token });
    }
}
