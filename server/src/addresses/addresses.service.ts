import { Injectable } from "@nestjs/common";
import type { CustomerAddressInput, CustomerAddressRow } from "./addresses.types";
import { AddressesRepository } from "./addresses.repository";

const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

const normalizeAddressInput = (data: CustomerAddressInput = {}) => {
    const label = String(data.label || "Shipping address").trim().slice(0, 80);
    const recipientName = String(data.recipientName || data.recipient_name || "").trim() || null;
    const phoneNumber = String(data.phoneNumber || data.phone_number || "").trim() || null;
    const addressLine = String(data.addressLine || data.address_line || data.address || "").trim();
    const city = String(data.city || "").trim() || null;
    const country = String(data.country || "").trim() || null;

    if (!addressLine) {
        throw createHttpError("Address line is required", 400);
    }

    return {
        label: label || "Shipping address",
        recipientName,
        phoneNumber,
        addressLine,
        city,
        country,
        isDefault: Boolean(data.isDefault ?? data.is_default),
    };
};

const normalizeAddress = (address: CustomerAddressRow) => ({
    id: Number(address.id),
    user_id: address.user_id,
    label: address.label,
    recipient_name: address.recipient_name,
    phone_number: address.phone_number,
    address_line: address.address_line,
    city: address.city,
    country: address.country,
    is_default: Boolean(Number(address.is_default)),
    created_at: address.created_at,
    updated_at: address.updated_at,
});

@Injectable()
export class NestAddressesService {
    constructor(private readonly addressesRepository: AddressesRepository) {}

    async getAddresses(uid: string): Promise<ReturnType<typeof normalizeAddress>[]> {
        const rows = await this.addressesRepository.getAddressesByUserId(uid);
        return (rows || []).map(normalizeAddress);
    }

    async createAddress(uid: string, data: CustomerAddressInput) {
        const address = normalizeAddressInput(data);
        const result = await this.addressesRepository.createAddress(uid, address);
        return { id: result.insertId, user_id: uid, ...address };
    }

    async updateAddress(uid: string, addressId: number | string, data: CustomerAddressInput) {
        const address = normalizeAddressInput(data);
        const result = await this.addressesRepository.updateAddress(uid, Number(addressId), address);
        if (result.affectedRows === 0) throw createHttpError("Address not found", 404);
        return { id: Number(addressId), user_id: uid, ...address };
    }

    async deleteAddress(uid: string, addressId: number | string) {
        const result = await this.addressesRepository.deleteAddress(uid, Number(addressId));
        if (result.affectedRows === 0) throw createHttpError("Address not found", 404);
        return { id: Number(addressId) };
    }
}
