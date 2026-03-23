const jwt = require("jsonwebtoken");
const { verifySessionToken } = require("../services/sessionService");
const User = require("../models/userModel");

const normalizeRole = (role) => (role ? String(role).toLowerCase() : "");

const requireAuth = async (req, res, next) => {
    const { valid, message } = await verifySessionToken(req);
    if (!valid) {
        return res.status(401).json({ msg: message || "Not authenticated" });
    }

    const accessToken = req.cookies.accessToken;
    try {
        const payload = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
        if (!payload.role && payload.id) {
            const user = await new Promise((resolve, reject) => {
                User.getUserById(payload.id, (err, results) => {
                    if (err) return reject(err);
                    resolve(results && results.length > 0 ? results[0] : null);
                });
            });
            if (user?.role) {
                payload.role = user.role;
            }
        }
        req.user = payload;
        return next();
    } catch (err) {
        return res.status(403).json({ msg: "Invalid or expired token" });
    }
};

const requireRole = (role) => (req, res, next) => {
    const expected = normalizeRole(role);
    const actual = normalizeRole(req.user?.role);
    if (!actual || actual !== expected) {
        return res.status(403).json({ msg: "Forbidden" });
    }
    return next();
};

const requireAdmin = [requireAuth, requireRole("admin")];

const requireCustomerOrAdmin = (req, res, next) => {
    const actual = normalizeRole(req.user?.role);
    if (actual === "customer" || actual === "admin") {
        return next();
    }
    return res.status(403).json({ msg: "Forbidden" });
};

const requireOwnerOrAdmin = (paramKey) => (req, res, next) => {
    const actual = normalizeRole(req.user?.role);
    if (actual === "admin") {
        return next();
    }
    const targetId = req.params[paramKey] || req.body[paramKey];
    if (String(req.user?.id) === String(targetId)) {
        return next();
    }
    return res.status(403).json({ msg: "Forbidden" });
};

module.exports = {
    requireAuth,
    requireAdmin,
    requireCustomerOrAdmin,
    requireOwnerOrAdmin,
};
