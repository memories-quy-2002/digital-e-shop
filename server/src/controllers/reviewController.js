const pool = require("../config/db");

const addReview = (req, res) => {
    const { uid, pid, rating, reviewText } = req.body
    // console.log(rating);

    if (!pid || !rating) {
        return res.status(400).json({ msg: 'Please provide productId and rating' });
    }
    pool.query('SELECT reviews, rating FROM products WHERE id = ?', [pid], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        const currentReviews = results[0].reviews || 0;
        const currentRating = results[0].rating || 0;


        const newReviews = currentReviews + 1;
        const newRating = (currentRating * currentReviews + rating) / newReviews;

        pool.query('INSERT INTO reviews (user_id, product_id, rating, review_text) VALUES (?, ?, ?, ?)', [uid, pid, rating, reviewText], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ msg: 'Database error when adding review' });
            }

            pool.query('UPDATE products SET reviews = ?, rating = ? WHERE id = ?', [newReviews, newRating, pid], (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ msg: 'Database error when updating product' });
                }

                res.status(200).json({
                    msg: `The review has been added to the product with id = ${pid}`,
                })
            });
        });
    });
}

const getReviews = (req, res) => {
    const pid = req.params.pid
    pool.query(
        `SELECT u.username, r.rating, r.review_text, r.created_at FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ?`, [pid],
        (err, results) => {
            if (err) {
                console.error(err.message);
            }
            else {
                if (results.length > 0) {
                    res.status(200).json({
                        reviews: results,
                        msg: `Reviews of product id = ${pid} have been retrieved successfully`,
                    })
                }
                else {
                    res.status(204).json({
                        msg: 'Review not found'
                    })
                }
            }
        }
    );
}

module.exports = {
    addReview,
    getReviews
};