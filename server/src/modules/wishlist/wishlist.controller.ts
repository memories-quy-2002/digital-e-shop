import type { AppRequest, AppResponse } from "#/shared/interfaces/domain";
const wishlistService = require("./wishlist.service");
const { wishlistAddSchema, wishlistBulkDeleteSchema, wishlistDeleteSchema } = require("./wishlist.validator");
const { getValidationMessage, parseBody } = require("#/shared/validation/requestSchemas");

async function addItemToWishlist(req: AppRequest, res: AppResponse) {
    let payload;
    try {
        payload = parseBody(wishlistAddSchema, req.body);
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }
    const { uid, pid } = payload;
    try {
        const msg = await wishlistService.addItemToWishlist(uid, pid);
        return res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
};

async function getWishlist(req: AppRequest, res: AppResponse) {
    const uid = req.params.uid;
    try {
        const results = await wishlistService.getWishlist(uid);
        return res.status(200).json({
            msg: 'Get wishlist with user_id = ${uid} successfully',
            wishlist: results,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({
            msg: "Error retrieving wishlist",
            error: err.message,
        });
    }
};
async function deleteWishlistItem(req: AppRequest, res: AppResponse) {
    let payload;
    try {
        payload = parseBody(wishlistDeleteSchema, { uid: req.body.uid, pid: req.params.pid });
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }
    const { uid, pid } = payload;
    try {
        const msg = await wishlistService.deleteWishlistItem(uid, pid);
        return res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({
            msg: "Error deleting wishlist item",
            error: err.message,
        });
    }
}

async function deleteWishlistItems(req: AppRequest, res: AppResponse) {
    let payload;
    try {
        payload = parseBody(wishlistBulkDeleteSchema, req.body);
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }
    const { uid, productIds } = payload;
    try {
        const msg = await wishlistService.deleteWishlistItems(uid, productIds);
        return res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({
            msg: "Error deleting wishlist items",
            error: err.message,
        });
    }
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem,
    deleteWishlistItems,
};
