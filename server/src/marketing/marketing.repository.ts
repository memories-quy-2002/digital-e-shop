import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError, UpdateResult } from "#src/shared/interfaces/database";
import type { MarketingSubscriptionRow } from "./marketing.types";

@Injectable()
export class MarketingRepository {
    findByEmail(email: string): Promise<MarketingSubscriptionRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                "SELECT id, email, status, unsubscribe_token_hash, source, subscribed_at, unsubscribed_at FROM marketing_subscriptions WHERE email = ? LIMIT 1",
                [email],
                (err: DbError | null, results?: MarketingSubscriptionRow[]) => {
                    if (err) return reject(err);
                    resolve(results?.[0] || null);
                },
            );
        });
    }

    upsertSubscription(email: string, tokenHash: string, source: string): Promise<MarketingSubscriptionRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `INSERT INTO marketing_subscriptions
                    (email, status, unsubscribe_token_hash, source, subscribed_at, unsubscribed_at)
                 VALUES (?, 'ACTIVE', ?, ?, UTC_TIMESTAMP(), NULL)
                 ON DUPLICATE KEY UPDATE
                    status = 'ACTIVE',
                    unsubscribe_token_hash = VALUES(unsubscribe_token_hash),
                    source = VALUES(source),
                    subscribed_at = UTC_TIMESTAMP(),
                    unsubscribed_at = NULL`,
                [email, tokenHash, source],
                (err: DbError | null) => {
                    if (err) return reject(err);
                    this.findByEmail(email).then(resolve).catch(reject);
                },
            );
        });
    }

    findByUnsubscribeTokenHash(tokenHash: string): Promise<MarketingSubscriptionRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT id, email, status, unsubscribe_token_hash, source, subscribed_at, unsubscribed_at
                 FROM marketing_subscriptions
                 WHERE unsubscribe_token_hash = ? AND status = 'ACTIVE'
                 LIMIT 1`,
                [tokenHash],
                (err: DbError | null, results?: MarketingSubscriptionRow[]) => {
                    if (err) return reject(err);
                    resolve(results?.[0] || null);
                },
            );
        });
    }

    unsubscribeByTokenHash(tokenHash: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE marketing_subscriptions
                 SET status = 'UNSUBSCRIBED',
                     unsubscribe_token_hash = NULL,
                     unsubscribed_at = UTC_TIMESTAMP()
                 WHERE unsubscribe_token_hash = ? AND status = 'ACTIVE'`,
                [tokenHash],
                (err: DbError | null, result?: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }
}
