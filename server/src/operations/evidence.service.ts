import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { EvidenceRepository, type EvidenceFile, type EvidenceRecord, type EvidenceUpload } from "./evidence.repository";

export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const evidenceError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const safeOriginalFilename = (name: string): string => {
    const basename = String(name || "evidence").split(/[\\/]/).pop() || "evidence";
    const safe = basename.replace(/["\\]/g, "_").split("")
        .filter((character) => character.charCodeAt(0) >= 0x20 && character.charCodeAt(0) !== 0x7f)
        .join("").trim().slice(0, 255);
    return safe || "evidence";
};

const signatureMime = (content: Buffer): EvidenceFile["mimeType"] | null => {
    if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
    if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (content.length >= 5 && content.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
    return null;
};

@Injectable()
export class EvidenceService {
    constructor(private readonly repository: EvidenceRepository = new EvidenceRepository()) {}

    async store(actorId: string, file: EvidenceUpload): Promise<{ id: number; sha256: string }> {
        if (!actorId || !Buffer.isBuffer(file?.buffer) || file.buffer.length < 1
            || file.buffer.length > MAX_EVIDENCE_BYTES || file.size !== file.buffer.length) {
            throw evidenceError("Evidence must be a non-empty file no larger than 2 MiB.", HTTP_STATUS.BAD_REQUEST);
        }
        const actualMime = signatureMime(file.buffer);
        if (!actualMime || actualMime !== file.mimetype) throw evidenceError("Evidence file type does not match its content.", HTTP_STATUS.BAD_REQUEST);
        const record: EvidenceRecord = {
            uploadedBy: actorId, originalFilename: safeOriginalFilename(file.originalname), mimeType: actualMime, byteSize: file.buffer.length,
            sha256: createHash("sha256").update(file.buffer).digest("hex"), content: Buffer.from(file.buffer),
        };
        return this.repository.insert(record);
    }

    async readForAdmin(evidenceId: number, actorId: string): Promise<EvidenceFile> {
        const file = await this.repository.findById(evidenceId);
        if (!file) throw evidenceError("Evidence not found.", HTTP_STATUS.NOT_FOUND);
        if (!actorId || file.uploadedBy !== actorId) throw evidenceError("Evidence is not owned by this admin.", HTTP_STATUS.FORBIDDEN);
        return file;
    }
}
