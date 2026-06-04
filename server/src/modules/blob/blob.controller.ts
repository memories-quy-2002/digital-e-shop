import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
const { put, del } = require("@vercel/blob");
const multer = require("multer");
const { blobHealthQuerySchema } = require("./blob.validator");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");
import type { UploadRequestFile } from "./blob.types";

const upload = multer({ storage: multer.memoryStorage() });

async function blobHealthCheck(req: AppRequest, res: AppResponse) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        return res.status(500).json({ msg: "BLOB_READ_WRITE_TOKEN is not set" });
    }

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const body = `blob health check ${stamp}`;
    const path = `health/blob-${stamp}.txt`;
    let shouldCleanup: boolean;
    try {
        shouldCleanup = (parseBody(blobHealthQuerySchema, req.query).cleanup ?? "true") !== "false";
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }
    const cleanupDelayMs = 60 * 1000;

    try {
        const blob = await put(path, body, { access: "public", token });
        if (shouldCleanup) {
            setTimeout(async () => {
                try {
                    await del(blob.url, { token });
                } catch (err) {
                    const error = err as Error;
                    console.warn("Failed to auto-delete blob health check:", error?.message || err);
                }
            }, cleanupDelayMs);
        }
        return res.status(200).json({
            ok: true,
            path,
            url: blob.url,
            size: body.length,
            cleanupScheduled: shouldCleanup,
            cleanupDelayMs: shouldCleanup ? cleanupDelayMs : 0,
            msg: "Blob upload successful",
        });
    } catch (err) {
        const error = err as Error;
        return res.status(500).json({ ok: false, msg: error?.message || "Blob upload failed" });
    }
}

type UploadRequest = AppRequest & { file?: UploadRequestFile };

const uploadImage = (req: UploadRequest, res: AppResponse) => {
    upload.single("file")(req, res, async (err: Error | null) => {
        if (err) {
            return res.status(400).json({ msg: "Error uploading file" });
        }
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
            return res.status(500).json({ msg: "BLOB_READ_WRITE_TOKEN is not set" });
        }
        if (!req.file) {
            return res.status(400).json({ msg: "No file provided" });
        }
        const original = req.file.originalname || "upload";
        const safeName = original.replace(/\s+/g, "_");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const path = `uploads/${stamp}-${safeName}`;
        try {
            const blob = await put(path, req.file.buffer, { access: "public", token });
            return res.status(200).json({
                ok: true,
                url: blob.url,
                path,
                size: req.file.size,
                msg: "Upload successful",
            });
        } catch (uploadErr) {
            const error = uploadErr as Error;
            return res.status(500).json({ ok: false, msg: error?.message || "Upload failed" });
        }
    });
};

module.exports = { blobHealthCheck, uploadImage };

