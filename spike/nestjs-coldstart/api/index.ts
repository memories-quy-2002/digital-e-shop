import "reflect-metadata";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";
import { AppModule } from "../src/app.module";

let cachedServer: Express | null = null;

async function bootstrapServer(): Promise<Express> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });
  await nestApp.init();
  return expressApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedServer) {
    cachedServer = await bootstrapServer();
  }
  cachedServer(req as never, res as never);
}
