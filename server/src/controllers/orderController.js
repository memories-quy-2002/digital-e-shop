const pool = require("../config/db");
const orderService = require("../services/orderService");

async function makePurchase(req, res) {
    const uid = req.params.uid;
    const { totalPrice, cart, discount, subtotal, shippingAddress } = req.body;

    try {
        const orderId = await orderService.makePurchase(uid, { totalPrice, cart, discount, subtotal, shippingAddress });
        res.status(200).json({ msg: `The order items have been added to the order with id = ${orderId}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Internal server error", error: err.message });
    }
}

async function getOrders(req, res) {
    try {
        const orders = await orderService.getOrders();
        if (orders.length === 0) {
            return res.status(204).json({ msg: 'No orders found' });
        }
        else {
            return res.status(200).json({
                orders: orders,
                msg: 'Orders have been retrieved successfully',
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
};

async function changeOrderStatus(req, res) {
    const orderId = req.params.oid
    const { status } = req.body
    try {
        const order = await orderService.changeOrderStatus(orderId, status);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        else {
            return res.status(200).json({
                order: order,
                msg: `Order status has been changed successfully`,
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
};

async function getOrderItems(req, res) {
    try {
        const results = await orderService.getOrderItems();
        if (results.length === 0) {
            return res.status(204).json({ msg: 'Items not found' });
        } else {
            return res.status(200).json({
                orderItems: results,
                msg: 'Products sales and revenue have been retrieved successfully',
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
};

async function applyDiscount(req, res) {
    const { discountCode, price } = req.body
    try {
        const discount = await orderService.applyDiscount(discountCode);
        if (!discount) {
            return res.status(404).json({ msg: 'Discount code not found' });
        }
        else {
            const discountPercent = discount.discount_percent;
            const newPrice = price * (100 - discountPercent) / 100;
            return res.status(200).json({
                newPrice: newPrice,
                msg: `Discount code has been applied successfully`,
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error', error: err.message });
    }
}

module.exports = {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
};