import { describe, expect, it } from "vitest";
import { assessComponentCompatibility } from "./componentCompatibility";

const component = (category: string, key: string, ...values: string[]) => ({
    category,
    attributes: values.map((value) => ({ id: value, key, label: key, type: "text" as const, value, unit: "", filterable: false })),
});

describe("component compatibility evidence", () => {
    it("matches normalized CPU and motherboard sockets", () => {
        expect(assessComponentCompatibility(component("Motherboard", "socket", "LGA 1700"), component("CPU", "socket", "lga1700")))
            .toMatchObject({ status: "compatible", field: "socket", boardValues: ["LGA1700"] });
    });

    it("reports a memory standard conflict", () => {
        expect(assessComponentCompatibility(component("Motherboard", "memory_type", "DDR4"), component("RAM", "memory_type", "DDR5"))?.status)
            .toBe("conflict");
    });

    it("requires unambiguous structured evidence", () => {
        const board = component("Motherboard", "socket", "AM4", "AM5");
        expect(assessComponentCompatibility(board, component("CPU", "socket", "AM5"))?.status).toBe("insufficient_evidence");
        expect(assessComponentCompatibility(board, component("CPU", "socket"))?.status).toBe("insufficient_evidence");
        expect(assessComponentCompatibility(board, component("Graphics Card", "socket", "AM5"))).toBeNull();
    });
});
