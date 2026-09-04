import { Injectable, BadRequestException } from "@nestjs/common";
import { logger } from "#src/shared/utils/logger";
import { getValidationMessage, parseBody } from "#src/shared/validation/requestSchemas";
import { blobHealthQuerySchema } from "./blob.validator";
import type { UploadRequestFile } from "./blob.types";

const { put, del } = require("@vercel/blob");

export type BlobHealthResult = {
    ok: boolean;
    path: string;
    url: string;
    size: number;
    cleanupScheduled: boolean;
    cleanupDelayMs: number;
    msg: string;
};

export type BlobUploadResult = {
    ok: boolean;
    url: string;
    path: string;
    size: number;
    msg: string;
};

@Injectable()
export class NestBlobService {
    async blobHealthCheck(cleanup?: string): Promise<BlobHealthResult> {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
            throw Object.assign(new Error("BLOB_READ_WRITE_TOKEN is not set"), { statusCode: 500 });
        }

        let shouldCleanup: boolean;
        try {
            shouldCleanup = (parseBody(blobHealthQuerySchema, { cleanup }).cleanup ?? "true") !== "false";
        } catch (err) {
            throw new BadRequestException({ msg: getValidationMessage(err) });
        }

        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, "-");
        const body = `blob health check ${stamp}`;
        const path = `health/blob-${stamp}.txt`;
        const cleanupDelayMs = 60 * 1000;

        const blob = await put(path, body, { access: "public", token });
        if (shouldCleanup) {
            setTimeout(async () => {
                try {
                    await del(blob.url, { token });
                } catch (err) {
                    const error = err as Error;
                    logger.warn({ err: error?.message || err, url: blob.url }, "Failed to auto-delete blob health check");
                }
            }, cleanupDelayMs);
        }

        return {
            ok: true,
            path,
            url: blob.url,
            size: body.length,
            cleanupScheduled: shouldCleanup,
            cleanupDelayMs: shouldCleanup ? cleanupDelayMs : 0,
            msg: "Blob upload successful",
        };
    }

    async uploadImage(file: UploadRequestFile): Promise<BlobUploadResult> {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
            throw Object.assign(new Error("BLOB_READ_WRITE_TOKEN is not set"), { statusCode: 500 });
        }

        const original = file.originalname || "upload";
        const safeName = original.replace(/\s+/g, "_");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const path = `uploads/${stamp}-${safeName}`;

        const blob = await put(path, file.buffer, { access: "public", token });
        return {
            ok: true,
            url: blob.url,
            path,
            size: file.size || file.buffer.length,
            msg: "Upload successful",
        };
    }
}
