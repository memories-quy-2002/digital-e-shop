import { env, isProduction } from "#src/config/env.config";

export const defaultClientOrigin =
    env.clientUrl || (isProduction ? "https://digital-e.vercel.app" : "http://localhost:5173");

export const defaultServerOrigin =
    env.serverUrl || (isProduction ? "https://e-commerce-express-server-app.vercel.app" : "http://localhost:4000");

type AllowedOriginsOptions = {
    clientUrl?: string;
    isProduction?: boolean;
};

export const resolveAllowedOrigins = ({ clientUrl, isProduction = false }: AllowedOriginsOptions = {}) =>
    Array.from(new Set([
        clientUrl || (isProduction ? "https://digital-e.vercel.app" : "http://localhost:5173"),
    ].filter(Boolean)));

export const allowedOrigins = resolveAllowedOrigins({
    clientUrl: env.clientUrl,
    isProduction,
});

const localOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export const isAllowedOrigin = (origin?: string) =>
    !origin || allowedOrigins.includes(origin) || (!isProduction && localOriginPattern.test(origin));

