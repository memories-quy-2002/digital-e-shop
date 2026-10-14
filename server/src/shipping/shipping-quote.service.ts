import { Injectable, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import type { CartItemRow } from "../cart/cart.types";
import type { DeliveryAddress } from "./shipping.types";
import { deliveryAddressSchema } from "./shipping.validator";
import { ShippingQuoteRepository } from "./shipping-quote.repository";
import { assertQuoteMatches, calculatePricing, quoteFingerprint, type QuoteIdentity } from "./shipping-quote.policy";
import { ShippingProviderRegistry } from "./shipping.registry";

export type QuoteCheckout = { shippingQuoteId: string; deliveryAddress: DeliveryAddress; quoteIdentity: QuoteIdentity; locale?: "en" | "vi" };
const cartFacts = (cart: CartItemRow[]) => cart.map((item) => ({ id: Number(item.product_id), quantity: Number(item.quantity), price: Number(item.price), salePrice: item.sale_price == null ? null : Number(item.sale_price) })).sort((a, b) => a.id - b.id);
export const parseJson = <T>(value: string | object): T => typeof value === "string" ? JSON.parse(value) : value as T;

@Injectable()
export class ShippingQuoteService {
    constructor(private readonly repository: ShippingQuoteRepository, private readonly registry: ShippingProviderRegistry) {}
    async createQuote(identity: QuoteIdentity, input: { address: DeliveryAddress; cart: CartItemRow[]; subtotal: number; discount: number; serviceTypeId?: number }) {
        const address = deliveryAddressSchema.parse(input.address);
        const parcel = await withTransaction((tx) => this.repository.parcelForCart(tx, input.cart));
        const provider = this.registry.get();
        const provinces = await provider.getProvinces();
        const wards = await provider.getWards(address.provinceCode);
        if (!provinces.some((entry) => entry.code === address.provinceCode && entry.name === address.provinceName)
            || !wards.some((entry) => entry.code === address.wardCode && entry.name === address.wardName)) throw new ConflictException("Select a valid delivery province and ward");
        const available = await provider.getAvailableServices(process.env.GHN_SENDER_DISTRICT_CODE || "1", address.districtCode || "");
        const desired = input.serviceTypeId ?? (parcel.grams < 20000 ? 2 : 5);
        const service = available.find((entry) => entry.serviceTypeId === desired);
        if (!service) throw new ConflictException("No delivery service is available");
        const quote = await provider.quote(address, parcel, { serviceTypeId: service.serviceTypeId });
        const pricing = calculatePricing(input.subtotal, Math.round(input.discount), quote.feeVnd);
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + 900000);
        const fingerprint = quoteFingerprint({ owner: identity, cart: cartFacts(input.cart), address, pricing, parcel });
        await withTransaction((tx) => this.repository.saveQuote(tx, { id, fingerprint, ownerHash: quoteFingerprint(identity), provider: process.env.SHIPPING_PROVIDER_MODE === "sandbox" ? "SANDBOX" : "GHN", serviceTypeId: service.serviceTypeId,
            address, parcel, pricing, expectedDeliveryAt: quote.expectedDeliveryAt ? new Date(quote.expectedDeliveryAt) : null, expiresAt }));
        return { id, pricing, address, parcel, serviceTypeId: service.serviceTypeId, expectedDeliveryAt: quote.expectedDeliveryAt, expiresAt: expiresAt.toISOString(), sandbox: process.env.SHIPPING_PROVIDER_MODE === "sandbox", parcelEstimated: true };
    }
    async validateQuote(tx: TransactionContext, checkout: QuoteCheckout, cart: CartItemRow[], subtotal: number, discount: number) {
        if (!checkout?.shippingQuoteId || !checkout.quoteIdentity) throw new ConflictException("A delivery quote is required");
        const row = await this.repository.findForUpdate(tx, checkout.shippingQuoteId);
        if (!row) throw new ConflictException("Delivery quote is unavailable");
        const address = deliveryAddressSchema.parse(checkout.deliveryAddress);
        const stored = parseJson<ReturnType<typeof calculatePricing>>(row.pricing);
        const pricing = calculatePricing(subtotal, Math.round(discount), stored.shippingFee);
        const parcel = await this.repository.parcelForCart(tx, cart);
        const fingerprint = quoteFingerprint({ owner: checkout.quoteIdentity, cart: cartFacts(cart), address, pricing, parcel });
        assertQuoteMatches({ fingerprint: row.fingerprint, expiresAt: new Date(row.expires_at), consumed: Boolean(row.consumed_at) }, fingerprint, new Date());
        await this.repository.consume(tx, row.id);
        return { pricing, delivery: { address, parcel, provider: row.provider, serviceTypeId: row.service_type_id, quoteId: row.id } };
    }
}
