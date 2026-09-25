import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { MySQL2Instrumentation } from "@opentelemetry/instrumentation-mysql2";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import process from "node:process";
import { sanitizeTelemetryUrl } from "./url-sanitizer";

const getOtlpEndpoint = (signal: "TRACES" | "METRICS") => {
    const configuredSignalEndpoint =
        process.env[`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`]?.trim();
    if (configuredSignalEndpoint) {
        return configuredSignalEndpoint;
    }

    const baseEndpoint = (
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"
    ).replace(/\/+$/, "");
    return `${baseEndpoint}/v1/${signal.toLowerCase()}`;
};

const parseOtlpHeaders = (value = ""): Record<string, string> => {
    const headers: Record<string, string> = {};

    for (const item of value.split(",")) {
        const separator = item.indexOf("=");
        if (separator <= 0) {
            continue;
        }

        try {
            const key = decodeURIComponent(item.slice(0, separator).trim());
            const headerValue = decodeURIComponent(
                item.slice(separator + 1).trim(),
            );
            if (key) {
                headers[key] = headerValue;
            }
        } catch {
            // Ignore malformed optional headers and keep the API available.
        }
    }

    return headers;
};

const metricExportInterval = () => {
    const configuredInterval = Number(
        process.env.OTEL_METRIC_EXPORT_INTERVAL || 15000,
    );
    return Number.isFinite(configuredInterval) && configuredInterval >= 1000
        ? Math.min(configuredInterval, 300000)
        : 15000;
};

let sdk: NodeSDK | undefined;

const telemetryEnabled =
    process.env.OTEL_ENABLED === "true" &&
    process.env.OTEL_SDK_DISABLED !== "true";

if (telemetryEnabled) {
    try {
        const traceHeaders = parseOtlpHeaders(
            process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ||
                process.env.OTEL_EXPORTER_OTLP_HEADERS,
        );
        const metricHeaders = parseOtlpHeaders(
            process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS ||
                process.env.OTEL_EXPORTER_OTLP_HEADERS,
        );

        sdk = new NodeSDK({
            resource: resourceFromAttributes({
                "service.name":
                    process.env.OTEL_SERVICE_NAME?.trim() || "digital-e-server",
                "deployment.environment.name":
                    process.env.NODE_ENV || "development",
            }),
            traceExporter: new OTLPTraceExporter({
                url: getOtlpEndpoint("TRACES"),
                headers: traceHeaders,
            }),
            metricReader: new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter({
                    url: getOtlpEndpoint("METRICS"),
                    headers: metricHeaders,
                }),
                exportIntervalMillis: metricExportInterval(),
            }),
            instrumentations: [
                new HttpInstrumentation({
                    headersToSpanAttributes: {
                        client: { requestHeaders: [], responseHeaders: [] },
                        server: { requestHeaders: [], responseHeaders: [] },
                    },
                    requestHook: (span, request) => {
                        const rawUrl =
                            "url" in request && typeof request.url === "string"
                                ? request.url
                                : "path" in request &&
                                    typeof request.path === "string"
                                  ? request.path
                                  : "/";
                        const protocol =
                            "protocol" in request &&
                            typeof request.protocol === "string"
                                ? request.protocol
                                : "encrypted" in request.socket &&
                                    request.socket.encrypted
                                  ? "https:"
                                  : "http:";
                        const hostHeader =
                            "headers" in request
                                ? request.headers.host
                                : undefined;
                        const host =
                            "host" in request &&
                            typeof request.host === "string"
                                ? request.host
                                : typeof hostHeader === "string"
                                  ? hostHeader
                                  : "localhost";
                        const safeUrl = sanitizeTelemetryUrl(
                            rawUrl,
                            `${protocol}//${host}`,
                        );

                        span.setAttribute("url.full", safeUrl);
                        span.setAttribute(
                            "url.path",
                            new URL(safeUrl, "http://localhost").pathname,
                        );
                        span.setAttribute("url.query", "");
                    },
                }),
                new ExpressInstrumentation(),
                new MySQL2Instrumentation({ maskStatement: true }),
            ],
        });

        sdk.start();
    } catch (error) {
        sdk = undefined;
        const errorName = error instanceof Error ? error.name : "UnknownError";
        process.stderr.write(
            `OpenTelemetry could not start (${errorName}); the API will continue without telemetry.\n`,
        );
    }
}

export const shutdownTelemetry = async () => {
    if (!sdk) {
        return;
    }

    try {
        await sdk.shutdown();
    } catch {
        process.stderr.write(
            "OpenTelemetry shutdown failed; pending telemetry may not have been exported.\n",
        );
    }
};
