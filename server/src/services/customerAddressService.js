const Address = require("../models/customerAddressModel");

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const normalizeAddressInput = (data = {}) => {
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

const normalizeAddress = (address = {}) => ({
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

async function getAddresses(uid) {
    return new Promise((resolve, reject) => {
        Address.getAddressesByUserId(uid, (err, rows) => {
            if (err) return reject(err);
            resolve((rows || []).map(normalizeAddress));
        });
    });
}

async function createAddress(uid, data) {
    const address = normalizeAddressInput(data);
    return new Promise((resolve, reject) => {
        Address.createAddress(uid, address, (err, result) => {
            if (err) return reject(err);
            resolve({ id: result.insertId, user_id: uid, ...address });
        });
    });
}

async function updateAddress(uid, addressId, data) {
    const address = normalizeAddressInput(data);
    return new Promise((resolve, reject) => {
        Address.updateAddress(uid, addressId, address, (err, result) => {
            if (err) return reject(err);
            if (result.affectedRows === 0) return reject(createHttpError("Address not found", 404));
            resolve({ id: Number(addressId), user_id: uid, ...address });
        });
    });
}

async function deleteAddress(uid, addressId) {
    return new Promise((resolve, reject) => {
        Address.deleteAddress(uid, addressId, (err, result) => {
            if (err) return reject(err);
            if (result.affectedRows === 0) return reject(createHttpError("Address not found", 404));
            resolve({ id: Number(addressId) });
        });
    });
}

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
};
