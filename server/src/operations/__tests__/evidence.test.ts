import { describe, expect, it, vi } from "vitest";
import { EvidenceService } from "../evidence.service";
import type { EvidenceRepositoryPort } from "../evidence.repository";

function repo(): EvidenceRepositoryPort {
    return {
        insert: vi.fn(async (record) => ({ id: 1, sha256: record.sha256 })),
        findById: vi.fn().mockResolvedValue(null),
    };
}

describe("EvidenceService", () => {
    it("stores signature-validated private JPEG, PNG, and PDF bytes with a hash", async () => {
        const repository = repo();
        const service = new EvidenceService(repository);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
        await expect(service.store("admin-1", { originalname: "..\\proof.png", mimetype: "image/png", buffer: png, size: png.length } as never))
            .resolves.toMatchObject({ id: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
        expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({ uploadedBy: "admin-1", originalFilename: "proof.png", mimeType: "image/png", content: png }));
    });

    it("rejects mismatched signatures, unsupported MIME, and files over 2 MiB", async () => {
        const repository = repo();
        const service = new EvidenceService(repository);
        await expect(service.store("admin-1", { originalname: "x.png", mimetype: "image/png", buffer: Buffer.from("not png"), size: 7 } as never)).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.store("admin-1", { originalname: "x.exe", mimetype: "application/octet-stream", buffer: Buffer.from("MZ"), size: 2 } as never)).rejects.toMatchObject({ statusCode: 400 });
        const tooBig = Buffer.alloc(2 * 1024 * 1024 + 1);
        await expect(service.store("admin-1", { originalname: "proof.pdf", mimetype: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-"), tooBig]), size: tooBig.length + 5 } as never)).rejects.toMatchObject({ statusCode: 400 });
        expect(repository.insert).not.toHaveBeenCalled();
    });

    it("only returns evidence uploaded by the requesting admin", async () => {
        const repository = repo();
        vi.mocked(repository.findById).mockResolvedValueOnce({ id: 1, uploadedBy: "admin-2", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 5, sha256: "x", content: Buffer.from("%PDF-"), createdAt: "2026-10-14" });
        const service = new EvidenceService(repository);
        await expect(service.readForAdmin(1, "admin-1")).rejects.toMatchObject({ statusCode: 403 });
    });
});
