import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const GUEST_ORDER_TOKEN_BYTES = 32;
const GUEST_ORDER_TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

declare const guestOrderTokenHashBrand: unique symbol;

export type GuestOrderTokenHash = string & {
    readonly [guestOrderTokenHashBrand]: true;
};

export const generateGuestOrderToken = (): string => randomBytes(GUEST_ORDER_TOKEN_BYTES).toString("base64url");

export const isGuestOrderTokenHash = (value: unknown): value is GuestOrderTokenHash =>
    typeof value === "string" && GUEST_ORDER_TOKEN_HASH_PATTERN.test(value);

export const assertGuestOrderTokenHash = (value: unknown): GuestOrderTokenHash => {
    if (!isGuestOrderTokenHash(value)) {
        throw new Error("Guest order token hash must be a SHA-256 hexadecimal digest");
    }
    return value;
};

export const hashGuestOrderToken = (token: string): GuestOrderTokenHash =>
    assertGuestOrderTokenHash(createHash("sha256").update(token).digest("hex"));

export const matchesGuestOrderToken = (token: string, storedHash: string | null | undefined): boolean => {
    if (!isGuestOrderTokenHash(storedHash)) return false;

    const tokenHash = Buffer.from(hashGuestOrderToken(token), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");
    return tokenHash.length === expectedHash.length && timingSafeEqual(tokenHash, expectedHash);
};
