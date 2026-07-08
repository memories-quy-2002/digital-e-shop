import { Controller, Get, Post, Query, UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { NestBlobService } from "./blob.service";
import type { UploadRequestFile } from "./blob.types";

@Controller("blob")
export class BlobController {
    constructor(private readonly blobService: NestBlobService) {}

    @Get("health")
    @HttpCode(200)
    async blobHealthCheck(@Query("cleanup") cleanup?: string) {
        try {
            const result = await this.blobService.blobHealthCheck(cleanup);
            return result;
        } catch (err) {
            const error = err as Error;
            throw new HttpException({ msg: error?.message || "Blob health check failed" }, 500);
        }
    }

    @Post("upload")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    @UseInterceptors(FileInterceptor("file"))
    async uploadImage(@UploadedFile() file: UploadRequestFile) {
        if (!file) {
            throw new HttpException({ msg: "No file provided" }, 400);
        }

        try {
            const result = await this.blobService.uploadImage(file);
            return result;
        } catch (err) {
            const error = err as Error;
            throw new HttpException({ msg: error?.message || "Upload failed" }, 500);
        }
    }
}
