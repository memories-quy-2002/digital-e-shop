import { Router } from "express";
import passport from "#/modules/auth/auth.passport";
import rateLimit from "express-rate-limit";
import { getRouteLimit } from "#/shared/utils/rateLimit";
import { authController } from "./auth.controller";
import { validateRequest } from "#/core/middlewares/validateRequest";
import { registerUserSchema, userLoginSchema } from "./auth.validator";

const router = Router();

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get(
    "/auth/google",
    userLimiter,
    authController.ensureGoogleProviderEnabled,
    passport.authenticate("google", { scope: ["profile", "email"], session: false }),
);

router.get(
    "/auth/google/callback",
    userLimiter,
    authController.ensureGoogleProviderEnabled,
    (req, res, next) =>
        passport.authenticate("google", { session: false }, (err: Error | null, user?: Parameters<typeof authController.completeSocialLogin>[4]) =>
            authController.completeSocialLogin(req, res, next, err, user))(req, res, next),
);

router.get("/session/check", userLimiter, authController.checkSessionToken);
router.post("/register", userLimiter, validateRequest(registerUserSchema), authController.registerUser);
router.post("/login", userLimiter, validateRequest(userLoginSchema), authController.userLogin);
router.post("/refresh", userLimiter, authController.userRefreshToken);
router.post("/logout", userLimiter, authController.userLogout);

export default router;
