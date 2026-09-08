import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const GUEST_ORDER_TOKEN_BYTES = 32;

export const generateGuestOrderToken = (): string => randomBytes(GUEST_ORDER_TOKEN_BYTES).toString("base64url");

export const hashGuestOrderToken = (token: string): string =>
    createHash("sha256").update(token).digest("hex");

export const matchesGuestOrderToken = (token: string, storedHash: string | null | undefined): boolean => {
    if (!storedHash) return false;

    const tokenHash = Buffer.from(hashGuestOrderToken(token), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");
    return tokenHash.length === expectedHash.length && timingSafeEqual(tokenHash, expectedHash);
};
