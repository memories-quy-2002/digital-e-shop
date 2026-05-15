import type { Request, Response } from "express";
const cartService = require("../services/cartService");

async function addItemToCart(req: Request, res: Response) {
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

async function getCartItems(req: Request, res: Response) {
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

async function deleteCartItem(req: Request, res: Response) {
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

async function updateCartItemQuantity(req: Request, res: Response) {
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
