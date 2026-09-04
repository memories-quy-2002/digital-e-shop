import type { Express, RequestHandler } from "express";
import { logger } from "#src/shared/utils/logger";

type ScalarModule = {
    apiReference: (options: Record<string, unknown>) => RequestHandler;
};

export function registerScalarDocs(
    app: Pick<Express, "use">,
    openapiSpec: Record<string, unknown>,
    loadScalarModule: () => ScalarModule = () => require("@scalar/express-api-reference"),
) {
    try {
        const { apiReference } = loadScalarModule();
        app.use(
            "/docs",
            apiReference({
                spec: { content: openapiSpec },
                theme: "default",
                layout: "modern",
                showSidebar: true,
                hideDownloadButton: false,
                hideModels: false,
                hideClientButton: true,
                authentication: {
                    preferredSecurityScheme: "cookieAuth",
                    securitySchemes: {
                        cookieAuth: {
                            type: "apiKey",
                            in: "cookie",
                            name: "accessToken",
                        },
                    },
                },
                servers: [
                    { url: "http://localhost:4000", description: "Local development" },
                    { url: "https://e-commerce-express-server-app.vercel.app", description: "Production" },
                ],
                tagsSorter: "alpha",
                operationsSorter: "alpha",
            }),
        );
    } catch (err) {
        logger.error({ err: (err as Error).message }, "Failed to mount Scalar API reference UI");
    }
}
