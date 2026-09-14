import { describe, expect, it } from "vitest";
import { getFirebasePersistenceMode } from "./firebasePersistence";

describe("Firebase auth persistence", () => {
    it("uses browser session persistence unless remember-me is enabled", () => {
        expect(getFirebasePersistenceMode(false)).toBe("session");
        expect(getFirebasePersistenceMode(true)).toBe("local");
    });
});
