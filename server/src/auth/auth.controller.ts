import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Optional, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { env, isProduction } from "#src/config/env.config";
import { NestAuthService } from "./auth.service";
import {
    registerUserSchema,
    userLoginSchema,
    verificationConfirmSchema,
    verificationResendSchema,
    passwordResetRequestSchema,
    passwordResetConfirmSchema,
    emailChangeRequestSchema,
    emailChangeConfirmSchema,
    type RegisterUserRequest,
    type UserLoginInput,
} from "./auth.validator";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import type { AuthSessionPayload } from "./auth.types";
import { buildErrorResponse, buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { EmailVerificationService } from "./email-verification.service";
import { PasswordResetService } from "./password-reset.service";
import { EmailChangeService } from "./email-change.service";
import { AuthGuard } from "../guards/auth.guard";
import { toPublicUser } from "../users/user-public";

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
    res.cookie("session", payload.sessionId, baseCookieOptions);
    res.cookie(
        "userInfo",
        JSON.stringify({ uid: payload.user.id, token: payload.token }),
        baseCookieOptions,
    );
    res.cookie("accessToken", payload.token, baseCookieOptions);

    if (payload.refreshToken) {
        res.cookie("refreshToken", payload.refreshToken, rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions);
    } else {
        res.clearCookie("refreshToken", baseCookieOptions);
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
    constructor(
        private readonly authService: NestAuthService,
        @Optional() private readonly emailVerificationService?: EmailVerificationService,
        @Optional() private readonly passwordResetService?: PasswordResetService,
        @Optional() private readonly emailChangeService?: EmailChangeService,
    ) {}

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
        @Body(new ZodValidationPipe(registerUserSchema)) body: RegisterUserRequest,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        let sessionPayload: AuthSessionPayload;
        if ("idToken" in body) {
            if (env.authProvider !== "firebase") {
                throw new BadRequestException({ msg: "Local registration requires email and password" });
            }
            sessionPayload = await this.authService.registerUser(body.idToken, body.user);
        } else {
            if (env.authProvider !== "local") {
                throw new BadRequestException({ msg: "Firebase registration requires an ID token" });
            }
            sessionPayload = await this.authService.registerLocalUser({ ...body.user, email: body.email, password: body.password });
        }
        const { user: createdUser, token } = sessionPayload;
        setAuthCookies(res, sessionPayload, false);

        return res.status(200).json(buildSuccessResponse(
            {
                uid: createdUser.id,
                token,
                userData: createdUser,
                email_verified: createdUser.email_verified === true,
                verification_email_sent: sessionPayload.verificationEmailSent === true,
                msg: "User created successfully",
            },
            requestIdFrom(req),
        ));
    }

    @Post("verification/resend")
    @HttpCode(HttpStatus.ACCEPTED)
    async resendVerification(
        @Body(new ZodValidationPipe(verificationResendSchema)) body: { email: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        await this.emailVerificationService?.resendByEmail(body.email);
        return res.status(HttpStatus.ACCEPTED).json(buildSuccessResponse(
            { msg: "If an account exists, a verification email will be sent." },
            requestIdFrom(req),
        ));
    }

    @Post("verification/confirm")
    @HttpCode(HttpStatus.OK)
    async confirmVerification(
        @Body(new ZodValidationPipe(verificationConfirmSchema)) body: { token: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!this.emailVerificationService) {
            throw new BadRequestException({ msg: "Email verification is unavailable" });
        }
        const result = await this.emailVerificationService.confirm(body.token);
        return res.status(HttpStatus.OK).json(buildSuccessResponse(
            { userData: result.user, email_verified: true, msg: "Email verified successfully" },
            requestIdFrom(req),
        ));
    }

    @Post("password-reset/request")
    @HttpCode(HttpStatus.ACCEPTED)
    async requestPasswordReset(
        @Body(new ZodValidationPipe(passwordResetRequestSchema)) body: { email: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        await this.passwordResetService?.request(body.email);
        return res.status(HttpStatus.ACCEPTED).json(buildSuccessResponse(
            { msg: "If an account matches that email, a reset link is on its way." },
            requestIdFrom(req),
        ));
    }

    @Post("password-reset/confirm")
    @HttpCode(HttpStatus.OK)
    async confirmPasswordReset(
        @Body(new ZodValidationPipe(passwordResetConfirmSchema)) body: { token: string; newPassword: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!this.passwordResetService) {
            throw new BadRequestException({ msg: "Password reset is unavailable" });
        }
        const user = await this.passwordResetService.confirm(body.token, body.newPassword);
        return res.status(HttpStatus.OK).json(buildSuccessResponse(
            { userData: toPublicUser(user), msg: "Password reset successfully" },
            requestIdFrom(req),
        ));
    }

    @Post("email-change/request")
    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    async requestEmailChange(
        @Body(new ZodValidationPipe(emailChangeRequestSchema)) body: { email: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!this.emailChangeService) {
            throw new BadRequestException({ msg: "Email change is unavailable" });
        }
        const userId = String(req.user?.id || "");
        const result = await this.emailChangeService.request(userId, body.email);
        return res.status(HttpStatus.ACCEPTED).json(buildSuccessResponse(
            { ...result, msg: "Check your new email to confirm the change" },
            requestIdFrom(req),
        ));
    }

    @Post("email-change/confirm")
    @HttpCode(HttpStatus.OK)
    async confirmEmailChange(
        @Body(new ZodValidationPipe(emailChangeConfirmSchema)) body: { token: string },
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!this.emailChangeService) {
            throw new BadRequestException({ msg: "Email change is unavailable" });
        }
        const user = await this.emailChangeService.confirm(body.token);
        return res.status(HttpStatus.OK).json(buildSuccessResponse(
            { userData: toPublicUser(user), msg: "Email changed successfully" },
            requestIdFrom(req),
        ));
    }

    @Post("login")
    @HttpCode(HttpStatus.OK)
    async userLogin(
        @Body(new ZodValidationPipe(userLoginSchema)) body: UserLoginInput,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const rememberMe = body.rememberMe;
        let sessionPayload: AuthSessionPayload;

        if ("email" in body) {
            if (env.authProvider !== "local") {
                throw new BadRequestException({ msg: "Firebase login requires an ID token" });
            }
            sessionPayload = await this.authService.loginWithPassword(body.email, body.password, rememberMe);
        } else {
            if (env.authProvider !== "firebase") {
                throw new BadRequestException({ msg: "Local login requires email and password" });
            }
            sessionPayload = await this.authService.loginUser(body.idToken, rememberMe);
        }
        const { user, token: accessToken, sessionId, refreshToken } = sessionPayload;
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
        const sessionId = req.cookies.session;
        if (!refreshTokenCookie || !sessionId) {
            return res.status(401).json(buildErrorResponse({
                statusCode: 401,
                code: "UNAUTHORIZED",
                message: !refreshTokenCookie ? "No refresh token" : "No session",
                requestId: requestIdFrom(req),
            }));
        }

        try {
            const rotated = await this.authService.refreshToken(sessionId, refreshTokenCookie);
            res.cookie("accessToken", rotated.accessToken, baseCookieOptions);
            res.cookie(
                "refreshToken",
                rotated.refreshToken,
                rotated.rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions,
            );
            return res.status(200).json(buildSuccessResponse({
                msg: "Token refreshed successfully",
            }, requestIdFrom(req)));
        } catch {
            res.clearCookie("refreshToken", baseCookieOptions);
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
