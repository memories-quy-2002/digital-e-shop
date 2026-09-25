import { Injectable } from "@nestjs/common";
import util from "node:util";
import pool from "#src/config/database.config";
import {
    ADMIN_ALERT_PRIORITY,
    ADMIN_ALERT_PRIORITY_SCORE_DEFAULT,
    ADMIN_ALERT_PRIORITY_SCORE,
    ADMIN_ALERT_TYPE,
    type AdminAlert,
    type AdminAlertPriority,
} from "./admin-alerts.types";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { USER_ACCOUNT_STATUS } from "#src/shared/constants/user";
import { LOW_STOCK_THRESHOLD } from "#src/shared/constants/product";
import { CURRENCY_CODE, CURRENCY_FORMATTING } from "#src/shared/constants/currency";
import { SUPPORT_PRIORITY, SUPPORT_STATUS } from "#src/support/support.types";
import { ADMIN_ALERTS_LIMIT } from "#src/shared/constants/operational-limits";
import { PAYMENT_PROVIDER, PAYMENT_RECONCILIATION_STATUS } from "../payments/payment.types";

const query = util.promisify(pool.query).bind(pool) as (sql: string, values?: unknown[]) => Promise<AdminAlert[]>;

const queryAlerts = async (sql: string, values: unknown[] = []): Promise<AdminAlert[]> => query(sql, values);

@Injectable()
export class AdminAlertsRepository {
    async getAlerts(): Promise<AdminAlert[]> {
        const [orders, payments, inventory, support, customers] = await Promise.all([
            queryAlerts(
                `SELECT CONCAT('order-', o.id) AS id, '${ADMIN_ALERT_TYPE.ORDER}' AS type,
                    CONCAT('Order #', o.id, ' needs review') AS title,
                    CONCAT('A pending order worth ', FORMAT(o.total_price - o.discount, ${CURRENCY_FORMATTING[CURRENCY_CODE.VND].fractionDigits}), ' ${CURRENCY_CODE.VND} is waiting for action.') AS description,
                    DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    '${ADMIN_ALERT_PRIORITY.HIGH}' AS priority, 'Open orders' AS actionLabel, '/admin/orders' AS route, TRUE AS unread
                 FROM orders o WHERE o.status = ${ORDER_STATUS.PENDING} ORDER BY o.date_added DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
            queryAlerts(
                `SELECT CONCAT('payment-', o.id) AS id, '${ADMIN_ALERT_TYPE.PAYMENT}' AS type,
                    CONCAT('Payment review for order #', o.id) AS title,
                    CASE WHEN o.payment_method = '${PAYMENT_PROVIDER.PAYOS}'
                        THEN CONCAT('Reconcile the PayOS payment for order #', o.id, ' before fulfillment.')
                        ELSE CONCAT('Confirm the COD payment for order #', o.id, ' before fulfillment.')
                    END AS description,
                    DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    '${ADMIN_ALERT_PRIORITY.MEDIUM}' AS priority, 'Review payment' AS actionLabel, '/admin/payments/reconciliation' AS route, TRUE AS unread
                 FROM orders o
                 LEFT JOIN order_payments op ON op.order_id = o.id
                 WHERE o.status = ${ORDER_STATUS.PENDING}
                   AND o.payment_method IN ('${PAYMENT_PROVIDER.CASH}', '${PAYMENT_PROVIDER.PAYOS}')
                   AND (o.payment_method = '${PAYMENT_PROVIDER.CASH}' OR op.id IS NULL OR op.reconciliation_status <> '${PAYMENT_RECONCILIATION_STATUS.MATCHED}')
                 ORDER BY o.date_added DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
            queryAlerts(
                `SELECT CONCAT('inventory-', p.id) AS id, '${ADMIN_ALERT_TYPE.INVENTORY}' AS type,
                    CASE WHEN p.stock = 0 THEN CONCAT(p.name, ' is out of stock') ELSE CONCAT(p.name, ' is running low') END AS title,
                    CONCAT(p.stock, ' unit(s) remain in inventory.') AS description,
                    DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    CASE WHEN p.stock = 0 THEN '${ADMIN_ALERT_PRIORITY.HIGH}' ELSE '${ADMIN_ALERT_PRIORITY.MEDIUM}' END AS priority,
                    'Manage product' AS actionLabel, '/admin/products' AS route, TRUE AS unread
                 FROM products p WHERE p.stock <= ${LOW_STOCK_THRESHOLD} ORDER BY p.stock ASC, p.updated_at DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
            queryAlerts(
                `SELECT CONCAT('support-', s.id) AS id, '${ADMIN_ALERT_TYPE.SUPPORT}' AS type,
                    CONCAT('Support ticket: ', s.subject) AS title,
                    LEFT(s.message, 180) AS description,
                    DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    CASE WHEN s.priority IN ('${SUPPORT_PRIORITY.URGENT}', '${SUPPORT_PRIORITY.HIGH}') THEN '${ADMIN_ALERT_PRIORITY.HIGH}' ELSE '${ADMIN_ALERT_PRIORITY.MEDIUM}' END AS priority,
                    'Open support' AS actionLabel, '/admin/support' AS route, TRUE AS unread
                 FROM support_tickets s
                 WHERE s.status IN ('${SUPPORT_STATUS.OPEN}', '${SUPPORT_STATUS.IN_PROGRESS}', '${SUPPORT_STATUS.WAITING_FOR_CUSTOMER}')
                 ORDER BY FIELD(s.priority, '${SUPPORT_PRIORITY.URGENT}', '${SUPPORT_PRIORITY.HIGH}', '${SUPPORT_PRIORITY.NORMAL}', '${SUPPORT_PRIORITY.LOW}'), s.created_at DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
            queryAlerts(
                `SELECT CONCAT('customer-', u.id) AS id, '${ADMIN_ALERT_TYPE.CUSTOMER}' AS type,
                    CONCAT(u.username, ' is suspended') AS title,
                    'Review the account if the customer contacts support.' AS description,
                    DATE_FORMAT(u.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    '${ADMIN_ALERT_PRIORITY.MEDIUM}' AS priority, 'Open accounts' AS actionLabel, '/admin/accounts' AS route, TRUE AS unread
                 FROM users u WHERE u.status = '${USER_ACCOUNT_STATUS.SUSPENDED}' ORDER BY u.created_at DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
        ]);

        const score: Record<AdminAlertPriority, number> = ADMIN_ALERT_PRIORITY_SCORE;
        const getPriorityScore = (priority: string) =>
            score[priority as AdminAlertPriority] ?? ADMIN_ALERT_PRIORITY_SCORE_DEFAULT;
        return [...orders, ...payments, ...inventory, ...support, ...customers].sort((left, right) =>
            getPriorityScore(String(right.priority)) - getPriorityScore(String(left.priority)),
        );
    }
}
