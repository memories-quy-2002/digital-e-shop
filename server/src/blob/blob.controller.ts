import { Controller, Get, Post, Query, UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { NestBlobService } from "./blob.service";
import type { UploadRequestFile } from "./blob.types";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

@Controller("blob")
export class BlobController {
    constructor(private readonly blobService: NestBlobService) {}

    @Get("health")
    @HttpCode(HTTP_STATUS.OK)
    async blobHealthCheck(@Query("cleanup") cleanup?: string) {
        try {
            const result = await this.blobService.blobHealthCheck(cleanup);
            return result;
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw createHttpException(err, { msg: "Unable to check blob storage health" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }

    @Post("upload")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    @UseInterceptors(FileInterceptor("file"))
    async uploadImage(@UploadedFile() file: UploadRequestFile) {
        if (!file) {
            throw new HttpException({ msg: "No file provided" }, HTTP_STATUS.BAD_REQUEST);
        }

        try {
            const result = await this.blobService.uploadImage(file);
            return result;
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw createHttpException(err, { msg: "Unable to upload image" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }
}
