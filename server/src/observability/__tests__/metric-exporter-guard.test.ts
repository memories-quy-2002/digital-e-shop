import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { describe, expect, it } from "vitest";
import { isPushMetricExporter } from "../metric-exporter-guard";

describe("OTLP metrics exporter contract", () => {
    it("accepts the real configured OTLP exporter without making network requests", () => {
        const exporter = new OTLPMetricExporter({
            url: "http://127.0.0.1:4318/v1/metrics",
        });
        expect(isPushMetricExporter(exporter)).toBe(true);
    });

    it("rejects incomplete exporters instead of casting away missing SDK methods", () => {
        expect(isPushMetricExporter(null)).toBe(false);
        expect(isPushMetricExporter({ export: () => undefined })).toBe(false);
    });
});
