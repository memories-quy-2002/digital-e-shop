import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { CustomerAddressInput, CustomerAddressRow } from "./addresses.types";

let tableReady = false;

const query = (sql: string, params?: QueryParams, callback?: QueryCallback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensureAddressTable = (callback: QueryCallback<void>) => {
    if (tableReady) {
        callback();
        return;
    }

    query(
        `CREATE TABLE IF NOT EXISTS customer_addresses (
            id INT NOT NULL AUTO_INCREMENT,
            user_id VARCHAR(255) NOT NULL,
            label VARCHAR(80) NOT NULL DEFAULT 'Shipping address',
            recipient_name VARCHAR(160) NULL,
            phone_number VARCHAR(40) NULL,
            address_line VARCHAR(255) NOT NULL,
            city VARCHAR(120) NULL,
            country VARCHAR(120) NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX customer_addresses_user_id_idx (user_id)
        )`,
        (err: Error | null) => {
            if (err) return callback(err);
            tableReady = true;
            callback();
        }
    );
};

const getAddressesByUserId = (uid: string, callback: QueryCallback<CustomerAddressRow[]>) => {
    ensureAddressTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            `SELECT id, user_id, label, recipient_name, phone_number, address_line, city, country,
                is_default, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
                DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at
            FROM customer_addresses
            WHERE user_id = ?
            ORDER BY is_default DESC, updated_at DESC, id DESC`,
            [uid],
            callback
        );
    });
};

const clearDefaultAddress = (uid: string, callback: QueryCallback<UpdateResult>) => {
    query("UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?", [uid], callback);
};

const createAddress = (uid: string, address: CustomerAddressInput, callback: QueryCallback) => {
    ensureAddressTable((err: Error | null) => {
        if (err) return callback(err);

        const insertAddress = () => {
            query(
                `INSERT INTO customer_addresses
                    (user_id, label, recipient_name, phone_number, address_line, city, country, is_default)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uid,
                    address.label,
                    address.recipientName,
                    address.phoneNumber,
                    address.addressLine,
                    address.city,
                    address.country,
                    address.isDefault ? 1 : 0,
                ],
                callback
            );
        };

        if (address.isDefault) {
            clearDefaultAddress(uid, (clearErr: Error | null) => {
                if (clearErr) return callback(clearErr);
                insertAddress();
            });
            return;
        }

        insertAddress();
    });
};

const updateAddress = (uid: string, addressId: number, address: CustomerAddressInput, callback: QueryCallback<UpdateResult>) => {
    ensureAddressTable((err: Error | null) => {
        if (err) return callback(err);

        const updateCurrentAddress = () => {
            query(
                `UPDATE customer_addresses
                SET label = ?, recipient_name = ?, phone_number = ?, address_line = ?, city = ?, country = ?, is_default = ?
                WHERE id = ? AND user_id = ?`,
                [
                    address.label,
                    address.recipientName,
                    address.phoneNumber,
                    address.addressLine,
                    address.city,
                    address.country,
                    address.isDefault ? 1 : 0,
                    addressId,
                    uid,
                ],
                callback
            );
        };

        if (address.isDefault) {
            clearDefaultAddress(uid, (clearErr: Error | null) => {
                if (clearErr) return callback(clearErr);
                updateCurrentAddress();
            });
            return;
        }

        updateCurrentAddress();
    });
};

const deleteAddress = (uid: string, addressId: number, callback: QueryCallback<UpdateResult>) => {
    ensureAddressTable((err: Error | null) => {
        if (err) return callback(err);
        query("DELETE FROM customer_addresses WHERE id = ? AND user_id = ?", [addressId, uid], callback);
    });
};

module.exports = {
    ensureAddressTable,
    getAddressesByUserId,
    createAddress,
    updateAddress,
    deleteAddress,
};

