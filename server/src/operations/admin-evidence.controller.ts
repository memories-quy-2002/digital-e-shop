import { Controller, Get, Header, HttpCode, HttpException, Param, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { EvidenceService, MAX_EVIDENCE_BYTES } from "./evidence.service";
import type { EvidenceUpload } from "./evidence.repository";

type AdminRequest = Request & { user?: { id?: string | number } };
const evidenceIdFrom = (value: string) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpException({ msg: "Evidence id must be a positive integer" }, HTTP_STATUS.BAD_REQUEST);
    return id;
};

@Controller("admin/evidence")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminEvidenceController {
    constructor(private readonly service: EvidenceService) {}

    @Post()
    @HttpCode(HTTP_STATUS.CREATED)
    @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 } }))
    async upload(@UploadedFile() file: EvidenceUpload | undefined, @Req() req: AdminRequest) {
        try {
            if (!file) throw Object.assign(new Error("Evidence file is required."), { statusCode: HTTP_STATUS.BAD_REQUEST });
            const saved = await this.service.store(String(req.user?.id || ""), file);
            return buildSuccessResponse({ evidence: saved, msg: "Private evidence stored successfully" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to store evidence");
        }
    }

    @Get(":evidenceId")
    @Header("Cache-Control", "no-store")
    async download(@Param("evidenceId") evidenceId: string, @Req() req: AdminRequest): Promise<StreamableFile> {
        try {
            const evidence = await this.service.readForAdmin(evidenceIdFrom(evidenceId), String(req.user?.id || ""));
            const filename = encodeURIComponent(evidence.originalFilename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
            return new StreamableFile(evidence.content, {
                type: evidence.mimeType,
                disposition: `attachment; filename="evidence-${evidence.id}"; filename*=UTF-8''${filename}`,
                length: evidence.byteSize,
            });
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve evidence");
        }
    }
}
