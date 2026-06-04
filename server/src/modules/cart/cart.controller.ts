import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
const cartService = require("./cart.service");
const { cartAddItemSchema, cartDeleteItemSchema, cartUpdateQuantitySchema } = require("./cart.validator");
const {
    getValidationMessage,
    parseBody,
} = require("#src/shared/validation/requestSchemas");

async function addItemToCart(req: AppRequest, res: AppResponse) {
    try {
        const { pid, uid, quantity } = parseBody(cartAddItemSchema, req.body);
        const msg = await cartService.addItemToCart(pid, uid, quantity);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
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
    try {
        const { cartItemId } = parseBody(cartDeleteItemSchema, req.body);
        const msg = await cartService.deleteCartItem(cartItemId);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        console.error(err.message);
        res.status(500).json({
            msg: "Error deleting cart item",
            error: err.message,
        });
    }
};

async function validateCartForCheckout(req: AppRequest, res: AppResponse) {
    const uid = String(req.params.uid || "");
    try {
        const result = await cartService.validateCartForCheckout(uid);
        const status = result.valid ? 200 : 409;
        return res.status(status).json({
            msg: result.valid
                ? "Cart is valid for checkout"
                : "Some cart items are unavailable or exceed current stock",
            ...result,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({
            msg: "Error validating cart items",
            error: err.message,
        });
    }
};

async function updateCartItemQuantity(req: AppRequest, res: AppResponse) {
    try {
        const { cartItemId, quantity } = parseBody(cartUpdateQuantitySchema, req.body);
        const msg = await cartService.updateCartItemQuantity(cartItemId, quantity);
        res.status(200).json({
            msg: msg,
        });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
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
    validateCartForCheckout,
    updateCartItemQuantity,
    deleteCartItem,
};

