const pool = require("../config/db");

const getReviewsByProductId = (pid, callback) => {
    pool.query('SELECT reviews, rating FROM products WHERE id = ?', [productId], callback);
}

const addReviewByUserId = (uid, pid, rating, reviewText, callback) => {
    pool.query('INSERT INTO reviews (user_id, product_id, rating, review_text) VALUES (?, ?, ?, ?)', [uid, pid, rating, reviewText], callback);
}

const updateProductReviews = (newReviews, newRating, pid, callback) => {
    pool.query('UPDATE products SET reviews = ?, rating = ? WHERE id = ?', [newReviews, newRating, pid], callback);
}

const getReviews = (pid, callback) => {
    pool.query(
        `SELECT u.username, r.rating, r.review_text, r.created_at FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ?`, [pid],
        callback
    );
}

module.exports = {
    getReviewsByProductId,
    addReviewByUserId,
    updateProductReviews,
    getReviews
};