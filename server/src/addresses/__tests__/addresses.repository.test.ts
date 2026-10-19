import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({ default: { query: poolQuery } }));

import { AddressesRepository } from "../addresses.repository";

describe("AddressesRepository legacy location compatibility", () => {
    beforeEach(() => poolQuery.mockReset());

    it("preserves stored carrier codes when updating current address details", async () => {
        poolQuery.mockImplementation((...args: unknown[]) => {
            const callback = args.find((arg) => typeof arg === "function") as ((error: null, result: { affectedRows: number }) => void) | undefined;
            callback?.(null, { affectedRows: 1 });
            return { on: vi.fn() };
        });
        const repository = new AddressesRepository();

        await expect(repository.updateAddress("customer-1", 9, {
            addressLine: "12 Updated Street",
            city: "Ho Chi Minh City",
            latitude: 10.7769,
            longitude: 106.7009,
        })).resolves.toEqual({ affectedRows: 1 });

        const [sql] = poolQuery.mock.calls[0] as [string];
        expect(sql).not.toMatch(/province_code|province_name|ward_code|ward_name/i);
    });

    it("continues reading legacy carrier codes for historical address display", async () => {
        poolQuery.mockImplementation((...args: unknown[]) => {
            const callback = args.find((arg) => typeof arg === "function") as ((error: null, rows: unknown[]) => void) | undefined;
            callback?.(null, []);
            return { on: vi.fn() };
        });
        const repository = new AddressesRepository();

        await expect(repository.getAddressesByUserId("customer-1")).resolves.toEqual([]);

        const [sql] = poolQuery.mock.calls[0] as [string];
        expect(sql).toMatch(/province_code.*province_name.*ward_code.*ward_name/i);
    });
});
