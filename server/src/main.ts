import "reflect-metadata";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { defaultClientOrigin, allowedOrigins } from "#src/config/cors.config";
import { registerScalarDocs } from "#src/config/scalarDocs";
import fs from "node:fs";
import path from "node:path";

const openapiSpec = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "docs", "openapi.json"), "utf8"),
);

let cachedApp: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

async function bootstrap() {
    if (cachedApp) {
        return cachedApp;
    }

    const app = await NestFactory.create(AppModule, {
        rawBody: true,
    });

    const expressApp = app.getHttpAdapter().getInstance();

    expressApp.use(cookieParser());

    expressApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        res.header("Access-Control-Allow-Origin", defaultClientOrigin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");

        if (req.method === "OPTIONS") {
            return res.sendStatus(200);
        }

        return next();
    });

    expressApp.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }));

    expressApp.get("/api/openapi.json", (_req: express.Request, res: express.Response) => {
        res.status(200).json(openapiSpec);
    });

    registerScalarDocs(expressApp, openapiSpec);

    expressApp.get("/", (_req: express.Request, res: express.Response) => {
        res.status(200).json({
            status: "ok",
            service: "digital-e-server",
            timestamp: new Date().toISOString(),
        });
    });

    app.setGlobalPrefix("api");

    await app.init();

    cachedApp = app;
    return app;
}

export default bootstrap;
