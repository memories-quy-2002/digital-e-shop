const Wishlist = require('../models/wishlistModel');
import type { DbError, ServiceResultMessage, WishlistRow } from "../types/domain";

async function addItemToWishlist(uid: string, pid: number): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        Wishlist.addItemToWishlist(uid, pid, (err: DbError | null) => {
            if (err) {
                reject(err);
            }
            resolve(
                `Product with id = ${pid} has been added successfully to the user id = ${uid}`,
            );
        });
    });
}

async function getWishlist(uid: string): Promise<WishlistRow[]> {
    return new Promise((resolve, reject) => {
        Wishlist.getWishlist(uid, (err: DbError | null, results: WishlistRow[]) => {
            if (err) {
                reject(err);
            }
            resolve(results);
        });
    });
}

async function deleteWishlistItem(uid: string, pid: number): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        Wishlist.deleteWishlistItem(uid, pid, (err: DbError | null) => {
            if (err) {
                reject(err);
            }
            resolve(
                `Wishlist item with product_id = ${pid} has been deleted for user_id = ${uid}`
            );
        });
    });
}

async function deleteWishlistItems(uid: string, productIds: number[]): Promise<ServiceResultMessage> {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return resolve("No wishlist items selected.");
        }

        Wishlist.deleteWishlistItems(uid, productIds, (err: DbError | null) => {
            if (err) {
                return reject(err);
            }
            resolve(`${productIds.length} wishlist item(s) deleted for user_id = ${uid}`);
        });
    });
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem,
    deleteWishlistItems
}
