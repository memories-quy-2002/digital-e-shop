import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult, InsertResult } from "#src/shared/interfaces/domain";
import type { CustomerAddressInput, CustomerAddressRow } from "./addresses.types";

@Injectable()
export class AddressesRepository {
    private tableReady = false;

    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    private ensureAddressTable(callback: QueryCallback<void>) {
        if (this.tableReady) {
            callback();
            return;
        }

        this.query(
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
            undefined,
            (err: Error | null) => {
                if (err) return callback(err);
                this.tableReady = true;
                callback();
            },
        );
    }

    private clearDefaultAddress(uid: string, callback: QueryCallback<UpdateResult>) {
        this.query("UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?", [uid], callback);
    }

    getAddressesByUserId(uid: string): Promise<CustomerAddressRow[]> {
        return new Promise((resolve, reject) => {
            this.ensureAddressTable((err) => {
                if (err) return reject(err);
                this.query(
                    `SELECT id, user_id, label, recipient_name, phone_number, address_line, city, country,
                        is_default, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
                        DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at
                    FROM customer_addresses
                    WHERE user_id = ?
                    ORDER BY is_default DESC, updated_at DESC, id DESC`,
                    [uid],
                    (queryErr: Error | null, rows: CustomerAddressRow[]) => {
                        if (queryErr) return reject(queryErr);
                        resolve(rows);
                    },
                );
            });
        });
    }

    createAddress(uid: string, address: CustomerAddressInput): Promise<InsertResult> {
        return new Promise((resolve, reject) => {
            this.ensureAddressTable((err) => {
                if (err) return reject(err);

                const insertAddress = () => {
                    this.query(
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
                        (queryErr: Error | null, result: InsertResult) => {
                            if (queryErr) return reject(queryErr);
                            resolve(result);
                        },
                    );
                };

                if (address.isDefault) {
                    this.clearDefaultAddress(uid, (clearErr) => {
                        if (clearErr) return reject(clearErr);
                        insertAddress();
                    });
                    return;
                }

                insertAddress();
            });
        });
    }

    updateAddress(uid: string, addressId: number, address: CustomerAddressInput): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.ensureAddressTable((err) => {
                if (err) return reject(err);

                const updateCurrentAddress = () => {
                    this.query(
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
                        (queryErr: Error | null, result: UpdateResult) => {
                            if (queryErr) return reject(queryErr);
                            resolve(result);
                        },
                    );
                };

                if (address.isDefault) {
                    this.clearDefaultAddress(uid, (clearErr) => {
                        if (clearErr) return reject(clearErr);
                        updateCurrentAddress();
                    });
                    return;
                }

                updateCurrentAddress();
            });
        });
    }

    deleteAddress(uid: string, addressId: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.ensureAddressTable((err) => {
                if (err) return reject(err);
                this.query(
                    "DELETE FROM customer_addresses WHERE id = ? AND user_id = ?",
                    [addressId, uid],
                    (queryErr: Error | null, result: UpdateResult) => {
                        if (queryErr) return reject(queryErr);
                        resolve(result);
                    },
                );
            });
        });
    }
}
