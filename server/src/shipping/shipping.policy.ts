import {
    createCarrierShipmentSchema,
    deliveryAddressSchema,
    ghnDistrictCodeSchema,
    shippingParcelSchema,
    shippingServiceSchema,
} from "./shipping.validator";
import type { DeliveryAddress, ShippingParcel, ShippingService } from "./shipping.types";

export type ShippingProviderErrorCode =
    | "MISSING_CONFIGURATION"
    | "UNSAFE_PROVIDER_URL"
    | "INVALID_ADDRESS"
    | "INVALID_PARCEL"
    | "INVALID_SERVICE"
    | "SERVICE_UNAVAILABLE"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_UNAVAILABLE"
    | "INVALID_PROVIDER_RESPONSE"
    | "SHOP_MISMATCH"
    | "REFERENCE_MISMATCH"
    | "ORDER_NOT_FOUND"
    | "SANDBOX_DISABLED";

export class ShippingProviderError extends Error {
    constructor(readonly code: ShippingProviderErrorCode) {
        super(providerMessages[code]);
        this.name = "ShippingProviderError";
    }
}

const providerMessages: Record<ShippingProviderErrorCode, string> = {
    MISSING_CONFIGURATION: "Shipping provider is not configured",
    UNSAFE_PROVIDER_URL: "Shipping provider URL is not allowed",
    INVALID_ADDRESS: "Delivery address is incomplete or unsupported",
    INVALID_PARCEL: "Parcel dimensions and weight must be positive integers",
    INVALID_SERVICE: "Shipping service is invalid",
    SERVICE_UNAVAILABLE: "Shipping service is unavailable for this route",
    PROVIDER_TIMEOUT: "Shipping provider request timed out",
    PROVIDER_UNAVAILABLE: "Shipping provider request failed",
    INVALID_PROVIDER_RESPONSE: "Shipping provider returned an invalid response",
    SHOP_MISMATCH: "Shipping order belongs to a different shop",
    REFERENCE_MISMATCH: "Shipping order reference did not match the request",
    ORDER_NOT_FOUND: "Shipping order was not found",
    SANDBOX_DISABLED: "Sandbox shipping is disabled in production",
};

export const validateDeliveryAddress = (address: DeliveryAddress) => {
    if (!deliveryAddressSchema.safeParse(address).success) throw new ShippingProviderError("INVALID_ADDRESS");
    return address;
};

export const validateShippingParcel = (parcel: ShippingParcel) => {
    if (!shippingParcelSchema.safeParse(parcel).success) throw new ShippingProviderError("INVALID_PARCEL");
    return parcel;
};

export const validateShippingService = (service: ShippingService) => {
    if (!shippingServiceSchema.safeParse(service).success) throw new ShippingProviderError("INVALID_SERVICE");
    return service;
};

export const validateCreateCarrierShipment = (input: unknown) => {
    const result = createCarrierShipmentSchema.safeParse(input);
    if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path[0]);
        if (fields.includes("address")) throw new ShippingProviderError("INVALID_ADDRESS");
        if (fields.includes("parcel")) throw new ShippingProviderError("INVALID_PARCEL");
        if (fields.includes("service")) throw new ShippingProviderError("INVALID_SERVICE");
        throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
    }
    return result.data;
};

export const requireLegacyDistrictId = (districtCode?: string) => {
    const parsed = ghnDistrictCodeSchema.safeParse(districtCode);
    if (!parsed.success) throw new ShippingProviderError("INVALID_ADDRESS");
    return parsed.data;
};

export const requireProviderMoney = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
    return value;
};

export const requireProviderId = (value: unknown) => {
    const parsed = requireProviderMoney(value);
    if (parsed <= 0) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
    return parsed;
};

export const normalizeProviderTimestamp = (value: unknown): string | null => {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
};

export const normalizeCarrierStatus = (value: unknown) => {
    const status = typeof value === "string" ? value.toLowerCase() : "";
    const statuses: Record<string, import("./shipping.types").CarrierShipment["status"]> = {
        ready_to_pick: "READY_TO_SHIP",
        picking: "PICKING",
        picked: "PICKED_UP",
        storing: "IN_TRANSIT",
        transporting: "IN_TRANSIT",
        sorting: "IN_TRANSIT",
        delivering: "OUT_FOR_DELIVERY",
        delivered: "DELIVERED",
        delivery_fail: "DELIVERY_FAILED",
        waiting_to_return: "RETURNING",
        return: "RETURNING",
        returned: "RETURNED",
        cancel: "CANCELLED",
        exception: "EXCEPTION",
        damage: "EXCEPTION",
        lost: "EXCEPTION",
    };
    return statuses[status] || "UNKNOWN";
};

