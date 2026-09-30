import { Injectable, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { logger } from "#src/shared/utils/logger";
import { getValidationMessage, parseBody } from "#src/shared/validation/request-schemas";
import { blobHealthQuerySchema } from "./blob.validator";
import type { UploadRequestFile } from "./blob.types";
import { HTTP_STATUS } from "#src/shared/constants/http-status";

const { put, del } = require("@vercel/blob");
const sharp = require("sharp") as typeof import("sharp");

const MAX_INPUT_PIXELS = 40_000_000;
const RESPONSIVE_IMAGE_WIDTHS = [320, 640, 960, 1280];
const IMAGE_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const OPTIMIZED_IMAGE_MARKER = "--de-width-";
const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
]);

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
            throw Object.assign(new Error("BLOB_READ_WRITE_TOKEN is not set"), { statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR });
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
                    logger.warn({
                        err: err instanceof Error ? err : new Error(String(err)),
                        blobPath: path,
                        event: "blob health check cleanup failed",
                    });
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
            throw Object.assign(new Error("BLOB_READ_WRITE_TOKEN is not set"), { statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR });
        }
        if (!file?.buffer?.length) {
            throw new BadRequestException({ msg: "No image data provided" });
        }

        const original = file.originalname || "upload";
        const safeName = original
            .replace(/\.[^.]+$/, "")
            .trim()
            .replace(/[^a-z0-9_-]+/gi, "_")
            .replace(/_+/g, "_")
            .slice(0, 64) || "image";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");

        let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
        try {
            metadata = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
        } catch {
            throw new BadRequestException({ msg: "The uploaded image is invalid or unsupported" });
        }

        if (
            !SUPPORTED_IMAGE_MEDIA_TYPES.has(metadata.mediaType || "") ||
            (metadata.pages ?? 1) > 1
        ) {
            throw new BadRequestException({ msg: "Upload a JPEG, PNG, WebP, or AVIF still image" });
        }

        const orientedWidth = metadata.autoOrient?.width ?? metadata.width;
        if (!orientedWidth || orientedWidth < 1) {
            throw new BadRequestException({ msg: "The uploaded image has no valid dimensions" });
        }

        const maxVariantWidth = Math.min(orientedWidth, RESPONSIVE_IMAGE_WIDTHS.at(-1) || orientedWidth);
        const widths = [
            ...RESPONSIVE_IMAGE_WIDTHS.filter((width) => width < maxVariantWidth),
            maxVariantWidth,
        ];
        const pathPrefix = `uploads/${stamp}-${randomUUID()}-${safeName}`;

        const variants = await Promise.all(
            widths.flatMap((width) => [
                this.createImageVariant(file.buffer, width, "webp"),
                this.createImageVariant(file.buffer, width, "avif"),
            ]),
        );
        const imagePaths = variants.map(({ width, format }) => ({
            width,
            format,
            path: `${pathPrefix}${OPTIMIZED_IMAGE_MARKER}${width}.${format}`,
        }));
        const uploads = await Promise.allSettled(
            variants.map(({ data }, index) => {
                const { path, format } = imagePaths[index];
                return put(path, data, {
                    access: "public",
                    token,
                    addRandomSuffix: false,
                    contentType: `image/${format}`,
                    cacheControlMaxAge: IMAGE_CACHE_MAX_AGE_SECONDS,
                });
            }),
        );
        const failedUpload = uploads.find((result) => result.status === "rejected");
        if (failedUpload?.status === "rejected") {
            const cleanupResults = await Promise.allSettled(
                uploads.flatMap((result) => (result.status === "fulfilled" ? [del(result.value.url, { token })] : [])),
            );
            cleanupResults.forEach((result) => {
                if (result.status === "rejected") {
                    logger.warn({
                        err: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
                        event: "failed to clean up partial image variants",
                    });
                }
            });
            throw failedUpload.reason;
        }

        const primaryIndex = imagePaths.findIndex(
            ({ width, format }) => width === maxVariantWidth && format === "webp",
        );
        const primaryUpload = uploads[primaryIndex];
        if (primaryUpload?.status !== "fulfilled") {
            throw new Error("Primary WebP image variant was not uploaded");
        }
        const path = imagePaths[primaryIndex].path;
        const primaryBlob = primaryUpload.value;
        return {
            ok: true,
            url: primaryBlob.url,
            path,
            size: file.size || file.buffer.length,
            msg: "Upload successful",
        };
    }

    private async createImageVariant(
        input: Buffer,
        width: number,
        format: "webp" | "avif",
    ): Promise<{ data: Buffer; width: number; format: "webp" | "avif" }> {
        const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
            .rotate()
            .resize({ width, fit: "inside", withoutEnlargement: true });
        const result = await (format === "webp"
            ? image.webp({ quality: 80, effort: 4 })
            : image.avif({ quality: 50, effort: 3 })
        ).toBuffer({ resolveWithObject: true });

        return { data: result.data, width: result.info.width, format };
    }
}
