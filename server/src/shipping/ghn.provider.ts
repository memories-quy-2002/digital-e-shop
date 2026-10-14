import {
    carrierOrderCodeSchema,
    carrierReferenceSchema,
    ghnProvinceCodeSchema,
} from "./shipping.validator";
import {
    normalizeCarrierStatus,
    normalizeProviderTimestamp,
    requireLegacyDistrictId,
    requireProviderId,
    requireProviderMoney,
    ShippingProviderError,
    validateCreateCarrierShipment,
    validateDeliveryAddress,
    validateShippingParcel,
    validateShippingService,
} from "./shipping.policy";
import type {
    CarrierLabel,
    CarrierProvince,
    CarrierService,
    CarrierShipment,
    CarrierWard,
    CreateCarrierShipmentInput,
    DeliveryAddress,
    GhnProviderConfig,
    ShippingParcel,
    ShippingQuote,
    ShippingService,
    ShippingProvider,
} from "./shipping.types";

const PROVIDER_TIMEOUT_MS = 8_000;
const LABEL_TTL_MS = 30 * 60 * 1000;
const GHN_HOSTS = {
    staging: "https://dev-online-gateway.ghn.vn",
    production: "https://online-gateway.ghn.vn",
} as const;

type GhnEnvelope<T> = { code?: unknown; code_message?: unknown; data?: T | null };
type Fetcher = typeof fetch;

export class GhnShippingProvider implements ShippingProvider {
    private readonly baseUrl: string;
    private readonly fetcher: Fetcher;
    private readonly now: () => Date;

    constructor(
        private readonly config: GhnProviderConfig,
        fetcher: Fetcher = fetch,
        now: () => Date = () => new Date(),
    ) {
        this.assertConfiguration(config);
        this.baseUrl = config.baseUrl || GHN_HOSTS[config.mode];
        this.fetcher = fetcher;
        this.now = now;
    }

    async quote(address: DeliveryAddress, parcel: ShippingParcel, service: ShippingService): Promise<ShippingQuote> {
        validateDeliveryAddress(address);
        validateShippingParcel(parcel);
        validateShippingService(service);
        if (!address.districtCode) {
            if (![2, 5].includes(service.serviceTypeId) || service.serviceTypeId !== (parcel.grams < 20000 ? 2 : 5)) throw new ShippingProviderError("SERVICE_UNAVAILABLE");
            const result = await this.request<Record<string, unknown>>("/shiip/public-api/v2/shipping-order/preview", { method: "POST", body: {
                payment_type_id: 1, required_note: "KHONGCHOXEMHANG", is_new_to_address: true,
                from_name: this.config.sender.name, from_phone: this.config.sender.phone, from_address: this.config.sender.addressLine,
                from_ward_name: this.config.sender.wardName, from_district_name: this.config.sender.districtName, from_province_name: this.config.sender.provinceName,
                to_name: address.recipientName, to_phone: address.recipientPhone, to_address: address.addressLine, to_province_name: address.provinceName, to_ward_name: address.wardName,
                cod_amount: 0, insurance_value: 0, service_type_id: service.serviceTypeId, content: "Digital-E delivery estimate",
                weight: parcel.grams, length: parcel.lengthCm, width: parcel.widthCm, height: parcel.heightCm,
            } });
            return { feeVnd: requireProviderMoney(result.total_fee), expectedDeliveryAt: normalizeProviderTimestamp(result.expected_delivery_time) };
        }
        const toDistrictId = requireLegacyDistrictId(address.districtCode);
        const fromDistrictId = requireLegacyDistrictId(this.config.sender.districtCode);
        const services = await this.getAvailableServices(String(fromDistrictId), String(toDistrictId));
        if (!services.some((item) => item.serviceTypeId === service.serviceTypeId)) throw new ShippingProviderError("SERVICE_UNAVAILABLE");

        const result = await this.request<{ total?: unknown }>("/shiip/public-api/v2/shipping-order/fee", {
            method: "POST",
            body: {
                from_district_id: fromDistrictId,
                from_ward_code: this.config.sender.wardCode,
                to_district_id: toDistrictId,
                to_ward_code: address.wardCode,
                service_type_id: service.serviceTypeId,
                weight: parcel.grams,
                length: parcel.lengthCm,
                width: parcel.widthCm,
                height: parcel.heightCm,
            },
        });
        return { feeVnd: requireProviderMoney(result.total), expectedDeliveryAt: null };
    }

