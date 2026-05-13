const Cart = require('../models/cartModel');
const Product = require("../models/productModel");

async function addItemToCart(pid, uid, quantity) {
    return new Promise((resolve, reject) => {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        Product.getProductById(pid, (productErr, productResults) => {
            if (productErr) {
                return reject(productErr);
            }
            const product = productResults[0];
            if (!product) {
                return reject(new Error("Product not found"));
            }
            if (product.stock < safeQuantity) {
                return reject(new Error(`Only ${product.stock} item(s) available`));
            }
            Cart.addItemToCartByUserId(uid, pid, safeQuantity, (err) => {
            if (err) {
                return reject(err);
            }
            Cart.getCartIdByUserId(uid, (err, results) => {
                if (err) {
                    reject(err);
                }
                if (results.length > 0) {
                    const cartId = results[0].id;
                    Cart.addItemToCart(cartId, pid, safeQuantity, (err) => {
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
        });
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

async function updateCartItemQuantity(cartItemId, quantity) {
    return new Promise((resolve, reject) => {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        Cart.getCartItemStock(cartItemId, (stockErr, stockResults) => {
            if (stockErr) {
                return reject(stockErr);
            }
            const stock = Number(stockResults[0]?.stock) || 0;
            if (stock < safeQuantity) {
                return reject(new Error(`Only ${stock} item(s) available`));
            }
            Cart.updateCartItemQuantity(cartItemId, safeQuantity, (err) => {
            if (err) {
                return reject(err);
            }
            resolve(`Cart item with id = ${cartItemId} has been updated.`);
            });
        });
    });
}

module.exports = {
    addItemToCart,
    getCartItems,
    updateCartItemQuantity,
    deleteCartItem
}
