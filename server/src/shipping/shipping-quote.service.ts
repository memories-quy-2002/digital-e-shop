import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import type { CartItemRow } from "../cart/cart.types";
import { DeliverySettingsService } from "./delivery-settings.service";
import { calculateDeliveryFee } from "./delivery.policy";
import { RoadRouteService } from "./road-route.service";
import { ShippingQuoteRepository } from "./shipping-quote.repository";
import { assertQuoteMatches, calculatePricing, quoteFingerprint, type QuoteIdentity } from "./shipping-quote.policy";
import { deliveryAddressSchema } from "./shipping.validator";
import type { DeliverySettings, InternalDeliveryAddress, InternalDeliveryQuote, RoadPoint, RoadRoute } from "./shipping.types";
import { parseJson } from "./shipping-json";

export type QuoteCheckout = {
    shippingQuoteId: string;
    deliveryAddress: InternalDeliveryAddress;
    quoteIdentity: QuoteIdentity;
    locale?: "en" | "vi";
};

type InternalDeliverySnapshot = {
    provider: "INTERNAL";
    address: InternalDeliveryAddress;
    origin: RoadPoint;
    destination: RoadPoint;
    distanceMeters: number;
    routeGeometry: RoadRoute["geometry"];
    shippingFeeVnd: number;
    quoteId: string;
    settingsVersion: number;
};

const cartFacts = (cart: CartItemRow[]) => {
    if (!Array.isArray(cart) || cart.length === 0) throw new ConflictException("Cart is empty");
    const facts = cart.map((item) => ({
        id: Number(item.product_id),
        quantity: Number(item.quantity),
        price: Number(item.price),
        salePrice: item.sale_price == null ? null : Number(item.sale_price),
    })).sort((a, b) => a.id - b.id);
    if (facts.some((item) => !Number.isSafeInteger(item.id) || item.id <= 0
        || !Number.isSafeInteger(item.quantity) || item.quantity <= 0
        || !Number.isSafeInteger(item.price) || item.price < 0
        || (item.salePrice !== null && (!Number.isSafeInteger(item.salePrice) || item.salePrice < 0)))) {
        throw new ConflictException("Cart contains invalid delivery quote data");
    }
    return facts;
};

const settingsOrigin = (settings: DeliverySettings): RoadPoint => ({
    latitude: settings.storeLatitude,
    longitude: settings.storeLongitude,
});

const isRoadPoint = (point: RoadPoint) => Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;

const requireSettings = (settings: DeliverySettings | null): DeliverySettings => {
    if (!settings) {
        throw new ServiceUnavailableException("Internal delivery is not configured. Ask an administrator to configure delivery settings.");
    }
    return settings;
};

@Injectable()
export class ShippingQuoteService {
    constructor(
        private readonly repository: ShippingQuoteRepository,
        private readonly settingsService: DeliverySettingsService,
        private readonly routeService: RoadRouteService,
    ) {}

    async createQuote(
        identity: QuoteIdentity,
        input: { address: InternalDeliveryAddress; cart: CartItemRow[]; subtotal: number; discount: number },
    ): Promise<InternalDeliveryQuote> {
        const address = deliveryAddressSchema.parse(input.address);
        const fingerprintedCart = cartFacts(input.cart);
        const initialPricing = calculatePricing(input.subtotal, Math.round(input.discount), 0);
        const settings = requireSettings(await this.settingsService.get());
        const destination = { latitude: address.latitude, longitude: address.longitude };
        const route = await this.routeService.getRoute(settingsOrigin(settings), destination, settings.routingEndpoint);
        const shippingFee = calculateDeliveryFee(route.distanceMeters, settings);
        const pricing = calculatePricing(initialPricing.itemsSubtotal, initialPricing.merchandiseDiscount, shippingFee);
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + 900_000);
        const fingerprint = quoteFingerprint({
            owner: identity,
            cart: fingerprintedCart,
            address,
            origin: settingsOrigin(settings),
            destination,
            distanceMeters: route.distanceMeters,
            routeGeometry: route.geometry,
            pricing,
            settingsVersion: settings.version,
        });

        await withTransaction(async (tx) => {
            const currentSettings = requireSettings(await this.settingsService.getForQuote(tx));
            if (currentSettings.version !== settings.version) {
                throw new ConflictException("Delivery settings changed. Request a new quote.");
            }
            await this.repository.saveQuote(tx, {
                id,
                fingerprint,
                ownerHash: quoteFingerprint(identity),
                address,
                pricing,
                origin: settingsOrigin(settings),
                destination,
                distanceMeters: route.distanceMeters,
                routeGeometry: route.geometry,
                settingsVersion: settings.version,
                expiresAt,
            });
        });

        return {
            id,
            address,
            origin: settingsOrigin(settings),
            destination,
            distanceMeters: route.distanceMeters,
            routeGeometry: route.geometry,
            pricing,
            settingsVersion: settings.version,
            tileUrl: settings.tileUrl,
            tileAttribution: settings.tileAttribution,
            expiresAt: expiresAt.toISOString(),
        };
    }

    async validateQuote(tx: TransactionContext, checkout: QuoteCheckout, cart: CartItemRow[], subtotal: number, discount: number) {
        if (!checkout?.shippingQuoteId || !checkout.quoteIdentity) throw new ConflictException("A delivery quote is required");
        const row = await this.repository.findForUpdate(tx, checkout.shippingQuoteId);
        if (!row || row.provider !== "INTERNAL" || row.owner_hash !== quoteFingerprint(checkout.quoteIdentity)) {
            throw new ConflictException("Delivery quote is unavailable");
        }

        const currentSettings = requireSettings(await this.settingsService.getForQuote(tx));
        if (Number(row.settings_version) !== currentSettings.version) {
            throw new ConflictException("Delivery settings changed. Request a new quote.");
        }

        const address = deliveryAddressSchema.parse(checkout.deliveryAddress);
        const origin = { latitude: Number(row.origin_latitude), longitude: Number(row.origin_longitude) };
        const destination = { latitude: Number(row.destination_latitude), longitude: Number(row.destination_longitude) };
        if (!isRoadPoint(origin) || !isRoadPoint(destination)
            || destination.latitude !== address.latitude || destination.longitude !== address.longitude) {
            throw new ConflictException("Delivery quote is invalid");
        }
        const distanceMeters = Number(row.distance_meters);
        if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0) throw new ConflictException("Delivery quote is invalid");
        const routeGeometry = parseJson<RoadRoute["geometry"]>(row.route_geometry);
        const storedPricing = parseJson<{ shippingFee: number }>(row.pricing);
        const pricing = calculatePricing(subtotal, Math.round(discount), storedPricing.shippingFee);
        const fingerprint = quoteFingerprint({
            owner: checkout.quoteIdentity,
            cart: cartFacts(cart),
            address,
            origin,
            destination,
            distanceMeters,
            routeGeometry,
            pricing,
            settingsVersion: Number(row.settings_version),
        });

        assertQuoteMatches({
            fingerprint: row.fingerprint,
            expiresAt: new Date(row.expires_at),
            consumed: Boolean(row.consumed_at),
        }, fingerprint, new Date());
        await this.repository.consume(tx, row.id);

        const delivery: InternalDeliverySnapshot = {
            provider: "INTERNAL",
            address,
            origin,
            destination,
            distanceMeters,
            routeGeometry,
            shippingFeeVnd: pricing.shippingFee,
            quoteId: row.id,
            settingsVersion: Number(row.settings_version),
        };
        return { pricing, delivery };
    }
}
