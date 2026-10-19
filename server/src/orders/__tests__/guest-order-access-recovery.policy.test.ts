import { describe, expect, it } from "vitest";
import {
    GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS,
    GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH,
    GUEST_ORDER_ACCESS_RECOVERY_REQUESTS_PER_HOUR,
    GUEST_ORDER_ACCESS_RECOVERY_RESEND_WAIT_SECONDS,
    GUEST_ORDER_ACCESS_RECOVERY_TTL_MINUTES,
    hashGuestOrderAccessRecoveryCode,
    matchesGuestOrderAccessRecoveryCode,
} from "../guest-order-access-recovery.policy";

describe("guest order access recovery policy", () => {
    it("uses the approved bounded OTP limits", () => {
        expect({
            digits: GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH,
            expiresMinutes: GUEST_ORDER_ACCESS_RECOVERY_TTL_MINUTES,
            attempts: GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS,
            resendSeconds: GUEST_ORDER_ACCESS_RECOVERY_RESEND_WAIT_SECONDS,
            requestsPerHour: GUEST_ORDER_ACCESS_RECOVERY_REQUESTS_PER_HOUR,
        }).toEqual({ digits: 6, expiresMinutes: 10, attempts: 5, resendSeconds: 60, requestsPerHour: 3 });
    });

    it("binds the stored code digest to its challenge and rejects wrong or malformed codes", () => {
        const hash = hashGuestOrderAccessRecoveryCode("challenge-a", "012345");

        expect(matchesGuestOrderAccessRecoveryCode("challenge-a", "012345", hash)).toBe(true);
        expect(matchesGuestOrderAccessRecoveryCode("challenge-a", "112345", hash)).toBe(false);
        expect(matchesGuestOrderAccessRecoveryCode("challenge-b", "012345", hash)).toBe(false);
        expect(matchesGuestOrderAccessRecoveryCode("challenge-a", "12345", hash)).toBe(false);
    });
});
