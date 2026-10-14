import { z } from "zod";

const positiveInteger = z.number().int().safe().positive();
const nonNegativeInteger = z.number().int().safe().nonnegative();

export const deliveryAddressSchema = z.object({
    recipientName: z.string().trim().min(1).max(120),
    recipientPhone: z.string().trim().min(7).max(40),
    addressLine: z.string().trim().min(1).max(1024),
    provinceCode: z.string().trim().regex(/^[1-9]\d{0,31}$/),
    provinceName: z.string().trim().min(1).max(120),
    wardCode: z.string().trim().regex(/^[1-9]\d{0,31}$/),
    wardName: z.string().trim().min(1).max(120),
    country: z.literal("VN"),
    districtCode: z.string().trim().regex(/^[1-9]\d{0,31}$/).optional(),
    districtName: z.string().trim().min(1).max(120).optional(),
});

export const shippingParcelSchema = z.object({
    grams: positiveInteger,
    lengthCm: positiveInteger,
    widthCm: positiveInteger,
    heightCm: positiveInteger,
});

export const shippingServiceSchema = z.object({ serviceTypeId: positiveInteger });

export const createCarrierShipmentSchema = z.object({
    clientReference: z.string().trim().min(1).max(50),
    address: deliveryAddressSchema,
    parcel: shippingParcelSchema,
    service: shippingServiceSchema,
    codAmountVnd: nonNegativeInteger,
    orderValueVnd: nonNegativeInteger,
});

export const carrierReferenceSchema = z.string().trim().min(1).max(50);
export const carrierOrderCodeSchema = z.string().trim().min(1).max(50);
export const ghnDistrictCodeSchema = z.string().trim().regex(/^\d+$/).transform(Number).pipe(positiveInteger);
export const ghnProvinceIdSchema = positiveInteger;
export const ghnProvinceCodeSchema = z.string().trim().regex(/^\d+$/).transform(Number).pipe(positiveInteger);
