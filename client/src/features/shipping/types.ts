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

export type DeliveryStatus = "ASSIGNED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED";
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
export type DeliverySettingsConfig = {
    settings: DeliverySettings | null;
    allowedRoutingEndpoints: string[];
    allowedTileUrls: string[];
};
export type DeliveryOrderItem = {
    productName: string;
    sku: string | null;
    quantity: number;
    unitPriceVnd: number;
    totalPriceVnd: number;
};
export type DeliveryEvent = {
    id: number;
    status: DeliveryStatus | null;
    actorId?: string | null;
    publicNote: string | null;
    createdAt: string;
};
export type InternalDeliveryAddress = DeliveryAddress & {
    recipientName: string;
    recipientPhone: string;
};
export type DeliveryAssignment = {
    id: number;
    orderId: number;
    employeeId: string;
    employeeName: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    status: DeliveryStatus | "REASSIGNED";
    failureReason: string | null;
    events: DeliveryEvent[];
    order?: {
        destination: InternalDeliveryAddress | null;
        paymentMethod: string | null;
        codAmountVnd: number;
        items: DeliveryOrderItem[];
    };
};
export type CustomerDeliverySummary = Omit<DeliveryAssignment, "failureReason" | "employeeId" | "events" | "order"> & {
    events: Array<Omit<DeliveryEvent, "actorId">>;
};
export type AssignableDeliveryOrder = {
    orderId: number;
    createdAt: string;
    customerName: string;
    destination: InternalDeliveryAddress | null;
    paymentMethod: string;
    paymentStatus: string;
    codAmountVnd: number;
    items: DeliveryOrderItem[];
    currentAssignment: null | {
        id: number;
        employeeId: string;
        employeeName: string;
        scheduledStartAt: string;
        scheduledEndAt: string;
    };
};
export type DeliveryStaffMember = { id: string; name: string };

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
    delivery?: CustomerDeliverySummary | null;
};

export type FulfillmentOrder = { orderId: number; state: string; provider?: string | null; trackingCode: string | null; sandbox: boolean | number };
