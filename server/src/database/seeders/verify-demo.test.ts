import { isDemoVerificationMatch } from "./verify-demo.js";

describe("demo verification counts", () => {
    it("allows runtime sessions in addition to the seeded session baseline", () => {
        expect(isDemoVerificationMatch({ sessions: 9, products: 120, orders: 100 }, { sessions: 8, products: 120, orders: 100 })).toBe(true);
    });

    it("still rejects a mismatch in a seeded data count", () => {
        expect(isDemoVerificationMatch({ sessions: 8, products: 119 }, { sessions: 8, products: 120 })).toBe(false);
    });

    it("rejects account coverage below the order and mixed-status minimums", () => {
        const expected = { accountsMeetingOrderMinimum: 4, accountsWithCompletedAndCanceledOrders: 4 };

        expect(isDemoVerificationMatch(expected, expected)).toBe(true);
        expect(isDemoVerificationMatch({ ...expected, accountsMeetingOrderMinimum: 3 }, expected)).toBe(false);
        expect(isDemoVerificationMatch({ ...expected, accountsWithCompletedAndCanceledOrders: 3 }, expected)).toBe(false);
    });
});
