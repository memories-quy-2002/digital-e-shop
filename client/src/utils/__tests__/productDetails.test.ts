import { describe, it, expect, vi } from "vitest";
import {
    emptyProductDetails,
    parseProductDetails,
    rowsFromText,
    rowsToText,
    highlightsFromText,
    highlightsToText,
    serializeProductDetails,
} from "../productDetails";

describe("rowsFromText", () => {
    it("splits lines and parses label:value pairs", () => {
        const result = rowsFromText("CPU: i7\nRAM: 16GB");
        expect(result).toEqual([
            { label: "CPU", value: "i7" },
            { label: "RAM", value: "16GB" },
        ]);
    });

    it("uses Feature as fallback label when no separator", () => {
        const result = rowsFromText("Standalone spec");
        expect(result).toEqual([{ label: "Feature", value: "Standalone spec" }]);
    });

    it("ignores empty and whitespace-only lines", () => {
        const result = rowsFromText("\n\n  \nCPU: i7\n\n");
        expect(result).toEqual([{ label: "CPU", value: "i7" }]);
    });

    it("handles Windows line endings", () => {
        const result = rowsFromText("CPU: i7\r\nRAM: 16GB");
        expect(result).toEqual([
            { label: "CPU", value: "i7" },
            { label: "RAM", value: "16GB" },
        ]);
    });

    it("uses Feature when label is missing before colon", () => {
        const result = rowsFromText(": value only");
        expect(result).toEqual([{ label: "Feature", value: "value only" }]);
    });
});

describe("rowsToText", () => {
    it("joins label-value pairs with newlines", () => {
        expect(rowsToText([{ label: "CPU", value: "i7" }, { label: "RAM", value: "16GB" }])).toBe(
            "CPU: i7\nRAM: 16GB"
        );
    });

    it("round-trips with rowsFromText", () => {
        const original = [{ label: "CPU", value: "i7" }, { label: "RAM", value: "16GB" }];
        expect(rowsFromText(rowsToText(original))).toEqual(original);
    });
});

describe("highlightsFromText / highlightsToText", () => {
    it("extracts and re-joins highlights", () => {
        const raw = "Long battery life\nLightweight";
        const items = highlightsFromText(raw);
        expect(items).toEqual(["Long battery life", "Lightweight"]);
        expect(highlightsToText(items)).toBe("Long battery life\nLightweight");
    });

    it("filters empty strings when serializing", () => {
        expect(highlightsToText(["", "valid", ""])).toBe("valid");
    });
});

describe("parseProductDetails", () => {
    it("returns emptyProductDetails for null and undefined", () => {
        expect(parseProductDetails(null)).toEqual(emptyProductDetails);
        expect(parseProductDetails(undefined)).toEqual(emptyProductDetails);
    });

    it("parses full JSON structure", () => {
        const raw = JSON.stringify({
            model: "ABC-123",
            warranty: "1 year",
            datasheet: "datasheet.pdf",
            highlights: ["Fast", "Cheap"],
            specifications: [
                { label: "CPU", value: "i7" },
                { label: "RAM", value: "16GB" },
            ],
        });
        const result = parseProductDetails(raw);
        expect(result.model).toBe("ABC-123");
        expect(result.warranty).toBe("1 year");
        expect(result.datasheet).toBe("datasheet.pdf");
        expect(result.highlights).toEqual(["Fast", "Cheap"]);
        expect(result.specifications).toEqual([
            { label: "CPU", value: "i7" },
            { label: "RAM", value: "16GB" },
        ]);
    });

    it("falls back to comma-split parsing for invalid JSON", () => {
        const result = parseProductDetails("CPU: i7, RAM: 16GB");
        expect(result.specifications).toEqual([
            { label: "CPU", value: "i7" },
            { label: "RAM", value: "16GB" },
        ]);
    });

    it("treats legacy comma-separated specifications as valid input without logging", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(parseProductDetails("Core Ultra 7, integrated graphics, desktop socket").specifications).toEqual([
            { label: "Specification", value: "Core Ultra 7" },
            { label: "Specification", value: "integrated graphics" },
            { label: "Specification", value: "desktop socket" },
        ]);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("uses Specification as fallback label for bare values in legacy format", () => {
        const result = parseProductDetails("BareValue");
        expect(result.specifications).toEqual([{ label: "Specification", value: "BareValue" }]);
    });

    it("handles non-array specifications gracefully", () => {
        const raw = JSON.stringify({ specifications: "not-an-array" });
        const result = parseProductDetails(raw);
        expect(result.specifications).toEqual([]);
    });

    it("trims whitespace from JSON values", () => {
        const raw = JSON.stringify({
            model: "  spaced  ",
            highlights: ["  one  ", "  "],
            specifications: [{ label: "  CPU  ", value: "  i7  " }],
        });
        const result = parseProductDetails(raw);
        expect(result.model).toBe("spaced");
        expect(result.highlights).toEqual(["one"]);
        expect(result.specifications).toEqual([{ label: "CPU", value: "i7" }]);
    });

    it("uses Feature as default label for spec items missing a label", () => {
        const raw = JSON.stringify({
            specifications: [{ label: "", value: "val" }],
        });
        const result = parseProductDetails(raw);
        expect(result.specifications).toEqual([{ label: "Feature", value: "val" }]);
    });
});

describe("serializeProductDetails", () => {
    it("produces a parseable JSON with trimmed values", () => {
        const out = serializeProductDetails({
            model: "  M1 ",
            warranty: "  1 year ",
            datasheet: "  ds.pdf ",
            highlights: [" a ", "  "],
            specifications: [
                { label: " CPU ", value: " i7 " },
                { label: "  ", value: "  " },
            ],
        });
        const parsed = JSON.parse(out);
        expect(parsed.version).toBe(1);
        expect(parsed.model).toBe("M1");
        expect(parsed.warranty).toBe("1 year");
        expect(parsed.highlights).toEqual(["a"]);
        expect(parsed.specifications).toEqual([{ label: "CPU", value: "i7" }]);
    });

    it("round-trips through parseProductDetails", () => {
        const original = {
            model: "M1",
            warranty: "1 year",
            datasheet: "ds.pdf",
            highlights: ["Fast", "Cheap"],
            specifications: [
                { label: "CPU", value: "i7" },
                { label: "RAM", value: "16GB" },
            ],
        };
        const raw = serializeProductDetails(original);
        expect(parseProductDetails(raw)).toEqual(original);
    });
});
