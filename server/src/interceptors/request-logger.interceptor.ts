import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { logger } from "#src/shared/utils/logger";
import { buildSuccessResponse } from "#src/shared/http/api-response";
import { REQUEST_ID_HEADER, resolveRequestId } from "#src/middleware/request-id.middleware";

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();
        const res = httpContext.getResponse<Response>();
        const requestId = req.requestId || resolveRequestId(req.headers["x-request-id"]);
        req.requestId = requestId;
        res.setHeader(REQUEST_ID_HEADER, requestId);
        const startedAt = process.hrtime.bigint();

        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            logger.info(
                {
                    method: req.method,
                    url: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(1)),
                    requestId,
                },
                "http request",
            );
        });

        return next.handle().pipe(
            mapResponseBody((body) => {
                if (res.headersSent || body === undefined) {
                    return body;
                }

                // StreamableFile and other framework responses must pass through
                // unchanged; JSON controller payloads receive the shared contract.
                if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) {
                    return body;
                }

                return buildSuccessResponse(body, requestId);
            }),
        );
    }
}

const mapResponseBody = (mapper: (body: unknown) => unknown) => {
    return (source: Observable<unknown>): Observable<unknown> => new Observable((subscriber) => {
        const subscription = source.subscribe({
            next: (body) => subscriber.next(mapper(body)),
            error: (error) => subscriber.error(error),
            complete: () => subscriber.complete(),
        });

        return () => subscription.unsubscribe();
    });
};
