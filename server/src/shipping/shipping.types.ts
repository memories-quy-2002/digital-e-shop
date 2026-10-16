export type ShippingProviderMode = "staging" | "production";

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

export type DeliveryAddress = {
    recipientName: string;
    recipientPhone: string;
    addressLine: string;
    provinceCode: string;
    provinceName: string;
    wardCode: string;
    wardName: string;
    country: "VN";
    districtCode?: string;
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

export type ShippingParcel = {
    grams: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
};

export type ShippingService = { serviceTypeId: number };

export type ShippingQuote = { feeVnd: number; expectedDeliveryAt: string | null };

export type CarrierStatus =
    | "CREATED"
    | "READY_TO_SHIP"
    | "PICKING"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "DELIVERY_FAILED"
    | "RETURNING"
    | "RETURNED"
    | "CANCELLED"
    | "EXCEPTION"
    | "UNKNOWN";

export type CarrierShipment = {
    provider: "GHN" | "SANDBOX";
    orderCode: string;
    clientReference: string;
    status: CarrierStatus;
    providerUpdatedAt: string | null;
    codAmountVnd: number;
    carrierFeeVnd: number | null;
    expectedDeliveryAt: string | null;
    sandbox: boolean;
};

export type CarrierLabel = { token: string; expiresAt: string };

export type CreateCarrierShipmentInput = {
    clientReference: string;
    address: DeliveryAddress;
    parcel: ShippingParcel;
    service: ShippingService;
    codAmountVnd: number;
    orderValueVnd: number;
};

export type CarrierProvince = { code: string; name: string };
export type CarrierWard = { code: string; provinceCode: string; name: string };
export type CarrierService = { serviceId: number; serviceTypeId: number; name: string };

export type SenderAddress = {
    name: string;
    phone: string;
    addressLine: string;
    provinceName: string;
    districtName: string;
    districtCode: string;
    wardName: string;
    wardCode: string;
};

export type GhnProviderConfig = {
    mode: ShippingProviderMode;
    token: string;
    shopId: number;
    sender: SenderAddress;
    baseUrl?: string;
};

export type SandboxShippingConfig = { nodeEnv: string; now?: () => Date };

export type ShippingProvider = {
    quote(address: DeliveryAddress, parcel: ShippingParcel, service: ShippingService): Promise<ShippingQuote>;
    createShipment(input: CreateCarrierShipmentInput): Promise<CarrierShipment>;
    findByClientReference(reference: string): Promise<CarrierShipment | null>;
    lookup(orderCode: string): Promise<CarrierShipment>;
    getLabel(orderCode: string): Promise<CarrierLabel>;
    getProvinces(): Promise<CarrierProvince[]>;
    getWards(provinceCode: string): Promise<CarrierWard[]>;
    getAvailableServices(fromDistrictCode: string, toDistrictCode: string): Promise<CarrierService[]>;
};
