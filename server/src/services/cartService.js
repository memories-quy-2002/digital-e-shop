const Cart = require('../models/cartModel');

async function addItemToCart(pid, uid, quantity) {
    return new Promise((resolve, reject) => {
        Cart.addItemToCartByUserId(uid, pid, quantity, (err) => {
            if (err) {
                return reject(err);
            }
            Cart.getCartIdByUserId(uid, (err, results) => {
                if (err) {
                    reject(err);
                }
                if (results.length > 0) {
                    const cartId = results[0].id;
                    Cart.addItemToCart(cartId, pid, quantity, (err) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(`Product with id = ${pid} has been added to the cart id = ${cartId}`);
                    });
                } else {
                    resolve('No active cart found for user.');
                }
            });
        })
    })
}

async function getCartItems(uid) {
    return new Promise((resolve, reject) => {
        Cart.getCartItemsByUserId(uid, (err, results) => {
            if (err) {
                return reject(err);
            }
            if (results.length > 0) {
                const cartId = results[0].id;
                Cart.getCartItemsDetails(cartId, (err, results) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(results);
                });
            } else {
                resolve([]);
            }
        });
    });
}

async function deleteCartItem(cartItemId) {
    return new Promise((resolve, reject) => {
        Cart.deleteCartItem(cartItemId, (err) => {
            if (err) {
                return reject(err);
            }
            resolve(`Cart item with id = ${cartItemId} has been deleted.`);
        });
    });
}

module.exports = {
    addItemToCart,
    getCartItems,
    deleteCartItem
}