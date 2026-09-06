import "reflect-metadata";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { isAllowedOrigin } from "#src/config/cors.config";
import { registerScalarDocs } from "#src/config/scalarDocs";
import { requestIdMiddleware } from "#src/middleware/request-id.middleware";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import fs from "node:fs";
import path from "node:path";

const openapiSpec = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "docs", "openapi.json"), "utf8"),
);

let cachedApp: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

export async function configureHttpApp<T extends INestApplication>(app: T): Promise<T> {
    const expressApp = app.getHttpAdapter().getInstance();

    expressApp.use(requestIdMiddleware);
    expressApp.use(cookieParser());
    expressApp.use(cors({
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
        exposedHeaders: ["X-Request-Id"],
    }));

    expressApp.get("/api/openapi.json", (_req: express.Request, res: express.Response) => {
        res.status(200).json(openapiSpec);
    });

    registerScalarDocs(expressApp, openapiSpec);

    expressApp.get("/", (req: express.Request, res: express.Response) => {
        res.status(200).json(buildSuccessResponse({
            status: "ok",
            service: "digital-e-server",
            timestamp: new Date().toISOString(),
        }, requestIdFrom(req)));
    });

    app.setGlobalPrefix("api");

    await app.init();

    return app;
}

async function bootstrap() {
    if (cachedApp) {
        return cachedApp;
    }

    const app = await NestFactory.create(AppModule, {
        rawBody: true,
    });

    await configureHttpApp(app);

    cachedApp = app;
    return app;
}

export default bootstrap;
