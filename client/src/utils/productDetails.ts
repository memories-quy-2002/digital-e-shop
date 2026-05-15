export type ProductSpecRow = {
    label: string;
    value: string;
};

export type ProductDetails = {
    model: string;
    warranty: string;
    datasheet: string;
    highlights: string[];
    specifications: ProductSpecRow[];
};

export const emptyProductDetails: ProductDetails = {
    model: "",
    warranty: "",
    datasheet: "",
    highlights: [],
    specifications: [],
};

const splitLines = (value: string) =>
    value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

export const rowsFromText = (value: string): ProductSpecRow[] =>
    splitLines(value).map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
            return { label: "Feature", value: line };
        }

        return {
            label: line.slice(0, separatorIndex).trim() || "Feature",
            value: line.slice(separatorIndex + 1).trim(),
        };
    });

export const rowsToText = (rows: ProductSpecRow[]) => rows.map((row) => `${row.label}: ${row.value}`.trim()).join("\n");

export const highlightsFromText = splitLines;

export const highlightsToText = (highlights: string[]) => highlights.filter(Boolean).join("\n");

export const parseProductDetails = (raw?: string | null): ProductDetails => {
    if (!raw) {
        return emptyProductDetails;
    }

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            const specifications = Array.isArray(parsed.specifications)
                ? parsed.specifications
                      .map((item: ProductSpecRow) => ({
                          label: String(item.label || "Feature").trim(),
                          value: String(item.value || "").trim(),
                      }))
                      .filter((item: ProductSpecRow) => item.label || item.value)
                : [];

            return {
                model: String(parsed.model || "").trim(),
                warranty: String(parsed.warranty || "").trim(),
                datasheet: String(parsed.datasheet || "").trim(),
                highlights: Array.isArray(parsed.highlights)
                    ? parsed.highlights.map((item: string) => String(item).trim()).filter(Boolean)
                    : [],
                specifications,
            };
        }
    } catch (err) {
        // Existing products may still store comma-separated specs.
        console.error(err);
    }

    const fallbackRows = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            const separatorIndex = item.indexOf(":");
            if (separatorIndex === -1) {
                return { label: "Specification", value: item };
            }
            return {
                label: item.slice(0, separatorIndex).trim() || "Specification",
                value: item.slice(separatorIndex + 1).trim(),
            };
        });

    return {
        ...emptyProductDetails,
        specifications: fallbackRows,
    };
};

export const serializeProductDetails = (details: ProductDetails) =>
    JSON.stringify({
        version: 1,
        model: details.model.trim(),
        warranty: details.warranty.trim(),
        datasheet: details.datasheet.trim(),
        highlights: details.highlights.map((item) => item.trim()).filter(Boolean),
        specifications: details.specifications
            .map((item) => ({
                label: item.label.trim(),
                value: item.value.trim(),
            }))
            .filter((item) => item.label || item.value),
    });
