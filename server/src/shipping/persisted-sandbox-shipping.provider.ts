import { ConflictException, NotFoundException } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import { hashTaskPayload } from "../operations/tasks.policy";
import { SandboxShippingProvider } from "./sandbox-shipping.provider";
import type { CarrierShipment, CarrierStatus, CreateCarrierShipmentInput } from "./shipping.types";

/** Local carrier fixture state survives API/runner restarts; never enabled in production. */
export class PersistedSandboxShippingProvider extends SandboxShippingProvider {
    constructor() { super({ nodeEnv: process.env.NODE_ENV || "development" }); }
    override async createShipment(input: CreateCarrierShipmentInput): Promise<CarrierShipment> {
        const hash = hashTaskPayload(input);
        const snapshot = await super.createShipment(input);
        return withTransaction(async (tx) => {
            await tx.query("INSERT INTO sandbox_carrier_shipments (client_reference, provider_order_code, input_hash, snapshot) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE client_reference = VALUES(client_reference)", [input.clientReference, snapshot.orderCode, hash, JSON.stringify(snapshot)]);
            const [row] = await tx.query<Array<{ input_hash: string; snapshot: string | object }>>("SELECT input_hash, snapshot FROM sandbox_carrier_shipments WHERE client_reference = ? FOR UPDATE", [input.clientReference]);
            if (row.input_hash !== hash) throw new ConflictException("Sandbox parcel reference already has different facts");
            return typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot as CarrierShipment;
        });
    }
    override findByClientReference(reference: string): Promise<CarrierShipment | null> {
        return withTransaction(async (tx) => {
            const [row] = await tx.query<Array<{ snapshot: string | object }>>("SELECT snapshot FROM sandbox_carrier_shipments WHERE client_reference = ?", [reference]);
            return row ? (typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot as CarrierShipment) : null;
        });
    }
    override async lookup(orderCode: string): Promise<CarrierShipment> {
        const result = await withTransaction(async (tx) => {
            const [row] = await tx.query<Array<{ snapshot: string | object }>>("SELECT snapshot FROM sandbox_carrier_shipments WHERE provider_order_code = ?", [orderCode]);
            return row ? (typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot as CarrierShipment) : null;
        });
        if (!result) throw new NotFoundException("Sandbox parcel not found");
        return result;
    }
    async setFixtureStatus(reference: string, status: CarrierStatus, now = new Date()) {
        const shipment = await this.findByClientReference(reference);
        if (!shipment) throw new NotFoundException("Sandbox parcel not found");
        const next = { ...shipment, status, providerUpdatedAt: now.toISOString() };
        await withTransaction((tx) => tx.query("UPDATE sandbox_carrier_shipments SET snapshot = ?, updated_at = UTC_TIMESTAMP(3) WHERE client_reference = ?", [JSON.stringify(next), reference]));
        return next;
    }
    override async getLabel(orderCode: string) {
        await this.lookup(orderCode);
        return { token: `sandbox-label-${orderCode}`, expiresAt: new Date(Date.now() + 1800000).toISOString() };
    }
}
