const pool = require("../config/db");

const createDiscountsTableSql = `
    CREATE TABLE IF NOT EXISTS discounts (
        id INT NOT NULL AUTO_INCREMENT,
        discount_code VARCHAR(50) NOT NULL,
        discount_percent DECIMAL(5,2) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0,
        starts_at DATETIME NULL,
        expires_at DATETIME NULL,
        usage_limit INT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY discounts_discount_code_unique (discount_code)
    )
`;

let promotionColumns = null;

const query = (sql, params, callback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensurePromotionColumns = (callback) => {
    if (promotionColumns) {
        callback();
        return;
    }

    ensureDiscountsTable((tableErr) => {
        if (tableErr) {
            callback(tableErr);
            return;
        }

        loadPromotionColumns(callback);
    });
};

const ensureDiscountsTable = (callback) => {
    query("SHOW COLUMNS FROM discounts", (selectErr) => {
        if (!selectErr) {
            callback();
            return;
        }

        if (selectErr.code !== "ER_NO_SUCH_TABLE") {
            callback(selectErr);
            return;
        }

        query(createDiscountsTableSql, callback);
    });
};

const loadPromotionColumns = (callback) => {
    query("SHOW COLUMNS FROM discounts", (err, rows) => {
        if (err) return callback(err);
        promotionColumns = new Set((rows || []).map((row) => row.Field));
        callback();
    });
};

const hasColumn = (column) => promotionColumns?.has(column);

const getPromotionSelect = () => [
    "id",
    "discount_code",
    "discount_percent",
    hasColumn("active") ? "active" : "1 AS active",
    hasColumn("min_order_value") ? "min_order_value" : "0 AS min_order_value",
    hasColumn("starts_at") ? "DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS starts_at" : "NULL AS starts_at",
    hasColumn("expires_at") ? "DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expires_at" : "NULL AS expires_at",
    hasColumn("usage_limit") ? "usage_limit" : "NULL AS usage_limit",
].join(",\n    ");

const getPromotionOrder = () => `${hasColumn("active") ? "active DESC, " : ""}id DESC`;

const optionalInsertFields = [
    ["active", "active"],
    ["min_order_value", "minOrderValue"],
    ["starts_at", "startsAt"],
    ["expires_at", "expiresAt"],
    ["usage_limit", "usageLimit"],
];

const buildPromotionInsert = (promotion) => {
    const fields = ["discount_code", "discount_percent"];
    const values = [promotion.discountCode, promotion.discountPercent];

    optionalInsertFields.forEach(([column, key]) => {
        if (hasColumn(column)) {
            fields.push(column);
            values.push(promotion[key]);
        }
    });

    return {
        sql: `INSERT INTO discounts (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
        values,
    };
};

const buildPromotionUpdate = (promotion, id) => {
    const assignments = ["discount_code = ?", "discount_percent = ?"];
    const values = [promotion.discountCode, promotion.discountPercent];

    optionalInsertFields.forEach(([column, key]) => {
        if (hasColumn(column)) {
            assignments.push(`${column} = ?`);
            values.push(promotion[key]);
        }
    });

    values.push(id);

    return {
        sql: `UPDATE discounts SET ${assignments.join(", ")} WHERE id = ?`,
        values,
    };
};

const getPromotions = (callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        query(`SELECT ${getPromotionSelect()} FROM discounts ORDER BY ${getPromotionOrder()}`, callback);
    });
};

const createPromotion = (promotion, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        const insert = buildPromotionInsert(promotion);
        query(insert.sql, insert.values, callback);
    });
};

const updatePromotion = (id, promotion, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        const update = buildPromotionUpdate(promotion, id);
        query(update.sql, update.values, callback);
    });
};

const deletePromotion = (id, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);
        if (hasColumn("active")) {
            query("UPDATE discounts SET active = 0 WHERE id = ?", [id], callback);
            return;
        }
        query("DELETE FROM discounts WHERE id = ?", [id], callback);
    });
};

const getActivePromotionByCode = (discountCode, callback) => {
    ensurePromotionColumns((err) => {
        if (err) return callback(err);

        const conditions = ["discount_code = ?"];
        if (hasColumn("active")) conditions.push("active = 1");
        if (hasColumn("starts_at")) conditions.push("(starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())");
        if (hasColumn("expires_at")) conditions.push("(expires_at IS NULL OR expires_at >= UTC_TIMESTAMP())");

        query(
            `SELECT ${getPromotionSelect()}
            FROM discounts
            WHERE ${conditions.join(" AND ")}`,
            [discountCode],
            callback
        );
    });
};

module.exports = {
    ensurePromotionColumns,
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    getActivePromotionByCode,
};
