import { describe, expect, it } from "vitest";
import {
    generateGuestOrderToken,
    hashGuestOrderToken,
    matchesGuestOrderToken,
} from "../guest-order-token";

describe("guest order tokens", () => {
    it("generates non-empty unpredictable raw tokens that differ from their stored hashes", () => {
        const firstToken = generateGuestOrderToken();
        const secondToken = generateGuestOrderToken();

        expect(firstToken).not.toBe("");
        expect(secondToken).not.toBe("");
        expect(firstToken).not.toBe(secondToken);
        expect(firstToken).not.toBe(hashGuestOrderToken(firstToken));
    });

    it("hashes deterministically and only matches the original raw token", () => {
        const token = "guest-order-access-token";
        const hash = hashGuestOrderToken(token);

        expect(hash).toBe(hashGuestOrderToken(token));
        expect(matchesGuestOrderToken(token, hash)).toBe(true);
        expect(matchesGuestOrderToken("different-token", hash)).toBe(false);
    });
});
