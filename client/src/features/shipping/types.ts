export type DeliveryAddress = {
    recipientName: string;
    recipientPhone: string;
    addressLine: string;
    provinceCode: string;
    provinceName: string;
    wardCode: string;
    wardName: string;
    districtCode?: string;
    country: "VN";
};

export type ShippingParcel = { grams: number; lengthCm: number; widthCm: number; heightCm: number };
export type CarrierProvince = { code: string; name: string };
export type CarrierWard = { code: string; provinceCode: string; name: string };
export type CarrierService = { serviceId: number; serviceTypeId: number; name: string };
export type ShippingPricing = {
    itemsSubtotal: number;
    merchandiseDiscount: number;
    shippingFee: number;
    payableTotal: number;
    currency: "VND";
};

export type ShippingQuote = {
    id: string;
    pricing: ShippingPricing;
    address: DeliveryAddress;
    parcel: ShippingParcel;
    serviceTypeId: number;
    expectedDeliveryAt: string | null;
    expiresAt: string;
    sandbox: boolean;
    parcelEstimated: boolean;
};

export type ShipmentTimelineEvent = {
    state: string;
    occurredAt: string | null;
    note?: string | null;
};

export type ShipmentSummary = {
    orderId: number;
    state: string;
    trackingCode?: string | null;
    provider?: string;
    sandbox?: boolean | number;
    expectedDeliveryAt?: string | null;
    events?: ShipmentTimelineEvent[];
    timeline?: Array<ShipmentTimelineEvent & { id?: number; public_note?: string | null; created_at?: string | null }>;
};

export type FulfillmentOrder = { orderId: number; state: string; trackingCode: string | null; sandbox: boolean | number };
