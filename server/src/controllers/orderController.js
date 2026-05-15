const pool = require("../config/db");
const orderService = require("../services/orderService");

async function getOrders(req, res) {
    try {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 100) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;

        if (usePagination) {
            const [orders, total] = await Promise.all([
                orderService.getOrdersPaginated(safeLimit, offset),
                orderService.getOrdersCount(),
            ]);
            return res.status(200).json({
                orders,
                pagination: {
                    page,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Orders retrieved successfully",
            });
        }

        const orders = await orderService.getOrders();
        return res.status(200).json({ orders, msg: "Orders retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function getOrderItems(req, res) {
    try {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 100) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;

        if (usePagination) {
            const [results, total] = await Promise.all([
                orderService.getOrderItemsPaginated(safeLimit, offset),
                orderService.getOrderItemsCount(),
            ]);
            return res.status(200).json({
                orderItems: results,
                pagination: {
                    page,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Products sales and revenue retrieved successfully",
            });
        }

        const results = await orderService.getOrderItems();
        return res.status(200).json({
            orderItems: results,
            msg: "Products sales and revenue retrieved successfully",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function getCustomerOrders(req, res) {
    const uid = req.params.uid;

    try {
        const orders = await orderService.getOrdersByUserId(uid);
        return res.status(200).json({ orders, msg: "Customer orders retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function getOrderDetail(req, res) {
    const orderId = req.params.oid;

    try {
        const order = await orderService.getOrderDetail(orderId);
        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }

        const isOwner = req.user?.id === order.user_id;
        const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ msg: "Forbidden" });
        }

        return res.status(200).json({ order, msg: "Order detail retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function changeOrderStatus(req, res) {
    const orderId = req.params.oid;
    const { status } = req.body;

    if (status === undefined || status === null || ![0, 1, 2].includes(Number(status))) {
        return res.status(400).json({ msg: "Status is required" });
    }

    try {
        const order = await orderService.changeOrderStatus(orderId, Number(status), req.user?.id || null);
        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }
        return res.status(200).json({
            order,
            msg: "Order status has been updated successfully",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: err.message });
    }
}

async function makePurchase(req, res) {
    const uid = req.params.uid;
    const { totalPrice, cart, discount, shippingAddress, paymentMethod } = req.body;
    const requestId = `purchase-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log("[makePurchase] request", { requestId, uid, items: cart?.length });

    if (!cart || cart.length === 0) {
        return res.status(400).json({ msg: "Cart cannot be empty" });
    }
    if (!["bank_transfer", "cash"].includes(paymentMethod)) {
        return res.status(400).json({ msg: "Unsupported payment method" });
    }

    try {
        const order = await orderService.makePurchase(uid, {
            totalPrice,
            cart,
            discount,
            shippingAddress,
            paymentMethod,
        });
        console.log("[makePurchase] success", { requestId, orderId: order.id });
        res.status(201).json({
            orderId: order.id,
            order,
            paymentMethod,
            msg: `Order has been created successfully with id = ${order.id}`,
        });
    } catch (err) {
        console.error("[makePurchase] error", { requestId, err: err?.message || err });
        return res.status(500).json({ msg: err.message });
    }
}

async function applyDiscount(req, res) {
    const { discountCode, price } = req.body;

    try {
        const discount = await orderService.applyDiscount(discountCode);
        if (!discount) {
            return res.status(404).json({ msg: "Discount code not found" });
        }

        const minOrderValue = Number(discount.min_order_value) || 0;
        if (Number(price) < minOrderValue) {
            return res.status(400).json({ msg: `This promotion requires a minimum order of $${minOrderValue.toFixed(2)}` });
        }

        const discountPercent = discount.discount_percent;
        const newPrice = (price * (100 - discountPercent)) / 100;
        return res.status(200).json({
            newPrice,
            msg: "Discount code has been applied successfully",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
    }
}

module.exports = {
    makePurchase,
    getOrders,
    getCustomerOrders,
    getOrderDetail,
    changeOrderStatus,
    getOrderItems,
    applyDiscount,
};
