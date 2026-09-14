import { isDemoVerificationMatch } from "./verifyDemo.js";

describe("demo verification counts", () => {
    it("allows runtime sessions in addition to the seeded session baseline", () => {
        expect(isDemoVerificationMatch({ sessions: 9, products: 28 }, { sessions: 8, products: 28 })).toBe(true);
    });

    it("still rejects a mismatch in a seeded data count", () => {
        expect(isDemoVerificationMatch({ sessions: 8, products: 27 }, { sessions: 8, products: 28 })).toBe(false);
    });
});
