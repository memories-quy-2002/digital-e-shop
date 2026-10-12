import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";

const EXPORTER_METHODS = [
    "export",
    "forceFlush",
    "shutdown",
    "selectAggregation",
    "selectAggregationTemporality",
] as const;

/**
 * Runtime compatibility check for OTLP exporters whose types may be
 * resolved through different package graphs by deployment builders.
 * Do not silently coerce an exporter lacking the required SDK methods.
 */
export function isPushMetricExporter(value: unknown): value is PushMetricExporter {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    return EXPORTER_METHODS.every(
        (method) => typeof Reflect.get(value, method) === "function",
    );
}
