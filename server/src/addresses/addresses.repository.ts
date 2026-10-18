import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult, InsertResult } from "#src/shared/interfaces/domain";
import type { CustomerAddressInput, CustomerAddressRow } from "./addresses.types";

@Injectable()
export class AddressesRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    private clearDefaultAddress(uid: string, callback: QueryCallback<UpdateResult>) {
        this.query("UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?", [uid], callback);
    }

    getAddressesByUserId(uid: string): Promise<CustomerAddressRow[]> {
        return new Promise((resolve, reject) => {
            this.query(
                `SELECT id, user_id, label, recipient_name, phone_number, address_line, city, country,
                    province_code, province_name, ward_code, ward_name, latitude, longitude,
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
    }

    createAddress(uid: string, address: CustomerAddressInput): Promise<InsertResult> {
        return new Promise((resolve, reject) => {
            const insertAddress = () => {
                this.query(
                    `INSERT INTO customer_addresses
                        (user_id, label, recipient_name, phone_number, address_line, city, country,
                         province_code, province_name, ward_code, ward_name, latitude, longitude, is_default)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        uid,
                        address.label,
                        address.recipientName,
                        address.phoneNumber,
                        address.addressLine,
                        address.city,
                        address.country,
                        null,
                        null,
                        null,
                        null,
                        address.latitude,
                        address.longitude,
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
    }

    updateAddress(uid: string, addressId: number, address: CustomerAddressInput): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            const updateCurrentAddress = () => {
                this.query(
                    `UPDATE customer_addresses
                    SET label = ?, recipient_name = ?, phone_number = ?, address_line = ?, city = ?, country = ?,
                        latitude = ?, longitude = ?, is_default = ?
                    WHERE id = ? AND user_id = ?`,
                    [
                        address.label,
                        address.recipientName,
                        address.phoneNumber,
                        address.addressLine,
                        address.city,
                        address.country,
                        address.latitude,
                        address.longitude,
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
    }

    updateAddressLocation(uid: string, addressId: number, latitude: number, longitude: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.query("UPDATE customer_addresses SET latitude = ?, longitude = ? WHERE id = ? AND user_id = ?", [latitude, longitude, addressId, uid],
                (queryErr: Error | null, result: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result);
                });
        });
    }

    async addressBelongsToUser(uid: string, addressId: number): Promise<boolean> {
        const rows = await new Promise<Array<{ id: number }>>((resolve, reject) => {
            this.query("SELECT id FROM customer_addresses WHERE id = ? AND user_id = ? LIMIT 1", [addressId, uid],
                (queryErr: Error | null, result: Array<{ id: number }>) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result);
                });
        });
        return rows.length > 0;
    }

    deleteAddress(uid: string, addressId: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.query(
                "DELETE FROM customer_addresses WHERE id = ? AND user_id = ?",
                [addressId, uid],
                (queryErr: Error | null, result: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result);
                },
            );
        });
    }
}
