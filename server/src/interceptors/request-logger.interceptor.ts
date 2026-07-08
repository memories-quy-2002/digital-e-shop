import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { logger } from "#src/shared/utils/logger";

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (process.env.NODE_ENV === "production") {
            return next.handle();
        }

        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();
        const res = httpContext.getResponse<Response>();
        const startedAt = process.hrtime.bigint();

        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            logger.info(
                {
                    method: req.method,
                    url: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(1)),
                },
                "http request",
            );
        });

        return next.handle();
    }
}
