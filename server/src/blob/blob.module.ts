import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { BlobController } from "./blob.controller";
import { NestBlobService } from "./blob.service";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";

@Module({
    imports: [NestConfigModule],
    controllers: [BlobController],
    providers: [NestBlobService],
})
export class BlobModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(50)).forRoutes(BlobController);
    }
}
