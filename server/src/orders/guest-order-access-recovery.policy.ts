import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "#src/config/env.config";

export const GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH = 6;
export const GUEST_ORDER_ACCESS_RECOVERY_TTL_MINUTES = 10;
export const GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS = 5;
export const GUEST_ORDER_ACCESS_RECOVERY_RESEND_WAIT_SECONDS = 60;
export const GUEST_ORDER_ACCESS_RECOVERY_REQUESTS_PER_HOUR = 3;

export function hashGuestOrderAccessRecoveryEmail(email: string): string {
    return createHmac("sha256", env.csrfSecret).update(email).digest("hex");
}

export function hashGuestOrderAccessRecoveryCode(challengeId: string, code: string): string {
    return createHmac("sha256", env.csrfSecret).update(`${challengeId}:${code}`).digest("hex");
}

export function matchesGuestOrderAccessRecoveryCode(challengeId: string, code: string, expectedHash: string): boolean {
    if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
    const actual = Buffer.from(hashGuestOrderAccessRecoveryCode(challengeId, code), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeGuestRecoveryEmail(value: string): string {
    return value.trim().toLocaleLowerCase("en-US");
}
