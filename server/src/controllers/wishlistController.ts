import type { Request, Response } from "express";
const wishlistService = require('../services/wishlistService');

async function addItemToWishlist(req: Request, res: Response) {
    const { uid, pid } = req.body;
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

async function getWishlist(req: Request, res: Response) {
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
async function deleteWishlistItem(req: Request, res: Response) {
    const { pid } = req.params;
    const { uid } = req.body;
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

async function deleteWishlistItems(req: Request, res: Response) {
    const { uid, productIds } = req.body;
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
