export type RoadPoint = { latitude: number; longitude: number };
export type RoadRoute = {
    distanceMeters: number;
    geometry: Array<[longitude: number, latitude: number]>;
};
export type DeliverySettings = {
    storeAddress: string;
    storeLatitude: number;
    storeLongitude: number;
    fee5To20Vnd: number;
    feeOver20Vnd: number;
    routingEndpoint: string;
    tileUrl: string;
    tileAttribution: string;
    version: number;
};

export type DeliveryMapConfig = {
    storeAddress: string;
    origin: RoadPoint;
    tileUrl: string;
    tileAttribution: string;
};

export type InternalDeliveryAddress = {
    recipientName: string;
    recipientPhone: string;
    addressLine: string;
    city: string;
    country: "VN";
    latitude: number;
    longitude: number;
};

export type ShippingPricing = {
    itemsSubtotal: number;
    merchandiseDiscount: number;
    shippingFee: number;
    payableTotal: number;
    currency: "VND";
};

export type InternalDeliveryQuote = {
    id: string;
    address: InternalDeliveryAddress;
    origin: RoadPoint;
    destination: RoadPoint;
    distanceMeters: number;
    routeGeometry: RoadRoute["geometry"];
    pricing: ShippingPricing;
    settingsVersion: number;
    tileUrl: string;
    tileAttribution: string;
    expiresAt: string;
};
