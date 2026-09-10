import type { CustomerOrder } from "./types";

export type ShippingAddressSnapshot = {
    address: string;
    city: string;
    country: string;
};

export type RecentOrderAddress = ShippingAddressSnapshot & {
    orderId: number;
};

const asTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const parseShippingAddress = (value: unknown): ShippingAddressSnapshot => {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return {
            address: asTrimmedString(record.address || record.address_line || record.street),
            city: asTrimmedString(record.city),
            country: asTrimmedString(record.country),
        };
    }

    const rawValue = asTrimmedString(value);
    if (!rawValue) return { address: "", city: "", country: "" };

    try {
        const parsed = JSON.parse(rawValue);
        if (parsed && typeof parsed === "object") return parseShippingAddress(parsed);
    } catch {
        // Older orders stored only the street address. Keep supporting that format.
    }

    return { address: rawValue, city: "", country: "" };
};

export const serializeShippingAddress = (address: ShippingAddressSnapshot) => JSON.stringify({
    address: asTrimmedString(address.address),
    city: asTrimmedString(address.city),
    country: asTrimmedString(address.country),
});

export const formatShippingAddress = (value: unknown) => {
    const parsed = parseShippingAddress(value);
    return [parsed.address, parsed.city, parsed.country].filter(Boolean).join(", ");
};

export const getRecentOrderAddresses = (
    orders: Array<Pick<CustomerOrder, "id" | "date_added" | "shipping_address">>,
    limit = 3,
): RecentOrderAddress[] => {
    const seen = new Set<string>();

    return [...orders]
        .sort((left, right) => {
            const leftTime = Date.parse(left.date_added);
            const rightTime = Date.parse(right.date_added);
            if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
            return rightTime - leftTime;
        })
        .map((order) => ({ orderId: Number(order.id), ...parseShippingAddress(order.shipping_address) }))
        .filter((address) => {
            const key = [address.address, address.city, address.country].join("\u001f").toLowerCase();
            if (!address.address || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, Math.max(0, limit));
};
