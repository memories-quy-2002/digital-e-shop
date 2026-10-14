import { createHash } from "node:crypto";
import {
    normalizeCarrierStatus,
    ShippingProviderError,
    validateCreateCarrierShipment,
    validateDeliveryAddress,
    validateShippingParcel,
    validateShippingService,
    requireLegacyDistrictId,
} from "./shipping.policy";
import { carrierOrderCodeSchema, carrierReferenceSchema } from "./shipping.validator";
import type {
    CarrierLabel,
    CarrierProvince,
    CarrierService,
    CarrierShipment,
    CarrierWard,
    CreateCarrierShipmentInput,
    DeliveryAddress,
    SandboxShippingConfig,
    ShippingParcel,
    ShippingProvider,
    ShippingQuote,
    ShippingService,
} from "./shipping.types";

const LABEL_TTL_MS = 30 * 60 * 1000;

export class SandboxShippingProvider implements ShippingProvider {
    private readonly now: () => Date;
    private readonly shipmentsByReference = new Map<string, { fingerprint: string; shipment: CarrierShipment }>();
    private readonly shipmentsByOrderCode = new Map<string, CarrierShipment>();

    constructor(config: SandboxShippingConfig) {
        if (config.nodeEnv === "production") throw new ShippingProviderError("SANDBOX_DISABLED");
        this.now = config.now || (() => new Date());
    }

    async quote(address: DeliveryAddress, parcel: ShippingParcel, service: ShippingService): Promise<ShippingQuote> {
        validateDeliveryAddress(address);
        validateShippingParcel(parcel);
        validateShippingService(service);
        const wards = await this.getWards(address.provinceCode);
        if (!wards.some((ward) => ward.code === address.wardCode)) throw new ShippingProviderError("INVALID_ADDRESS");
        if (![2, 5].includes(service.serviceTypeId)) throw new ShippingProviderError("SERVICE_UNAVAILABLE");
        const baseFee = service.serviceTypeId === 5 ? 39000 : 22000;
        const weightSurcharge = Math.ceil(parcel.grams / 1000) * 1500;
        return {
            feeVnd: baseFee + weightSurcharge,
            expectedDeliveryAt: new Date(this.now().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        };
    }

    async createShipment(input: CreateCarrierShipmentInput): Promise<CarrierShipment> {
        const valid = validateCreateCarrierShipment(input);
        const quote = await this.quote(valid.address, valid.parcel, valid.service);
        const fingerprint = JSON.stringify(valid);
        const existing = this.shipmentsByReference.get(valid.clientReference);
        if (existing) {
            if (existing.fingerprint !== fingerprint) throw new ShippingProviderError("REFERENCE_MISMATCH");
            return existing.shipment;
        }

        const orderCode = `SBX-${this.stableHash(valid.clientReference)}`;
        const shipment: CarrierShipment = {
            provider: "SANDBOX",
            orderCode,
            clientReference: valid.clientReference,
            status: normalizeCarrierStatus("ready_to_pick"),
            providerUpdatedAt: this.now().toISOString(),
            codAmountVnd: valid.codAmountVnd,
            carrierFeeVnd: quote.feeVnd,
            expectedDeliveryAt: new Date(this.now().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            sandbox: true,
        };
        this.shipmentsByReference.set(valid.clientReference, { fingerprint, shipment });
        this.shipmentsByOrderCode.set(orderCode, shipment);
        return shipment;
    }

    async findByClientReference(reference: string): Promise<CarrierShipment | null> {
        const parsed = carrierReferenceSchema.safeParse(reference);
        if (!parsed.success) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        return this.shipmentsByReference.get(parsed.data)?.shipment || null;
    }

    async lookup(orderCode: string): Promise<CarrierShipment> {
        const parsed = carrierOrderCodeSchema.safeParse(orderCode);
        if (!parsed.success) throw new ShippingProviderError("INVALID_PROVIDER_RESPONSE");
        const shipment = this.shipmentsByOrderCode.get(parsed.data);
        if (!shipment) throw new ShippingProviderError("ORDER_NOT_FOUND");
        return shipment;
    }

    async getLabel(orderCode: string): Promise<CarrierLabel> {
        const shipment = await this.lookup(orderCode);
        return {
            token: `sandbox-${shipment.orderCode}`,
            expiresAt: new Date(this.now().getTime() + LABEL_TTL_MS).toISOString(),
        };
    }

    async getProvinces(): Promise<CarrierProvince[]> {
        return [
            { code: "1000001", name: "Ho Chi Minh City" },
            { code: "1000002", name: "Ha Noi" },
        ];
    }

    async getWards(provinceCode: string): Promise<CarrierWard[]> {
        const wards: Record<string, CarrierWard[]> = {
            "1000001": [{ code: "1003646", provinceCode: "1000001", name: "Sandbox Ward One" }],
            "1000002": [{ code: "1002001", provinceCode: "1000002", name: "Sandbox Ward Two" }],
        };
        const result = wards[provinceCode];
        if (!result) throw new ShippingProviderError("INVALID_ADDRESS");
        return result;
    }

    async getAvailableServices(fromDistrictCode: string, toDistrictCode: string): Promise<CarrierService[]> {
        requireLegacyDistrictId(fromDistrictCode);
        if (toDistrictCode) requireLegacyDistrictId(toDistrictCode);
        return [
            { serviceId: 53320, serviceTypeId: 2, name: "Sandbox standard" },
            { serviceId: 100039, serviceTypeId: 5, name: "Sandbox freight" },
        ];
    }

    private stableHash(value: string) {
        return createHash("sha256").update(value).digest("hex").slice(0, 24).toUpperCase();
    }
}
