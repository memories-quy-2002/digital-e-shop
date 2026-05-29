const Cart = require('../models/cartModel');
const Product = require("../models/productModel");
import type {
    CartItemRow,
    CartRow,
    CartValidationIssue,
    CartValidationResult,
    DbError,
    ProductEditorRow,
    ServiceResultMessage,
} from "../types/domain";

async function addItemToCart(pid: number, uid: string, quantity: number): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        Product.getProductById(pid, (productErr: DbError | null, productResults: ProductEditorRow[]) => {
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
            Cart.addItemToCartByUserId(uid, pid, safeQuantity, (err: DbError | null) => {
            if (err) {
                return reject(err);
            }
            Cart.getCartIdByUserId(uid, (err: DbError | null, results: CartRow[]) => {
                if (err) {
                    reject(err);
                }
                if (results.length > 0) {
                    const cartId = results[0].id;
                    Cart.addItemToCart(cartId, pid, safeQuantity, (err: DbError | null) => {
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

async function getCartItems(uid: string): Promise<CartItemRow[]> {
    return new Promise((resolve, reject) => {
        Cart.getCartItemsByUserId(uid, (err: DbError | null, results: CartRow[]) => {
            if (err) {
                return reject(err);
            }
            if (results.length > 0) {
                const cartId = results[0].id;
                Cart.getCartItemsDetails(cartId, (err: DbError | null, results: CartItemRow[]) => {
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

async function deleteCartItem(cartItemId: number): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        Cart.deleteCartItem(cartItemId, (err: DbError | null) => {
            if (err) {
                return reject(err);
            }
            resolve(`Cart item with id = ${cartItemId} has been deleted.`);
        });
    });
}

async function validateCartForCheckout(uid: string): Promise<CartValidationResult> {
    const cartItems = await getCartItems(uid);
    const issues: CartValidationIssue[] = cartItems
        .map((item) => {
            const cartItemId = Number(item.cart_item_id || item.id || 0);
            const productId = Number(item.product_id || 0);
            const productName = String(item.product_name || `Product #${productId}`);
            const requestedQuantity = Number(item.quantity) || 0;
            const availableStock = Number(item.stock) || 0;

            if (availableStock <= 0) {
                return {
                    cartItemId,
                    productId,
                    productName,
                    requestedQuantity,
                    availableStock,
                    reason: "out_of_stock" as const,
                };
            }

            if (requestedQuantity > availableStock) {
                return {
                    cartItemId,
                    productId,
                    productName,
                    requestedQuantity,
                    availableStock,
                    reason: "insufficient_stock" as const,
                };
            }

            return null;
        })
        .filter((issue): issue is CartValidationIssue => issue !== null);

    return {
        valid: cartItems.length > 0 && issues.length === 0,
        cartItems,
        issues,
    };
}

async function updateCartItemQuantity(cartItemId: number, quantity: number): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        Cart.getCartItemStock(cartItemId, (stockErr: DbError | null, stockResults: CartItemRow[]) => {
            if (stockErr) {
                return reject(stockErr);
            }
            const stock = Number(stockResults[0]?.stock) || 0;
            if (stock < safeQuantity) {
                return reject(new Error(`Only ${stock} item(s) available`));
            }
            Cart.updateCartItemQuantity(cartItemId, safeQuantity, (err: DbError | null) => {
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
    validateCartForCheckout,
    updateCartItemQuantity,
    deleteCartItem
}
