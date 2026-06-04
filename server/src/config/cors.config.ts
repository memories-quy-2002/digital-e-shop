import { env, isProduction } from "#src/config/env.config";

export const defaultClientOrigin =
    env.clientUrl || (isProduction ? "https://digital-e.vercel.app" : "http://localhost:5173");

export const defaultServerOrigin =
    env.serverUrl || (isProduction ? "https://e-commerce-express-server-app.vercel.app" : "http://localhost:4000");

export const allowedOrigins = Array.from(
    new Set(
        [
            "http://localhost:5173",
            "https://digital-e.vercel.app",
            env.clientUrl,
        ].filter(Boolean),
    ),
);

