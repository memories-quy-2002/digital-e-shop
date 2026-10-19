import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError } from "#src/shared/interfaces/database";
import type { TransactionContext } from "../database/transaction";
import type { DeliverySettings } from "./shipping.types";

type DeliverySettingsRow = {
    store_address: string | null;
    store_latitude: number | string | null;
    store_longitude: number | string | null;
    fee_5_to_20_vnd: number | string | null;
    fee_over_20_vnd: number | string | null;
    routing_endpoint: string | null;
    tile_url: string | null;
    tile_attribution: string | null;
    version: number | string;
};

export type LockedDeliverySettings = { settings: DeliverySettings | null; version: number };

const mapSettings = (row: DeliverySettingsRow | undefined): DeliverySettings | null => {
    if (!row?.store_address || row.store_latitude == null || row.store_longitude == null
        || row.fee_5_to_20_vnd == null || row.fee_over_20_vnd == null
        || !row.routing_endpoint || !row.tile_url || !row.tile_attribution) return null;

    return {
        storeAddress: row.store_address,
        storeLatitude: Number(row.store_latitude),
        storeLongitude: Number(row.store_longitude),
        fee5To20Vnd: Number(row.fee_5_to_20_vnd),
        feeOver20Vnd: Number(row.fee_over_20_vnd),
        routingEndpoint: row.routing_endpoint,
        tileUrl: row.tile_url,
        tileAttribution: row.tile_attribution,
        version: Number(row.version),
    };
};

@Injectable()
export class DeliverySettingsRepository {
    get(): Promise<DeliverySettings | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT store_address, store_latitude, store_longitude, fee_5_to_20_vnd, fee_over_20_vnd,
                        routing_endpoint, tile_url, tile_attribution, version
                 FROM delivery_settings WHERE id = 1 LIMIT 1`,
                (error: DbError | null, rows?: DeliverySettingsRow[]) => {
                    if (error) return reject(error);
                    resolve(mapSettings(rows?.[0]));
                },
            );
        });
    }

    async lockCurrent(tx: TransactionContext): Promise<LockedDeliverySettings> {
        const [row] = await tx.query<DeliverySettingsRow[]>(
            `SELECT store_address, store_latitude, store_longitude, fee_5_to_20_vnd, fee_over_20_vnd,
                    routing_endpoint, tile_url, tile_attribution, version
             FROM delivery_settings WHERE id = 1 FOR UPDATE`,
        );
        return { settings: mapSettings(row), version: Number(row?.version) || 0 };
    }

    async save(tx: TransactionContext, settings: DeliverySettings, actorId: string): Promise<void> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE delivery_settings
             SET store_address = ?, store_latitude = ?, store_longitude = ?, fee_5_to_20_vnd = ?, fee_over_20_vnd = ?,
                 routing_endpoint = ?, tile_url = ?, tile_attribution = ?, version = ?, updated_by_id = ?, updated_at = UTC_TIMESTAMP(3)
             WHERE id = 1`,
            [settings.storeAddress, settings.storeLatitude, settings.storeLongitude, settings.fee5To20Vnd, settings.feeOver20Vnd,
                settings.routingEndpoint, settings.tileUrl, settings.tileAttribution, settings.version, actorId],
        );
        if (result.affectedRows === 0) throw new Error("Delivery settings migration is not installed");
    }

    recordAudit(tx: TransactionContext, actorId: string, before: DeliverySettings | null, after: DeliverySettings) {
        return tx.query(
            `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
             VALUES (?, 'delivery.settings.updated', 'delivery_settings', '1', 'Internal delivery settings updated', ?)`,
            [actorId, JSON.stringify({ before, after })],
        );
    }
}
