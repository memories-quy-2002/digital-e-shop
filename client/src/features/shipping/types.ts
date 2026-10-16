export type DeliveryAddress = {
    recipientName: string;
    recipientPhone: string;
    addressLine: string;
    city: string;
    country: "VN";
    latitude: number;
    longitude: number;
};

export type RoadPoint = { latitude: number; longitude: number };
export type DeliveryMapConfig = {
    storeAddress: string;
    origin: RoadPoint;
    tileUrl: string;
    tileAttribution: string;
};

export type ShippingParcel = { grams: number; lengthCm: number; widthCm: number; heightCm: number };
export type ShippingPricing = {
    itemsSubtotal: number;
    merchandiseDiscount: number;
    shippingFee: number;
    payableTotal: number;
    currency: "VND";
};

export type InternalDeliveryQuote = {
    id: string;
    pricing: ShippingPricing;
    address: DeliveryAddress;
    origin: RoadPoint;
    destination: RoadPoint;
    distanceMeters: number;
    routeGeometry: Array<[longitude: number, latitude: number]>;
    settingsVersion: number;
    tileUrl: string;
    tileAttribution: string;
    expiresAt: string;
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
