import { normalizeAttributeKey, type ProductWithAttributes } from "../api";

type Component = Pick<ProductWithAttributes, "category" | "attributes">;

const rules = [
    { categories: ["cpu", "processor"], field: "socket", token: /^(?:am[2-5]\+?|lga\s*\d{3,4}|tr4|strx4|str5)$/i },
    { categories: ["ram", "memory"], field: "memory_type", token: /^ddr[2-6]$/i },
] as const;

export function assessComponentCompatibility(board: Component, part: Component) {
    const category = normalizeAttributeKey(part.category);
    const rule = rules.find(({ categories }) => categories.some((candidate) => candidate === category));
    if (normalizeAttributeKey(board.category) !== "motherboard" || !rule) return null;

    const valuesFor = (component: Component) => {
        const values = new Set<string>();
        for (const attribute of component.attributes) {
            const value = attribute.value.trim();
            if (normalizeAttributeKey(attribute.key) === rule.field && rule.token.test(value)) {
                values.add(value.toUpperCase().replace(/\s+/g, ""));
            }
        }
        return [...values];
    };
    const boardValues = valuesFor(board);
    const partValues = valuesFor(part);
    const status = boardValues.length !== 1 || partValues.length !== 1
        ? "insufficient_evidence"
        : boardValues[0] === partValues[0] ? "compatible" : "conflict";

    return { field: rule.field, boardValues, partValues, status };
}
