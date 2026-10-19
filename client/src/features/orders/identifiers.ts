import type { PublicIdentifier } from "../../types/publicIdentifier";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parses public UUIDv7 references and positive numeric IDs kept in old links/cache. */
export function parseOrderIdentifier(value: string): PublicIdentifier | null {
    const normalized = value.trim();
    if (UUID_V7_PATTERN.test(normalized)) return normalized;

    if (!/^\d+$/.test(normalized)) return null;
    const numericId = Number(normalized);
    return Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null;
}
