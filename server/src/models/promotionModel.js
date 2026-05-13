const pool = require("../config/db");

const optionalColumns = [
    "ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1",
    "ADD COLUMN min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN starts_at DATETIME NULL",
    "ADD COLUMN expires_at DATETIME NULL",
    "ADD COLUMN usage_limit INT NULL",
];

let columnsReady = false;

const query = (sql, params, callback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensurePromotionColumns = (callback) => {
    if (columnsReady) {
        callback();
        return;
    }

    let index = 0;
    const next = () => {
        if (index >= optionalColumns.length) {
            columnsReady = true;
            callback();
            return;
        }

        query(`ALTER TABLE discounts ${optionalColumns[index]}`, (err) => {
            index += 1;
            if (err && err.code !== "ER_DUP_FIELDNAME") {
                callback(err);
                return;
            }
            next();
        });
    };

    next();
};

const promotionSelect = `
    id,
    discount_code,
    discount_percent,
    active,
    min_order_value,
    DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS starts_at,
    DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expires_at,
    usage_limit
`;

const getPromotions = (callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        query(`SELECT ${promotionSelect} FROM discounts ORDER BY active DESC, id DESC`, callback);
    });
};

const createPromotion = (promotion, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        query(
            `INSERT INTO discounts
                (discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
            ],
            callback
        );
    });
};

const updatePromotion = (id, promotion, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        query(
            `UPDATE discounts
            SET discount_code = ?, discount_percent = ?, active = ?, min_order_value = ?, starts_at = ?, expires_at = ?, usage_limit = ?
            WHERE id = ?`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
                id,
            ],
            callback
        );
    });
};

const deletePromotion = (id, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        query("UPDATE discounts SET active = 0 WHERE id = ?", [id], callback);
    });
};

module.exports = {
    ensurePromotionColumns,
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
};
