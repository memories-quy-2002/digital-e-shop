import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
import { logger } from "#src/shared/utils/logger";
const addressService = require("./addresses.service");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");
const { addressSchema } = require("./addresses.validator");

async function getAddresses(req: AppRequest, res: AppResponse) {
    try {
        const addresses = await addressService.getAddresses(req.params.id);
        return res.status(200).json({ addresses, msg: "Addresses retrieved successfully" });
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ msg: "Unable to load addresses" });
    }
}

async function createAddress(req: AppRequest, res: AppResponse) {
    try {
        const payload = parseBody(addressSchema, req.body);
        const address = await addressService.createAddress(req.params.id, payload);
        return res.status(201).json({ address, msg: "Address created successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to save address" });
    }
}

async function updateAddress(req: AppRequest, res: AppResponse) {
    try {
        const payload = parseBody(addressSchema, req.body);
        const address = await addressService.updateAddress(req.params.id, req.params.addressId, payload);
        return res.status(200).json({ address, msg: "Address updated successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to update address" });
    }
}

async function deleteAddress(req: AppRequest, res: AppResponse) {
    try {
        const address = await addressService.deleteAddress(req.params.id, req.params.addressId);
        return res.status(200).json({ address, msg: "Address deleted successfully" });
    } catch (err) {
        logger.error(err);
        return res.status(err.statusCode || 500).json({ msg: err.statusCode ? err.message : "Unable to delete address" });
    }
}

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
};

