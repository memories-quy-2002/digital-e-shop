import { BadRequestException, Injectable } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import { env } from "../config/env.config";
import { isRoutingEndpointAllowed } from "./delivery-routing.config";
import { DeliverySettingsRepository } from "./delivery-settings.repository";
import { deliverySettingsSchema } from "./delivery-settings.validator";
import type { DeliverySettings } from "./shipping.types";

export type { DeliverySettings } from "./shipping.types";

@Injectable()
export class DeliverySettingsService {
    constructor(private readonly repository: DeliverySettingsRepository) {}

    get(): Promise<DeliverySettings | null> {
        return this.repository.get();
    }

    async update(input: Omit<DeliverySettings, "version">, actorId: string): Promise<DeliverySettings> {
        const parsed = deliverySettingsSchema.safeParse(input);
        if (!parsed.success) throw new BadRequestException({ msg: "Delivery settings are invalid", issues: parsed.error.issues });
        const settings = parsed.data;
        if (!isRoutingEndpointAllowed(settings.routingEndpoint, env.deliveryRoutingEndpointAllowlist)) {
            throw new BadRequestException("Select an operator-approved routing endpoint");
        }
        if (!env.deliveryTileUrlAllowlist.includes(settings.tileUrl)) {
            throw new BadRequestException("Select an operator-approved HTTPS map tile URL");
        }
        if (!actorId?.trim()) throw new BadRequestException("An administrator identity is required");

        return withTransaction(async (tx) => {
            const current = await this.repository.lockCurrent(tx);
            const version = current.version + 1;
            if (!Number.isSafeInteger(version) || version > 0xffffffff) throw new Error("Delivery settings version is exhausted");
            const next = { ...settings, version };
            await this.repository.save(tx, next, actorId);
            await this.repository.recordAudit(tx, actorId, current.settings, next);
            return next;
        });
    }
}
