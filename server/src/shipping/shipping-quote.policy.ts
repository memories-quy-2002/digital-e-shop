import { ConflictException } from "@nestjs/common";
import { hashTaskPayload } from "../operations/tasks.policy";
import { validateShippingParcel } from "./shipping.policy";

export type QuoteIdentity = { kind: "authenticated"; userId: string } | { kind: "guest"; guestCartId: string };
export type PricingSnapshot = { itemsSubtotal: number; merchandiseDiscount: number; shippingFee: number; payableTotal: number; currency: "VND" };
export function calculatePricing(itemsSubtotal: number, merchandiseDiscount: number, shippingFee: number): PricingSnapshot {
    for (const value of [itemsSubtotal, merchandiseDiscount, shippingFee]) {
        if (!Number.isSafeInteger(value) || value < 0) throw new ConflictException("Money must be non-negative whole VND");
    }
    if (merchandiseDiscount > itemsSubtotal) throw new ConflictException("Discount exceeds merchandise");
    const payableTotal = itemsSubtotal - merchandiseDiscount + shippingFee;
    if (!Number.isSafeInteger(payableTotal) || !Number.isSafeInteger(itemsSubtotal + shippingFee)) throw new ConflictException("Order exceeds supported VND amount");
    return { itemsSubtotal, merchandiseDiscount, shippingFee, payableTotal, currency: "VND" };
}
export function estimateParcel(items: Array<{ quantity: number; grams: number | null; lengthCm: number; widthCm: number; heightCm: number }>) {
    if (!items.length) throw new ConflictException("Cart is empty");
    let grams = 0, lengthCm = 0, widthCm = 0, heightCm = 0;
    for (const item of items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new ConflictException("Invalid parcel quantity");
        validateShippingParcel(item);
        grams += item.grams * item.quantity;
        lengthCm = Math.max(lengthCm, item.lengthCm);
        widthCm = Math.max(widthCm, item.widthCm);
        heightCm += item.heightCm * item.quantity;
    }
    return validateShippingParcel({ grams, lengthCm, widthCm, heightCm });
}
export const quoteFingerprint = (value: object) => hashTaskPayload(value);
export function assertQuoteMatches(row: { fingerprint: string; expiresAt: Date; consumed: boolean }, fingerprint: string, now: Date) {
    if (row.consumed || row.expiresAt.getTime() <= now.getTime() || row.fingerprint !== fingerprint) {
        throw new ConflictException("Delivery quote changed or expired. Request a new quote.");
    }
}