    async createShipment(input: CreateCarrierShipmentInput): Promise<CarrierShipment> {
        const valid = validateCreateCarrierShipment(input);
        const fromDistrictId = requireLegacyDistrictId(this.config.sender.districtCode);
        const available = await this.getAvailableServices(String(fromDistrictId), valid.address.districtCode || "");
        if (!available.some((service) => service.serviceTypeId === valid.service.serviceTypeId)) {
            throw new ShippingProviderError("SERVICE_UNAVAILABLE");
        }
        const result = await this.request<Record<string, unknown>>("/shiip/public-api/v2/shipping-order/create", {
            method: "POST",
            body: {
                payment_type_id: 1,
                required_note: "KHONGCHOXEMHANG",
                client_order_code: valid.clientReference,
                from_name: this.config.sender.name,
                from_phone: this.config.sender.phone,
                from_address: this.config.sender.addressLine,
                from_ward_name: this.config.sender.wardName,
                from_district_name: this.config.sender.districtName,
                from_province_name: this.config.sender.provinceName,
                to_name: valid.address.recipientName,
                to_phone: valid.address.recipientPhone,
                to_address: valid.address.addressLine,
                to_ward_name: valid.address.wardName,
                to_province_name: valid.address.provinceName,
                is_new_to_address: true,
                cod_amount: valid.codAmountVnd,
                insurance_value: valid.orderValueVnd,
                order_value: valid.orderValueVnd,
                service_type_id: valid.service.serviceTypeId,
                content: "Digital-E order",
                weight: valid.parcel.grams,
                length: valid.parcel.lengthCm,
                width: valid.parcel.widthCm,
                height: valid.parcel.heightCm,
            },
        });
        const orderCode = this.requiredString(result.order_code);
        const feeValue = result.total_fee;
        const expectedDeliveryAt = normalizeProviderTimestamp(result.expected_delivery_time);
        return {
            provider: "GHN",
            orderCode,
            clientReference: valid.clientReference,
            status: normalizeCarrierStatus("ready_to_pick"),
            providerUpdatedAt: null,
            codAmountVnd: valid.codAmountVnd,
            carrierFeeVnd: feeValue === undefined ? null : requireProviderMoney(feeValue),
            expectedDeliveryAt,
            sandbox: false,
        };
    }

    async findByClientReference(reference: string): Promise<CarrierShipment | null> {
        const clientReference = this.requiredReference(reference);
        const response = await this.requestEnvelope<Record<string, unknown>>("/shiip/public-api/v2/shipping-order/detail-by-client-code", {
            method: "GET",
            query: { client_order_code: clientReference },
            allowMissing: true,
        });
        if (response === null) return null;
        const shipment = this.mapShipment(response);
        if (shipment.clientReference !== clientReference) throw new ShippingProviderError("REFERENCE_MISMATCH");
        return shipment;
    }

    async lookup(orderCode: string): Promise<CarrierShipment> {
        const code = this.requiredOrderCode(orderCode);
        const result = await this.request<Record<string, unknown>>("/shiip/public-api/v2/shipping-order/detail", {
            method: "GET",
            query: { order_code: code },
        });
        return this.mapShipment(result);
    }

    async getLabel(orderCode: string): Promise<CarrierLabel> {
        const code = this.requiredOrderCode(orderCode);
        const result = await this.request<{ token?: unknown }>("/shiip/public-api/v2/a5/gen-token", {
            method: "POST",
            body: { order_codes: [code] },
        });
        return { token: this.requiredString(result.token), expiresAt: new Date(this.now().getTime() + LABEL_TTL_MS).toISOString() };
    }

    async getProvinces(): Promise<CarrierProvince[]> {
        const result = await this.request<unknown[]>("/shiip/public-api/v3/master-data/province/all", {
            method: "GET",
            query: { offset: "0", limit: "200" },
        });
        if (!Array.isArray(result)) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return result.filter((value) => this.asObject(value).status === 1).map((value) => {
            const row = this.asObject(value);
            return { code: String(requireProviderId(row._id)), name: this.requiredString(row.name) };
        });
    }

    async getWards(provinceCode: string): Promise<CarrierWard[]> {
        const parsedId = ghnProvinceCodeSchema.safeParse(provinceCode);
        if (!parsedId.success) throw new ShippingProviderError("INVALID_ADDRESS");
        const result = await this.request<unknown[]>("/shiip/public-api/v3/master-data/ward/all-by-province-id", {
            method: "GET",
            query: { province_id: String(parsedId.data), offset: "0", limit: "200" },
        });
        if (!Array.isArray(result)) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return result.filter((value) => this.asObject(value).status === 1).map((value) => {
            const row = this.asObject(value);
            return {
                code: String(requireProviderId(row._id)),
                provinceCode: String(requireProviderId(row.parent_id)),
                name: this.requiredString(row.name),
            };
        });
    }

    async getAvailableServices(fromDistrictCode: string, toDistrictCode: string): Promise<CarrierService[]> {
        if (!toDistrictCode) return [{ serviceId: 2, serviceTypeId: 2, name: "Standard" }, { serviceId: 5, serviceTypeId: 5, name: "Freight" }];
        const fromDistrictId = requireLegacyDistrictId(fromDistrictCode);
        const toDistrictId = requireLegacyDistrictId(toDistrictCode);
        const result = await this.request<unknown[]>("/shiip/public-api/v2/shipping-order/available-services", {
            method: "POST",
            body: { shop_id: this.config.shopId, from_district: fromDistrictId, to_district: toDistrictId },
        });
        if (!Array.isArray(result)) throw new ShippingProviderError("SERVICE_UNAVAILABLE");
        return result.map((value) => {
            const row = this.asObject(value);
            const serviceId = requireProviderMoney(row.service_id);
            const serviceTypeId = requireProviderMoney(row.service_type_id);
            if (!serviceId || !serviceTypeId) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
            return { serviceId, serviceTypeId, name: this.requiredString(row.short_name) };
        });
    }

