import { Injectable } from "@nestjs/common";
import type { DbError, ServiceResultMessage } from "#src/shared/interfaces/domain";
import type {
    CartCheckoutItem,
    CartItemRow,
    CartRow,
    GuestCartItemInput,
    GuestCartPreviewResult,
    CartValidationIssue,
    CartValidationResult,
    CheckoutMismatch,
    CheckoutUnitPrice,
    CheckoutValidationResult,
} from "./cart.types";
import type { ProductEditorRow } from "../products/products.types";
import type { PromotionRow } from "../promotions/promotions.types";
import { CartRepository } from "./cart.repository";
import { NestProductsRepository } from "../products/products.repository";
import { PromotionsRepository } from "../promotions/promotions.repository";
import { env } from "#src/config/env.config";
import { formatPaymentAmount } from "../payments/currency";

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

export function buildCartValidationIssue(item: CartItemRow): CartValidationIssue | null {
    const cartItemId = Number(item.cart_item_id || item.id || 0);
    const productId = Number(item.product_id || 0);
    const productName = String(item.product_name || `Product #${productId}`);
    const requestedQuantity = Number(item.quantity) || 0;
    const rawAvailableStock = item.available_stock ?? item.stock;
    const availableStock = rawAvailableStock === null || rawAvailableStock === undefined ? 0 : Number(rawAvailableStock) || 0;

    if (
        !productId
        || rawAvailableStock === null
        || rawAvailableStock === undefined
        || availableStock < 0
        || (item.stock !== null && item.stock !== undefined && Number(item.stock) < 0)
    ) {
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

export function buildCartValidationResult(cartItems: CartItemRow[]): CartValidationResult {
    const issues = cartItems
        .map(buildCartValidationIssue)
        .filter((issue): issue is CartValidationIssue => issue !== null);

    return {
        valid: cartItems.length > 0 && issues.length === 0,
        cartItems,
        issues,
    };
}

export function coalesceGuestCartItems(items: GuestCartItemInput[]): GuestCartItemInput[] {
    const quantities = new Map<number, number>();
    for (const item of items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
            continue;
        }
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildGuestCartPreviewResult(
    requestedItems: GuestCartItemInput[],
    products: CartItemRow[],
    promotion: Pick<PromotionRow, "discount_code" | "discount_percent" | "min_order_value"> | null,
    requestedDiscountCode?: string,
): GuestCartPreviewResult {
    const productsById = new Map(products.map((product) => [Number(product.product_id || 0), product]));
    const cartItems = requestedItems.map((requestedItem) => {
        const product = productsById.get(requestedItem.productId);
        if (!product) {
            return {
                product_id: requestedItem.productId,
                product_name: `Product #${requestedItem.productId}`,
                quantity: requestedItem.quantity,
                price: 0,
                sale_price: null,
                stock: null,
                available_stock: null,
            } satisfies CartItemRow;
        }

        return { ...product, quantity: requestedItem.quantity };
    });
    const merchandiseTotal = roundCurrency(cartItems.reduce((total, item) => {
        const unitPrice = (normalizeOptionalSalePrice(item.sale_price) ?? Number(item.price)) || 0;
        return total + unitPrice * (Number(item.quantity) || 0);
    }, 0));
    const cartValidation = buildCartValidationResult(cartItems);
    const discountCode = String(requestedDiscountCode || "").trim().toUpperCase();

    let promotionPreview: GuestCartPreviewResult["promotion"] = {
        code: null,
        valid: true,
        discount: 0,
        discountPercent: null,
    };

    if (discountCode && !promotion) {
        promotionPreview = {
            code: discountCode,
            valid: false,
            discount: 0,
            discountPercent: null,
            message: "Discount code is no longer valid.",
        };
    } else if (promotion) {
        const minimumOrderValue = Number(promotion.min_order_value) || 0;
        if (merchandiseTotal < minimumOrderValue) {
            promotionPreview = {
                code: promotion.discount_code,
                valid: false,
                discount: 0,
                discountPercent: Number(promotion.discount_percent) || 0,
                message: `This promotion requires a minimum order of ${formatPaymentAmount(minimumOrderValue, env.storeCurrency)}.`,
            };
        } else {
            const discount = roundCurrency(merchandiseTotal * ((Number(promotion.discount_percent) || 0) / 100));
            promotionPreview = {
                code: promotion.discount_code,
                valid: true,
                discount,
                discountPercent: Number(promotion.discount_percent) || 0,
            };
        }
    }

    return {
        ...cartValidation,
        valid: cartValidation.valid && promotionPreview.valid,
        merchandiseTotal,
        promotion: promotionPreview,
        totalPrice: roundCurrency(Math.max(merchandiseTotal - promotionPreview.discount, 0)),
    };
}

export function compareSubmittedCart(
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

@Injectable()
export class NestCartService {
    constructor(
        private readonly cartRepository: CartRepository,
        private readonly productsRepository: NestProductsRepository,
        private readonly promotionsRepository: PromotionsRepository,
    ) {}

    async addItemToCart(pid: number, uid: string, quantity: number): Promise<ServiceResultMessage> {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        const product = await this.productsRepository.getProductById(pid);
        if (!product) {
            throw new Error("Product not found");
        }
        const availableStock = Number((product as ProductEditorRow).available_stock ?? (product as ProductEditorRow).stock) || 0;
        if (availableStock < safeQuantity) {
            throw new Error(`Only ${availableStock} item(s) available`);
        }

        return new Promise((resolve, reject) => {
            this.cartRepository.addItemToCartByUserId(uid, pid, safeQuantity, (err: DbError | null) => {
                if (err) return reject(err);
                this.cartRepository.getCartIdByUserId(uid, (idErr: DbError | null, results: CartRow[]) => {
                    if (idErr) return reject(idErr);
                    if (results.length > 0) {
                        const cartId = results[0].id;
                        this.cartRepository.addItemToCart(cartId, pid, safeQuantity, (addErr: DbError | null) => {
                            if (addErr) return reject(addErr);
                            resolve(`Product with id = ${pid} has been added to the cart id = ${cartId}`);
                        });
                    } else {
                        resolve("No active cart found for user.");
                    }
                });
            });
        });
    }

    async getCartItems(uid: string): Promise<CartItemRow[]> {
        return new Promise((resolve, reject) => {
            this.cartRepository.getCartItemsByUserId(uid, (err: DbError | null, results: CartRow[]) => {
                if (err) return reject(err);
                if (results.length > 0) {
                    const cartId = results[0].id;
                    this.cartRepository.getCartItemsDetails(cartId, (detailErr: DbError | null, detailResults: CartItemRow[]) => {
                        if (detailErr) return reject(detailErr);
                        resolve(detailResults);
                    });
                } else {
                    resolve([]);
                }
            });
        });
    }

    async getCheckoutCartItems(uid: string): Promise<CartItemRow[]> {
        return new Promise((resolve, reject) => {
            this.cartRepository.getCartItemsByUserId(uid, (err: DbError | null, results: CartRow[]) => {
                if (err) return reject(err);
                if (results.length === 0) {
                    return resolve([]);
                }

                const cartId = results[0].id;
                this.cartRepository.getCheckoutCartItemsDetails(cartId, (detailErr: DbError | null, detailResults: CartItemRow[]) => {
                    if (detailErr) return reject(detailErr);
                    resolve(detailResults || []);
                });
            });
        });
    }

    async deleteCartItem(cartItemId: number): Promise<ServiceResultMessage> {
        return new Promise((resolve, reject) => {
            this.cartRepository.deleteCartItem(cartItemId, (err: DbError | null) => {
                if (err) return reject(err);
                resolve(`Cart item with id = ${cartItemId} has been deleted.`);
            });
        });
    }

    async validateCartForCheckout(uid: string): Promise<CartValidationResult> {
        const cartItems = await this.getCheckoutCartItems(uid);
        return buildCartValidationResult(cartItems);
    }

    async previewGuestCart(items: GuestCartItemInput[], discountCode?: string): Promise<GuestCartPreviewResult> {
        const requestedItems = coalesceGuestCartItems(items);
        const products = await new Promise<CartItemRow[]>((resolve, reject) => {
            this.cartRepository.getGuestCartPreviewItems(
                requestedItems.map((item) => item.productId),
                (err: DbError | null, results: CartItemRow[]) => err ? reject(err) : resolve(results || []),
            );
        });
        const normalizedDiscountCode = String(discountCode || "").trim().toUpperCase();
        const promotion = normalizedDiscountCode
            ? await new Promise<PromotionRow | null>((resolve, reject) => {
                this.promotionsRepository.getActivePromotionByCode(normalizedDiscountCode, (err: DbError | null, results: PromotionRow[]) => {
                    if (err) return reject(err);
                    resolve(results?.[0] || null);
                });
            })
            : null;

        return buildGuestCartPreviewResult(requestedItems, products, promotion, normalizedDiscountCode);
    }

    async validateCheckoutSubmission(
        uid: string,
        submittedCart: CartCheckoutItem[],
        submittedTotalPrice: number,
    ): Promise<CheckoutValidationResult> {
        const cartItems = await this.getCheckoutCartItems(uid);
        const validationResult = buildCartValidationResult(cartItems);
        const { mismatches, authoritativeTotalPrice } = compareSubmittedCart(cartItems, submittedCart, submittedTotalPrice);

        return {
            ...validationResult,
            valid: validationResult.valid && mismatches.length === 0,
            mismatches,
            authoritativeTotalPrice,
        };
    }

    async updateCartItemQuantity(cartItemId: number, quantity: number): Promise<ServiceResultMessage> {
        const safeQuantity = Math.max(1, Number(quantity) || 1);
        return new Promise((resolve, reject) => {
            this.cartRepository.getCartItemStock(cartItemId, (stockErr: DbError | null, stockResults: CartItemRow[]) => {
                if (stockErr) return reject(stockErr);
                const stock = Number(stockResults[0]?.available_stock ?? stockResults[0]?.stock) || 0;
                if (stock < safeQuantity) {
                    return reject(new Error(`Only ${stock} item(s) available`));
                }
                this.cartRepository.updateCartItemQuantity(cartItemId, safeQuantity, (err: DbError | null) => {
                    if (err) return reject(err);
                    resolve(`Cart item with id = ${cartItemId} has been updated.`);
                });
            });
        });
    }
}
