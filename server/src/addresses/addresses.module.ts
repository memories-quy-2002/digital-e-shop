import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { AddressesController } from "./addresses.controller";
import { NestAddressesService } from "./addresses.service";
import { AddressesRepository } from "./addresses.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    imports: [NestConfigModule],
    controllers: [AddressesController],
    providers: [AuthGuard, RolesGuard, NestAddressesService, AddressesRepository],
})
export class AddressesModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(AddressesController);
    }
}
