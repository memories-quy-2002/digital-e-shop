const pool = require("../config/db");
const orderService = require("../services/orderService");

async function makePurchase(req, res) {
    const uid = req.params.uid;
    const { totalPrice, cart, discount, subtotal, shippingAddress } = req.body;

    if (!cart || cart.length === 0) {
        return res.status(400).json({ msg: "Cart cannot be empty" }); // ❌ Bad Request
    }

    try {
        const orderId = await orderService.makePurchase(uid, { totalPrice, cart, discount, subtotal, shippingAddress });
        res.status(201).json({   // ✅ Created
            orderId,
            msg: `Order has been created successfully with id = ${orderId}`
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function getOrders(req, res) {
    try {
        const orders = await orderService.getOrders();
        return res.status(200).json({
            orders,
            msg: 'Orders retrieved successfully',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function changeOrderStatus(req, res) {
    const orderId = req.params.oid;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ msg: 'Status is required' }); // ❌ Bad Request
    }

    try {
        const order = await orderService.changeOrderStatus(orderId, status);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        return res.status(200).json({
            order,
            msg: 'Order status has been updated successfully',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function getOrderItems(req, res) {
    try {
        const results = await orderService.getOrderItems();
        return res.status(200).json({
            orderItems: results,
            msg: 'Products sales and revenue retrieved successfully',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function applyDiscount(req, res) {
    const { discountCode, price } = req.body;

    try {
        const discount = await orderService.applyDiscount(discountCode);
        if (!discount) {
            return res.status(404).json({ msg: 'Discount code not found' });
        }

        const discountPercent = discount.discount_percent;
        const newPrice = price * (100 - discountPercent) / 100;
        return res.status(200).json({
            newPrice,
            msg: 'Discount code has been applied successfully',
        });
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