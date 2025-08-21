const Review = require('../models/reviewModel');

async function addReview(uid, pid, rating, comment) {
    return new Promise((resolve, reject) => {
        Review.getReviewsByProductId(productId, (err, results) => {
            if (err) {
                return reject(err);
            }
            Review.addReviewByUserId(uid, pid, rating, comment, (err, results) => {
                if (err) {
                    return reject(err);
                }
                const newReviews = results.insertId;
                const newRating = rating; // Assuming you want to update the rating with the new review's rating
                Review.updateProductReviews(newReviews, newRating, pid, (err) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(`The review has been added to the product with id = ${pid}`);
                });
            });
        });
    })
}

async function getReviews(pid) {
    return new Promise((resolve, reject) => {
        Review.getReviews(pid, async (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        })
    })
}

module.exports = {
    addReview,
    getReviews
}