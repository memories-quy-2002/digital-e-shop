import { ServiceUnavailableException } from "@nestjs/common";
import { GhnShippingProvider } from "./ghn.provider";
import { PersistedSandboxShippingProvider } from "./persisted-sandbox-shipping.provider";
import type { ShippingProvider } from "./shipping.types";

export const SHIPPING_PROVIDER = Symbol("SHIPPING_PROVIDER");
export function createShippingProvider(): ShippingProvider {
    const mode = process.env.SHIPPING_PROVIDER_MODE || "disabled";
    if (mode === "sandbox") return new PersistedSandboxShippingProvider();
    if (mode !== "staging" && mode !== "production") throw new ServiceUnavailableException("Shipping is not configured");
    return new GhnShippingProvider({ mode, token: process.env.GHN_TOKEN || "", shopId: Number(process.env.GHN_SHOP_ID), sender: {
        name: process.env.GHN_SENDER_NAME || "", phone: process.env.GHN_SENDER_PHONE || "", addressLine: process.env.GHN_SENDER_ADDRESS || "",
        provinceName: process.env.GHN_SENDER_PROVINCE || "", districtName: process.env.GHN_SENDER_DISTRICT || "", districtCode: process.env.GHN_SENDER_DISTRICT_CODE || "",
        wardName: process.env.GHN_SENDER_WARD || "", wardCode: process.env.GHN_SENDER_WARD_CODE || "",
    } });
}
