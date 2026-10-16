import { ConflictException, Injectable } from "@nestjs/common";
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
import { withTransaction } from "../database/transaction";
import type { AdminAlertTriageAction } from "./admin-alerts.types";

export type AdminAlertTriageState = {
    triageStatus: "OPEN" | "RESOLVED";
    assignedAdminId: string | null;
    assignedToMe: boolean;
};

const query = util.promisify(pool.query).bind(pool) as <T>(sql: string, values?: unknown[]) => Promise<T[]>;

const queryAlerts = async (sql: string, values: unknown[] = []): Promise<AdminAlert[]> => query<AdminAlert>(sql, values);

@Injectable()
export class AdminAlertsRepository {
    async getAlerts(adminId: string): Promise<AdminAlert[]> {
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
                `SELECT CONCAT('inventory-', p.id, '-', COALESCE((
                        SELECT MAX(im.id) FROM inventory_movements im WHERE im.product_id = p.id
                    ), 0)) AS id, '${ADMIN_ALERT_TYPE.INVENTORY}' AS type,
                    CASE WHEN p.stock = 0 THEN CONCAT(p.name, ' is out of stock') ELSE CONCAT(p.name, ' is running low') END AS title,
                    CONCAT(p.stock, ' unit(s) remain in inventory.') AS description,
                    DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    CASE WHEN p.stock = 0 THEN '${ADMIN_ALERT_PRIORITY.HIGH}' ELSE '${ADMIN_ALERT_PRIORITY.MEDIUM}' END AS priority,
                    'Manage product' AS actionLabel, '/admin/products' AS route, TRUE AS unread
                 FROM products p WHERE p.stock <= ${LOW_STOCK_THRESHOLD} ORDER BY p.stock ASC, p.updated_at DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
            queryAlerts(
                `SELECT CONCAT('support-', s.id, '-', DATE_FORMAT(s.updated_at, '%Y%m%d%H%i%s%f')) AS id, '${ADMIN_ALERT_TYPE.SUPPORT}' AS type,
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
                `SELECT CONCAT('customer-', u.id, '-', COALESCE(audit.last_change_id, 0)) AS id, '${ADMIN_ALERT_TYPE.CUSTOMER}' AS type,
                    CONCAT(u.username, ' is suspended') AS title,
                    'Review the account if the customer contacts support.' AS description,
                    DATE_FORMAT(u.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt,
                    '${ADMIN_ALERT_PRIORITY.MEDIUM}' AS priority, 'Open accounts' AS actionLabel, '/admin/accounts' AS route, TRUE AS unread
                 FROM users u
                 LEFT JOIN (
                    SELECT entity_id, MAX(id) AS last_change_id
                    FROM admin_audit_events
                    WHERE entity_type = 'user' AND action = 'user.access.updated'
                    GROUP BY entity_id
                 ) audit ON audit.entity_id = u.id
                 WHERE u.status = '${USER_ACCOUNT_STATUS.SUSPENDED}'
                 ORDER BY u.created_at DESC LIMIT ${ADMIN_ALERTS_LIMIT}`,
            ),
        ]);

        const score: Record<AdminAlertPriority, number> = ADMIN_ALERT_PRIORITY_SCORE;
        const getPriorityScore = (priority: string) =>
            score[priority as AdminAlertPriority] ?? ADMIN_ALERT_PRIORITY_SCORE_DEFAULT;
        const alerts = [...orders, ...payments, ...inventory, ...support, ...customers];
        const acknowledged = alerts.length > 0
            ? await query<{ alert_id: string }>(
                `SELECT alert_id FROM admin_alert_states
                 WHERE admin_id = ? AND status = 'ACKNOWLEDGED' AND alert_id IN (${alerts.map(() => "?").join(", ")})`,
                [adminId, ...alerts.map((alert) => alert.id)],
            )
            : [];
        const acknowledgedIds = new Set(acknowledged.map((row) => row.alert_id));
        const triageRows = alerts.length > 0
            ? await query<{ alert_id: string; status: "OPEN" | "RESOLVED"; assigned_admin_id: string | null }>(
                `SELECT alert_id, status, assigned_admin_id FROM admin_alert_triage
                 WHERE alert_id IN (${alerts.map(() => "?").join(", ")})`,
                alerts.map((alert) => alert.id),
            )
            : [];
        const triageByAlertId = new Map(triageRows.map((row) => [row.alert_id, row]));
        return alerts.map((alert) => {
            const triage = triageByAlertId.get(alert.id);
            const triageStatus = triage?.status || "OPEN";
            return {
                ...alert,
                unread: !acknowledgedIds.has(alert.id) && triageStatus !== "RESOLVED",
                triageStatus,
                assignedAdminId: triage?.assigned_admin_id || null,
                assignedToMe: triage?.assigned_admin_id === adminId,
            };
        }).sort((left, right) =>
            getPriorityScore(String(right.priority)) - getPriorityScore(String(left.priority)),
        );
    }

    async acknowledgeAlerts(adminId: string, alertIds: string[]): Promise<void> {
        if (alertIds.length === 0) return;
        const values = alertIds.flatMap((alertId) => [adminId, alertId]);
        const placeholders = alertIds.map(() => "(?, ?, 'ACKNOWLEDGED', UTC_TIMESTAMP(3))").join(", ");
        await query<unknown>(
            `INSERT INTO admin_alert_states (admin_id, alert_id, status, updated_at)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE status = 'ACKNOWLEDGED', updated_at = UTC_TIMESTAMP(3)`,
            values,
        );
    }

    updateTriage(alertId: string, adminId: string, action: AdminAlertTriageAction): Promise<AdminAlertTriageState> {
        return withTransaction<AdminAlertTriageState>(async (tx) => {
            if (action === "claim") {
                await tx.query(
                    `INSERT IGNORE INTO admin_alert_triage (alert_id, assigned_admin_id, status, updated_by, updated_at)
                     VALUES (?, NULL, 'OPEN', ?, UTC_TIMESTAMP(3))`,
                    [alertId, adminId],
                );
            }
            const [current] = await tx.query<Array<{
                status: "OPEN" | "RESOLVED";
                assigned_admin_id: string | null;
            }>>(
                "SELECT status, assigned_admin_id FROM admin_alert_triage WHERE alert_id = ? FOR UPDATE",
                [alertId],
            );
            const status = current?.status || "OPEN";
            const assignedAdminId = current?.assigned_admin_id || null;

            if (action === "claim") {
                if (status === "RESOLVED") throw new ConflictException("Reopen this alert before claiming it.");
                if (assignedAdminId && assignedAdminId !== adminId) throw new ConflictException("This alert is assigned to another administrator.");
                await tx.query(
                    `UPDATE admin_alert_triage SET assigned_admin_id = ?, status = 'OPEN', updated_by = ?,
                        updated_at = UTC_TIMESTAMP(3), resolved_at = NULL WHERE alert_id = ?`,
                    [adminId, adminId, alertId],
                );
                return { triageStatus: "OPEN", assignedAdminId: adminId, assignedToMe: true };
            }

            if (action === "release") {
                if (assignedAdminId !== adminId) throw new ConflictException("Only the assigned administrator can release this alert.");
                await tx.query(
                    `UPDATE admin_alert_triage SET assigned_admin_id = NULL, updated_by = ?, updated_at = UTC_TIMESTAMP(3)
                     WHERE alert_id = ?`,
                    [adminId, alertId],
                );
                return { triageStatus: status, assignedAdminId: null, assignedToMe: false };
            }

            if (action === "resolve") {
                if (status === "RESOLVED") return { triageStatus: status, assignedAdminId, assignedToMe: assignedAdminId === adminId };
                if (assignedAdminId !== adminId) throw new ConflictException("Claim this alert before resolving it.");
                await tx.query(
                    `UPDATE admin_alert_triage SET status = 'RESOLVED', resolved_at = UTC_TIMESTAMP(3),
                        updated_by = ?, updated_at = UTC_TIMESTAMP(3) WHERE alert_id = ?`,
                    [adminId, alertId],
                );
                return { triageStatus: "RESOLVED", assignedAdminId: adminId, assignedToMe: true };
            }

            if (status !== "RESOLVED") return { triageStatus: status, assignedAdminId, assignedToMe: assignedAdminId === adminId };
            await tx.query(
                `UPDATE admin_alert_triage SET status = 'OPEN', assigned_admin_id = NULL, resolved_at = NULL,
                    updated_by = ?, updated_at = UTC_TIMESTAMP(3) WHERE alert_id = ?`,
                [adminId, alertId],
            );
            return { triageStatus: "OPEN", assignedAdminId: null, assignedToMe: false };
        });
    }
}