    private mapShipment(value: unknown): CarrierShipment {
        const row = this.asObject(value);
        const shopId = requireProviderMoney(row.shop_id);
        if (shopId !== this.config.shopId) throw new ShippingProviderError("SHOP_MISMATCH");
        const fees = row.fee && typeof row.fee === "object" ? (row.fee as Record<string, unknown>) : undefined;
        const fee = row.total_fee ?? fees?.total_fee ?? fees?.main_service;
        return {
            provider: "GHN",
            orderCode: this.requiredString(row.order_code),
            clientReference: this.requiredString(row.client_order_code),
            status: normalizeCarrierStatus(row.status),
            providerUpdatedAt: normalizeProviderTimestamp(row.updated_date),
            codAmountVnd: requireProviderMoney(row.cod_amount),
            carrierFeeVnd: fee === undefined ? null : requireProviderMoney(fee),
            expectedDeliveryAt: normalizeProviderTimestamp(row.leadtime),
            sandbox: false,
        };
    }

    private async request<T>(path: string, options: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown }): Promise<T> {
        const result = await this.requestEnvelope<T>(path, options);
        if (result === null) throw new ShippingProviderError("ORDER_NOT_FOUND");
        return result;
    }

    private async requestEnvelope<T>(
        path: string,
        options: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown; allowMissing?: boolean },
    ): Promise<T | null> {
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value);
        let response: Response;
        try {
            response = await this.fetcher(url, {
                method: options.method,
                headers: {
                    Token: this.config.token,
                    ShopId: String(this.config.shopId),
                    "Content-Type": "application/json",
                },
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
            });
        } catch (error) {
            const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
            throw new ShippingProviderError(isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE");
        }
        let envelope: GhnEnvelope<T>;
        try {
            envelope = (await response.json()) as GhnEnvelope<T>;
        } catch {
            throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        }
        const isKnownMissing = options.allowMissing &&
            ((!response.ok && response.status === 404) || (envelope.code === 400 && envelope.code_message === "ORDER_NOT_FOUND"));
        if (isKnownMissing) return null;
        if (envelope.code_message === "ORDER_NOT_FOUND") throw new ShippingProviderError("ORDER_NOT_FOUND");
        if (envelope.code_message === "CLIENT_NOT_OWNER_OF_SHOP") throw new ShippingProviderError("SHOP_MISMATCH");
        if (envelope.code_message === "WARD_IS_INVALID") throw new ShippingProviderError("INVALID_ADDRESS");
        if (["ROUTE_NOT_FOUND_SERVICE", "SERVICE_NOT_FOUND_CONFIG_FEE"].includes(String(envelope.code_message))) {
            throw new ShippingProviderError("SERVICE_UNAVAILABLE");
        }
        if (!response.ok || envelope.code !== 200) throw new ShippingProviderError("PROVIDER_UNAVAILABLE");
        if (envelope.data === null || envelope.data === undefined) {
            throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        }
        return envelope.data;
    }

    private assertConfiguration(config: GhnProviderConfig) {
        if (
            typeof config.token !== "string" ||
            !config.token.trim() ||
            !Number.isSafeInteger(config.shopId) ||
            config.shopId <= 0 ||
            !config.sender?.name?.trim() ||
            !config.sender.phone?.trim() ||
            !config.sender.addressLine?.trim() ||
            !config.sender.provinceName?.trim() ||
            !config.sender.districtName?.trim() ||
            !config.sender.districtCode?.trim() ||
            !config.sender.wardName?.trim() ||
            !config.sender.wardCode?.trim()
        ) {
            throw new ShippingProviderError("MISSING_CONFIGURATION");
        }
        if (!GHN_HOSTS[config.mode]) throw new ShippingProviderError("UNSAFE_PROVIDER_URL");
        if (config.baseUrl !== undefined && config.baseUrl !== GHN_HOSTS[config.mode]) {
            throw new ShippingProviderError("UNSAFE_PROVIDER_URL");
        }
    }

    private requiredString(value: unknown): string {
        if (typeof value !== "string" || !value.trim()) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return value.trim();
    }

    private requiredReference(value: string): string {
        const parsed = carrierReferenceSchema.safeParse(value);
        if (!parsed.success) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return parsed.data;
    }

    private requiredOrderCode(value: string): string {
        const parsed = carrierOrderCodeSchema.safeParse(value);
        if (!parsed.success) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return parsed.data;
    }

    private asObject(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return value as Record<string, unknown>;
    }
}
