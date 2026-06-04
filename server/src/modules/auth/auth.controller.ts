import type { NextFunction, Request, Response } from "express";
import { BaseController } from "#src/core/base/BaseController";
import { asyncHandler } from "#src/core/middlewares/asyncHandler";
import { defaultClientOrigin } from "#src/config/cors.config";
import { env, isProduction } from "#src/config/env.config";
import { authService } from "./auth.service";
import type { AuthSessionPayload, SocialAuthProfile } from "./auth.types";

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

const setAuthCookies = (
    res: Response,
    payload: AuthSessionPayload,
    rememberMe: boolean,
) => {
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

const redirectToClient = (res: Response, path: string) => {
    res.redirect(`${defaultClientOrigin}${path}`);
};

const clearAuthCookies = (res: Response) => {
    res.clearCookie("session", baseCookieOptions);
    res.clearCookie("userInfo", baseCookieOptions);
    res.clearCookie("accessToken", baseCookieOptions);
    res.clearCookie("refreshToken", baseCookieOptions);
};

const getSocialAuthFailurePath = (message?: string) => {
    const code =
        message === "Admin accounts must use email login"
            ? "admin-only-local"
            : message === "An account already exists with this email. Use email login to continue."
                ? "email-exists"
                : message === "Account is suspended"
                    ? "account-suspended"
                    : "failed";

    return `/login?socialAuth=${encodeURIComponent(code)}`;
};

class AuthController extends BaseController {
    registerUser = asyncHandler(async (req: Request, res: Response) => {
        const { uid, user } = req.body as { uid: string; user: { username: string; email: string; password: string; role: string } };
        const { uid: newUid, token, sessionId } = await authService.registerUser(uid, user);

        res.cookie("session", sessionId, withMaxAge(THIRTY_DAYS));
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), withMaxAge(THIRTY_DAYS));
        res.cookie("accessToken", token, withMaxAge(THIRTY_DAYS));

        return res.status(200).json({ uid: newUid, token, msg: "User created successfully" });
    });

    userLogin = asyncHandler(async (req: Request, res: Response) => {
        const { uid, role, rememberMe } = req.body as { uid: string; role?: string; rememberMe?: boolean };
        const { user, token: accessToken, sessionId, refreshToken } = await authService.loginUser(uid, role, rememberMe);
        setAuthCookies(res, { user, token: accessToken, sessionId, refreshToken }, Boolean(rememberMe));

        return res.status(200).json({
            userData: user,
            token: accessToken,
            msg: "Login successfully",
        });
    });

    userRefreshToken = asyncHandler(async (req: Request, res: Response) => {
        const refreshTokenCookie = req.cookies.refreshToken;
        if (!refreshTokenCookie) {
            return res.status(401).json({ msg: "No refresh token" });
        }

        try {
            const newAccessToken = await authService.refreshToken(refreshTokenCookie);
            return res.status(200).json({
                token: newAccessToken,
                msg: "Token refreshed successfully",
            });
        } catch {
            return res.status(403).json({ msg: "Invalid refresh token" });
        }
    });

    userLogout = asyncHandler(async (req: Request, res: Response) => {
        const sessionId = req.cookies.session;

        if (!sessionId || sessionId === "undefined") {
            clearAuthCookies(res);
            return res.status(200).json({ msg: "You have been logout successfully (no session)" });
        }

        const session = await authService.endSession(sessionId);
        clearAuthCookies(res);

        if (!session) {
            return res.status(200).json({ msg: "You have been logout successfully (session not found)" });
        }

        return res.status(200).json({ msg: "You have been logout successfully" });
    });

    checkSessionToken = asyncHandler(async (req: Request, res: Response) => {
        const { valid, message } = await authService.verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ sessionActive: false, msg: message });
        }

        return res.status(200).json({ sessionActive: true, msg: "Session is valid" });
    });

    ensureGoogleProviderEnabled = (_req: Request, res: Response, next: NextFunction) => {
        if (!env.googleClientId || !env.googleClientSecret) {
            return res.redirect(`${defaultClientOrigin}/login?socialAuth=${encodeURIComponent("google-unavailable")}`);
        }

        return next();
    };

    completeSocialLogin = async (req: Request, res: Response, _next: NextFunction, authError?: Error | null, socialProfile?: SocialAuthProfile) => {
        if (authError) {
            clearAuthCookies(res);
            redirectToClient(res, getSocialAuthFailurePath(authError.message));
            return;
        }

        if (!socialProfile) {
            clearAuthCookies(res);
            redirectToClient(res, getSocialAuthFailurePath());
            return;
        }

        try {
            const { user, token, sessionId, refreshToken } = await authService.loginWithSocialProfile(socialProfile);
            setAuthCookies(res, { user, token, sessionId, refreshToken }, false);
            redirectToClient(res, user.role === "Admin" ? "/admin" : "/");
        } catch (err) {
            const error = err as Error;
            clearAuthCookies(res);
            redirectToClient(res, getSocialAuthFailurePath(error.message));
        }
    };
}

export const authController = new AuthController();

