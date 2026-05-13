const pool = require("../config/db");

const getReviewByUserAndProduct = (uid, pid, callback) => {
    pool.query("SELECT id FROM reviews WHERE user_id = ? AND product_id = ? LIMIT 1", [uid, pid], callback);
};

const addReviewByUserId = (uid, pid, rating, reviewText, callback) => {
    pool.query(
        "INSERT INTO reviews (user_id, product_id, rating, review_text, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())",
        [uid, pid, rating, reviewText],
        callback
    );
};

const updateReviewByUserAndProduct = (uid, pid, rating, reviewText, callback) => {
    pool.query(
        "UPDATE reviews SET rating = ?, review_text = ?, created_at = UTC_TIMESTAMP() WHERE user_id = ? AND product_id = ?",
        [rating, reviewText, uid, pid],
        callback
    );
};

const getReviews = (pid, callback) => {
    pool.query(
        `SELECT 
            r.id,
            r.user_id,
            u.username,
            r.rating,
            r.review_text,
            DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
            EXISTS (
                SELECT 1
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.user_id = r.user_id
                    AND oi.product_id = r.product_id
                    AND o.status <> 2
            ) AS verified_purchase
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC`,
        [pid],
        callback
    );
};

const getReviewsPaginated = (pid, limit, offset, callback) => {
    pool.query(
        `SELECT
            r.id,
            r.user_id,
            u.username,
            r.rating,
            r.review_text,
            DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
            EXISTS (
                SELECT 1
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.user_id = r.user_id
                    AND oi.product_id = r.product_id
                    AND o.status <> 2
            ) AS verified_purchase
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?`,
        [pid, limit, offset],
        callback
    );
};

const getReviewsCount = (pid, callback) => {
    pool.query("SELECT COUNT(*) AS total FROM reviews WHERE product_id = ?", [pid], callback);
};

const getRatingSummary = (pid, callback) => {
    pool.query(
        `SELECT
            COUNT(*) AS total,
            ROUND(COALESCE(AVG(rating), 0), 1) AS average,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one
        FROM reviews
        WHERE product_id = ?`,
        [pid],
        callback
    );
};

module.exports = {
    getReviewByUserAndProduct,
    addReviewByUserId,
    updateReviewByUserAndProduct,
    getReviews,
    getReviewsPaginated,
    getReviewsCount,
    getRatingSummary,
};
