import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { InternalDeliveryAddress, RoadPoint, RoadRoute } from "./shipping.types";

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
}
