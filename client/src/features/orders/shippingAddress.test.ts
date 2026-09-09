import { describe, expect, it } from "vitest";
import {
    getRecentOrderAddresses,
    parseShippingAddress,
    serializeShippingAddress,
} from "./shippingAddress";

describe("shipping address helpers", () => {
    it("serializes the complete checkout address for order storage", () => {
        expect(serializeShippingAddress({
            address: " 1 Main Street ",
            city: " HCMC ",
            country: " VN ",
        })).toBe(JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }));
    });

    it("parses legacy raw addresses as well as structured snapshots", () => {
        expect(parseShippingAddress(JSON.stringify({
            address: "1 Main Street",
            city: "HCMC",
            country: "VN",
        }))).toEqual({ address: "1 Main Street", city: "HCMC", country: "VN" });
        expect(parseShippingAddress("2 Old Street")).toEqual({
            address: "2 Old Street",
            city: "",
            country: "",
        });
    });

    it("returns recent unique order addresses in newest-first order", () => {
        expect(getRecentOrderAddresses([
            { id: 3, date_added: "2026-09-09", shipping_address: JSON.stringify({ address: "New Street", city: "HCMC", country: "VN" }) },
            { id: 2, date_added: "2026-09-08", shipping_address: JSON.stringify({ address: "New Street", city: "HCMC", country: "VN" }) },
            { id: 1, date_added: "2026-09-07", shipping_address: "Old Street" },
        ])).toEqual([
            { orderId: 3, address: "New Street", city: "HCMC", country: "VN" },
            { orderId: 1, address: "Old Street", city: "", country: "" },
        ]);
    });
});
