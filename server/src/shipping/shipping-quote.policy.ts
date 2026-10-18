import { ConflictException } from "@nestjs/common";
import { hashTaskPayload } from "../operations/tasks.policy";
import type { ShippingPricing } from "./shipping.types";

export type QuoteIdentity = { kind: "authenticated"; userId: string } | { kind: "guest"; guestCartId: string };
export type PricingSnapshot = ShippingPricing;
export type DeliveryQuoteErrorCode = "DELIVERY_QUOTE_INVALID" | "DELIVERY_QUOTE_EXPIRED" | "DELIVERY_QUOTE_CHANGED" | "DELIVERY_SETTINGS_CHANGED";
export function deliveryQuoteConflict(code: DeliveryQuoteErrorCode, message: string) {
    return new ConflictException({ code, message });
}
export function calculatePricing(itemsSubtotal: number, merchandiseDiscount: number, shippingFee: number): ShippingPricing {
    for (const value of [itemsSubtotal, merchandiseDiscount, shippingFee]) {
        if (!Number.isSafeInteger(value) || value < 0) throw new ConflictException("Money must be non-negative whole VND");
    }
    if (merchandiseDiscount > itemsSubtotal) throw new ConflictException("Discount exceeds merchandise");
    const payableTotal = itemsSubtotal - merchandiseDiscount + shippingFee;
    if (!Number.isSafeInteger(payableTotal) || !Number.isSafeInteger(itemsSubtotal + shippingFee)) throw new ConflictException("Order exceeds supported VND amount");
    return { itemsSubtotal, merchandiseDiscount, shippingFee, payableTotal, currency: "VND" };
}
export const quoteFingerprint = (value: object) => hashTaskPayload(value);
export function assertQuoteMatches(row: { fingerprint: string; expiresAt: Date; consumed: boolean }, fingerprint: string, now: Date) {
    if (row.consumed) throw deliveryQuoteConflict("DELIVERY_QUOTE_INVALID", "This delivery quote has already been used. Request a new quote.");
    if (row.expiresAt.getTime() <= now.getTime()) throw deliveryQuoteConflict("DELIVERY_QUOTE_EXPIRED", "This delivery quote has expired. Request a new quote.");
    if (row.fingerprint !== fingerprint) throw deliveryQuoteConflict("DELIVERY_QUOTE_CHANGED", "Cart, address, or pricing changed. Request a new delivery quote.");
}
