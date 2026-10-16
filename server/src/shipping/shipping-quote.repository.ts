import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { CartItemRow } from "../cart/cart.types";
import { estimateParcel } from "./shipping-quote.policy";
import type { InternalDeliveryAddress, RoadPoint, RoadRoute, ShippingParcel } from "./shipping.types";

export type QuoteRow = {
    id: string;
    fingerprint: string;
    owner_hash: string;
    provider: string;
    pricing: string | object;
    address: string | object;
    origin_latitude: number | string;
    origin_longitude: number | string;
    destination_latitude: number | string;
    destination_longitude: number | string;
    distance_meters: number | string;
    route_geometry: string | object;
    settings_version: number | string;
    expires_at: Date;
    consumed_at: Date | null;
};
@Injectable()
export class ShippingQuoteRepository {
    async parcelForCart(tx: TransactionContext, cart: CartItemRow[]) {
        const ids = [...new Set(cart.map((item) => Number(item.product_id)))].sort((a, b) => a - b);
        if (!ids.length) return estimateParcel([]);
        const products = await tx.query<Array<{ id: number; parcel_grams: number; parcel_length_cm: number; parcel_width_cm: number; parcel_height_cm: number }>>(
            `SELECT id, parcel_grams, parcel_length_cm, parcel_width_cm, parcel_height_cm FROM products WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids,
        );
        return estimateParcel(cart.map((item) => {
            const product = products.find((row) => row.id === Number(item.product_id));
            return { quantity: Number(item.quantity), grams: product?.parcel_grams ?? null, lengthCm: product?.parcel_length_cm ?? 0, widthCm: product?.parcel_width_cm ?? 0, heightCm: product?.parcel_height_cm ?? 0 };
        }));
    }
    async findForUpdate(tx: TransactionContext, id: string) {
        const [row] = await tx.query<QuoteRow[]>("SELECT * FROM delivery_quotes WHERE id = ? FOR UPDATE", [id]);
        return row || null;
    }
    saveQuote(tx: TransactionContext, input: {
        id: string;
        fingerprint: string;
        ownerHash: string;
        address: InternalDeliveryAddress;
        pricing: object;
        origin: RoadPoint;
        destination: RoadPoint;
        distanceMeters: number;
        routeGeometry: RoadRoute["geometry"];
        settingsVersion: number;
        expiresAt: Date;
    }) {
        return tx.query(
            `INSERT INTO delivery_quotes
                (id, fingerprint, owner_hash, provider, service_type_id, address, parcel, pricing,
                 origin_latitude, origin_longitude, destination_latitude, destination_longitude,
                 distance_meters, route_geometry, settings_version, expires_at)
             VALUES (?, ?, ?, 'INTERNAL', NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.id, input.fingerprint, input.ownerHash, JSON.stringify(input.address), JSON.stringify(input.pricing),
                input.origin.latitude, input.origin.longitude, input.destination.latitude, input.destination.longitude,
                input.distanceMeters, JSON.stringify(input.routeGeometry), input.settingsVersion, input.expiresAt],
        );
    }
    consume(tx: TransactionContext, id: string) {
        return tx.query("UPDATE delivery_quotes SET consumed_at = UTC_TIMESTAMP(3) WHERE id = ?", [id]);
    }
    updateParcel(tx: TransactionContext, productId: number, parcel: ShippingParcel) {
        return tx.query<{ affectedRows: number }>("UPDATE products SET parcel_grams = ?, parcel_length_cm = ?, parcel_width_cm = ?, parcel_height_cm = ? WHERE id = ?", [parcel.grams, parcel.lengthCm, parcel.widthCm, parcel.heightCm, productId]);
    }
}
