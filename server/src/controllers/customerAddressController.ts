import type { AppRequest, AppResponse } from "../types/domain";
const addressService = require("../services/customerAddressService");

async function getAddresses(req: AppRequest, res: AppResponse) {
    try {
        const addresses = await addressService.getAddresses(req.params.id);
        return res.status(200).json({ addresses, msg: "Addresses retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to load addresses" });
    }
}

async function createAddress(req: AppRequest, res: AppResponse) {
    try {
        const address = await addressService.createAddress(req.params.id, req.body);
        return res.status(201).json({ address, msg: "Address created successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to save address" });
    }
}

async function updateAddress(req: AppRequest, res: AppResponse) {
    try {
        const address = await addressService.updateAddress(req.params.id, req.params.addressId, req.body);
        return res.status(200).json({ address, msg: "Address updated successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to update address" });
    }
}

async function deleteAddress(req: AppRequest, res: AppResponse) {
    try {
        const address = await addressService.deleteAddress(req.params.id, req.params.addressId);
        return res.status(200).json({ address, msg: "Address deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to delete address" });
    }
}

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
};
