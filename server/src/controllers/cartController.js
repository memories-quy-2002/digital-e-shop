const cartService = require("../services/cartService");

async function addItemToCart(req, res) {
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

async function getCartItems(req, res) {
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

async function deleteCartItem(req, res) {
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

module.exports = {
    addItemToCart,
    getCartItems,
    deleteCartItem,
};
