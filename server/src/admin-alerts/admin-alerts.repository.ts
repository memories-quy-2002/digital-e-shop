import { Injectable } from "@nestjs/common";
import util from "node:util";
import pool from "#src/config/database.config";
import type { AdminAlert } from "./admin-alerts.types";

const query = util.promisify(pool.query).bind(pool) as (sql: string, values?: unknown[]) => Promise<AdminAlert[]>;

const safeQuery = async (sql: string, values: unknown[] = []): Promise<AdminAlert[]> => {
    try {
        return await query(sql, values);
    } catch {
        return [];
    }
};

@Injectable()
export class AdminAlertsRepository {
    async getAlerts(): Promise<AdminAlert[]> {
        const [orders, payments, inventory, support, customers] = await Promise.all([
            safeQuery(
                `SELECT CONCAT('order-', o.id) AS id, 'order' AS type,
                    CONCAT('Order #', o.id, ' needs review') AS title,
                    CONCAT('A pending order worth $', FORMAT(o.total_price - o.discount, 2), ' is waiting for action.') AS description,
                    DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    'High' AS priority, 'Open orders' AS actionLabel, '/admin/orders' AS route, TRUE AS unread
                 FROM orders o WHERE o.status = 0 ORDER BY o.date_added DESC LIMIT 20`,
            ),
            safeQuery(
                `SELECT CONCAT('payment-', o.id) AS id, 'payment' AS type,
                    CONCAT('Payment review for order #', o.id) AS title,
                    'Confirm the bank transfer before completing the order.' AS description,
                    DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    'Medium' AS priority, 'Review payment' AS actionLabel, '/admin/orders' AS route, TRUE AS unread
                 FROM orders o WHERE o.status = 0 AND o.payment_method = 'bank_transfer'
                 ORDER BY o.date_added DESC LIMIT 20`,
            ),
            safeQuery(
                `SELECT CONCAT('inventory-', p.id) AS id, 'inventory' AS type,
                    CASE WHEN p.stock = 0 THEN CONCAT(p.name, ' is out of stock') ELSE CONCAT(p.name, ' is running low') END AS title,
                    CONCAT(p.stock, ' unit(s) remain in inventory.') AS description,
                    DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    CASE WHEN p.stock = 0 THEN 'High' ELSE 'Medium' END AS priority,
                    'Manage product' AS actionLabel, '/admin/products' AS route, TRUE AS unread
                 FROM products p WHERE p.stock <= 5 ORDER BY p.stock ASC, p.updated_at DESC LIMIT 20`,
            ),
            safeQuery(
                `SELECT CONCAT('support-', s.id) AS id, 'support' AS type,
                    CONCAT('Support ticket: ', s.subject) AS title,
                    LEFT(s.message, 180) AS description,
                    DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    CASE WHEN s.priority IN ('URGENT', 'HIGH') THEN 'High' ELSE 'Medium' END AS priority,
                    'Open support' AS actionLabel, '/admin/support' AS route, TRUE AS unread
                 FROM support_tickets s
                 WHERE s.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER')
                 ORDER BY FIELD(s.priority, 'URGENT', 'HIGH', 'NORMAL', 'LOW'), s.created_at DESC LIMIT 20`,
            ),
            safeQuery(
                `SELECT CONCAT('customer-', u.id) AS id, 'customer' AS type,
                    CONCAT(u.username, ' is suspended') AS title,
                    'Review the account if the customer contacts support.' AS description,
                    DATE_FORMAT(u.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    'Medium' AS priority, 'Open accounts' AS actionLabel, '/admin/accounts' AS route, TRUE AS unread
                 FROM users u WHERE u.status = 'Suspended' ORDER BY u.created_at DESC LIMIT 20`,
            ),
        ]);

        const score: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
        return [...orders, ...payments, ...inventory, ...support, ...customers].sort((left, right) =>
            (score[String(right.priority)] || 0) - (score[String(left.priority)] || 0),
        );
    }
}
