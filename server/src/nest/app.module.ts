import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { NestConfigModule } from "./config/nest-config.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { RequestLoggerInterceptor } from "./interceptors/request-logger.interceptor";

@Module({
    imports: [NestConfigModule, HealthModule],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
    ],
})
export class AppModule {}
