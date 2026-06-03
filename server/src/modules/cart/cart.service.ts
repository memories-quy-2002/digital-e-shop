const Cart = require("./cart.repository");
const Product = require("#/modules/products/products.repository");
import type {
    DbError,
    ServiceResultMessage,
} from "#/shared/interfaces/domain";
import type {
    CartCheckoutItem,
    CartItemRow,
    CartRow,
    CartValidationIssue,
    CartValidationResult,
    CheckoutMismatch,
    CheckoutUnitPrice,
    CheckoutValidationResult,
} from "./cart.types";
import type { ProductEditorRow } from "#/modules/products/products.types";

const normalizeOptionalSalePrice = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    return numericValue;
};

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

async function getCheckoutCartItems(uid: string): Promise<CartItemRow[]> {
    return new Promise((resolve, reject) => {
        Cart.getCartItemsByUserId(uid, (err: DbError | null, results: CartRow[]) => {
            if (err) {
                return reject(err);
            }
            if (results.length === 0) {
                return resolve([]);
            }

            const cartId = results[0].id;
            Cart.getCheckoutCartItemsDetails(cartId, (detailErr: DbError | null, detailResults: CartItemRow[]) => {
                if (detailErr) {
                    return reject(detailErr);
                }
                resolve(detailResults || []);
            });
        });
    });
}

function buildCartValidationIssue(item: CartItemRow): CartValidationIssue | null {
    const cartItemId = Number(item.cart_item_id || item.id || 0);
    const productId = Number(item.product_id || 0);
    const productName = String(item.product_name || `Product #${productId}`);
    const requestedQuantity = Number(item.quantity) || 0;
    const availableStock = item.stock === null || item.stock === undefined ? 0 : Number(item.stock) || 0;

    if (!productId || item.stock === null || item.stock === undefined || availableStock < 0) {
        return {
            cartItemId,
            productId,
            productName,
            requestedQuantity,
            availableStock: 0,
            reason: "unavailable",
        };
    }

    if (availableStock <= 0) {
        return {
            cartItemId,
            productId,
            productName,
            requestedQuantity,
            availableStock,
            reason: "out_of_stock",
        };
    }

    if (requestedQuantity > availableStock) {
        return {
            cartItemId,
            productId,
            productName,
            requestedQuantity,
            availableStock,
            reason: "insufficient_stock",
        };
    }

    return null;
}

function buildCartValidationResult(cartItems: CartItemRow[]): CartValidationResult {
    const issues = cartItems
        .map(buildCartValidationIssue)
        .filter((issue): issue is CartValidationIssue => issue !== null);

    return {
        valid: cartItems.length > 0 && issues.length === 0,
        cartItems,
        issues,
    };
}

function compareSubmittedCart(
    authoritativeCartItems: CartItemRow[],
    submittedCart: CartCheckoutItem[],
    submittedTotalPrice: number,
): { mismatches: CheckoutMismatch[]; authoritativeTotalPrice: number } {
    const authoritativeById = new Map<number, { quantity: number; unitPrice: CheckoutUnitPrice; productName: string }>();
    authoritativeCartItems.forEach((item) => {
        const productId = Number(item.product_id || 0);
        if (!productId) {
            return;
        }
        authoritativeById.set(productId, {
            quantity: Number(item.quantity) || 0,
            unitPrice: {
                price: Number(item.price) || 0,
                sale_price: normalizeOptionalSalePrice(item.sale_price),
            },
            productName: String(item.product_name || `Product #${productId}`),
        });
    });

    const submittedById = new Map<number, { quantity: number; unitPrice: number; productName: string }>();
    submittedCart.forEach((item) => {
        const productId = Number(item.productId || 0);
        const quantity = Number(item.quantity) || 0;
        const salePrice = normalizeOptionalSalePrice(item.sale_price);
        const unitPrice = salePrice !== null ? salePrice : Number(item.price) || 0;
        const existing = submittedById.get(productId);

        if (existing) {
            existing.quantity += quantity;
        } else if (productId) {
            submittedById.set(productId, {
                quantity,
                unitPrice,
                productName: `Product #${productId}`,
            });
        }
    });

    const mismatches: CheckoutMismatch[] = [];
    let authoritativeTotalPrice = 0;

    authoritativeById.forEach((authoritativeItem, productId) => {
        const authoritativeUnitPrice = authoritativeItem.unitPrice.sale_price ?? authoritativeItem.unitPrice.price;
        authoritativeTotalPrice += authoritativeUnitPrice * authoritativeItem.quantity;

        const submittedItem = submittedById.get(productId);
        if (!submittedItem) {
            mismatches.push({
                productId,
                productName: authoritativeItem.productName,
                reason: "missing_item",
                authoritativeQuantity: authoritativeItem.quantity,
                authoritativeUnitPrice,
            });
            return;
        }

        if (submittedItem.quantity !== authoritativeItem.quantity) {
            mismatches.push({
                productId,
                productName: authoritativeItem.productName,
                reason: "quantity_changed",
                submittedQuantity: submittedItem.quantity,
                authoritativeQuantity: authoritativeItem.quantity,
            });
        }

        if (Math.abs(submittedItem.unitPrice - authoritativeUnitPrice) > 0.01) {
            mismatches.push({
                productId,
                productName: authoritativeItem.productName,
                reason: "price_changed",
                submittedUnitPrice: submittedItem.unitPrice,
                authoritativeUnitPrice,
            });
        }

        submittedById.delete(productId);
    });

    submittedById.forEach((submittedItem, productId) => {
        mismatches.push({
            productId,
            productName: submittedItem.productName,
            reason: "unexpected_item",
            submittedQuantity: submittedItem.quantity,
            submittedUnitPrice: submittedItem.unitPrice,
        });
    });

    if (Math.abs(Number(submittedTotalPrice || 0) - authoritativeTotalPrice) > 0.01) {
        mismatches.push({
            productId: 0,
            productName: "Cart total",
            reason: "total_changed",
            submittedTotalPrice: Number(submittedTotalPrice || 0),
            authoritativeTotalPrice,
        });
    }

    return { mismatches, authoritativeTotalPrice };
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
    const cartItems = await getCheckoutCartItems(uid);
    return buildCartValidationResult(cartItems);
}

async function validateCheckoutSubmission(
    uid: string,
    submittedCart: CartCheckoutItem[],
    submittedTotalPrice: number,
): Promise<CheckoutValidationResult> {
    const cartItems = await getCheckoutCartItems(uid);
    const validationResult = buildCartValidationResult(cartItems);
    const { mismatches, authoritativeTotalPrice } = compareSubmittedCart(cartItems, submittedCart, submittedTotalPrice);

    return {
        ...validationResult,
        valid: validationResult.valid && mismatches.length === 0,
        mismatches,
        authoritativeTotalPrice,
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
    getCheckoutCartItems,
    validateCartForCheckout,
    validateCheckoutSubmission,
    updateCartItemQuantity,
    deleteCartItem
}
