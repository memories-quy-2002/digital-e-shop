import { randomBytes } from "node:crypto";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Creates an RFC 9562 UUID v7 with a millisecond timestamp and 74 random bits. */
export function createPublicId(): string {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(Date.now(), 0, 6);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Accepts public UUID v7 references and legacy positive, safe integer IDs. */
export function parseResourceId(value: unknown): string | number {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === "string") {
        if (UUID_V7_PATTERN.test(value)) return value.toLowerCase();
        if (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
    }
    throw Object.assign(new Error("A valid public ID or positive integer ID is required."), { statusCode: 400 });
}

/** Selects a fixed SQL identifier; the reference itself must be bound as a parameter. */
export function resourceIdColumn(value: string | number): "id" | "public_id" {
    return typeof parseResourceId(value) === "number" ? "id" : "public_id";
}
