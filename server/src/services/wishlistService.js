const Wishlist = require('../models/wishlistModel');

async function addItemToWishlist(uid, pid) {
    return new Promise((resolve, reject) => {
        Wishlist.addItemToWishlist(uid, pid, (err) => {
            if (err) {
                reject(err);
            }
            resolve(
                `Product with id = ${pid} has been added successfully to the user id = ${uid}`,
            );
        });
    });
}

async function getWishlist(uid) {
    return new Promise((resolve, reject) => {
        Wishlist.getWishlist(uid, (err, results) => {
            if (err) {
                reject(err);
            }
            resolve(results);
        });
    });
}

async function deleteWishlistItem(uid, pid) {
    return new Promise((resolve, reject) => {
        Wishlist.deleteWishlistItem(uid, pid, (err) => {
            if (err) {
                reject(err);
            }
            resolve(
                `Wishlist item with product_id = ${pid} has been deleted for user_id = ${uid}`
            );
        });
    });
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem
}