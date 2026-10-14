import { Injectable } from "@nestjs/common";
import { createShippingProvider } from "./shipping.config";
import type { ShippingProvider } from "./shipping.types";

@Injectable()
export class ShippingProviderRegistry {
    private provider?: ShippingProvider;
    get(): ShippingProvider { return this.provider ??= createShippingProvider(); }
}
