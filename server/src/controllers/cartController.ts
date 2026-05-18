import type { AppRequest, AppResponse } from "../types/domain";
const cartService = require("../services/cartService");

async function addItemToCart(req: AppRequest, res: AppResponse) {
    const { pid, uid, quantity } = req.body;
    try {
        const msg = await cartService.addItemToCart(pid, uid, quantity);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            msg: "Error adding item to cart",
            error: err.message,
        });
    }
};

async function getCartItems(req: AppRequest, res: AppResponse) {
    const uid = req.params.uid;
    try {
        const results = await cartService.getCartItems(uid);
        res.status(200).json({
            msg: "Cart items retrieved successfully",
            cartItems: results,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            msg: "Error retrieving cart items",
            error: err.message,
        });
    }
};

async function deleteCartItem(req: AppRequest, res: AppResponse) {
    const { cartItemId } = req.body;
    try {
        const msg = await cartService.deleteCartItem(cartItemId);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            msg: "Error deleting cart item",
            error: err.message,
        });
    }
};

async function updateCartItemQuantity(req: AppRequest, res: AppResponse) {
    const { cartItemId, quantity } = req.body;
    try {
        const msg = await cartService.updateCartItemQuantity(cartItemId, quantity);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            msg: "Error updating cart item",
            error: err.message,
        });
    }
};

module.exports = {
    addItemToCart,
    getCartItems,
    updateCartItemQuantity,
    deleteCartItem,
};
