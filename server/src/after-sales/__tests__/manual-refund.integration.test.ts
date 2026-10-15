import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    closeIntegrationPools, createTestOrder, createTestProduct, createTestUser, integrationPool, integrationPrefix,
} from "../../database/__tests__/integration-database";
import { EvidenceService } from "../../operations/evidence.service";
import { ManualRefundService } from "../manual-refund.service";

describe("manual refund database integration", () => {
    let orderId: number;
    let paymentId: number;
    let firstRequestId: number;
    let secondRequestId: number;
    let orderItemId: number;
    let evidenceId: number;
    let actorId: string;
    let otherActorId: string;
    const service = new ManualRefundService(undefined, new EvidenceService());
    const refundInput = (key: string, reference: string) => ({
        idempotencyKey: `${integrationPrefix}-${key}`,
        transferReference: `${integrationPrefix}-${reference}`,
        transferDate: "2026-10-14",
        reviewedReason: "Integration refund verified",
        evidenceId,
        currency: "VND" as const,
    });

    beforeAll(async () => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") {
            throw new Error("Manual refund integration requires disposable local retail_p0_test");
        }
        const customer = await createTestUser("refund-customer");
        actorId = (await createTestUser("refund-admin")).id;
        otherActorId = (await createTestUser("refund-other-admin")).id;
        const productId = await createTestProduct("refund", 10);
        orderId = await createTestOrder(customer.id, 100000);
        await integrationPool.execute(
            "UPDATE orders SET currency = 'VND', contact_snapshot = ? WHERE id = ?",
            [JSON.stringify({ email: "snapshot@example.test", name: "Snapshot Customer", locale: "vi" }), orderId],
        );
        const [payment] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO order_payments
                (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, paid_at)
             VALUES (?, 'cash', 'paid', ?, 100000, 'VND', 100000, 'VND', UTC_TIMESTAMP())`,
            [orderId, `${integrationPrefix}-refund-payment`],
        );
        paymentId = payment.insertId;
        const [item] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price, unit_price_snapshot) VALUES (?, ?, 2, 100000, 50000)",
            [orderId, productId],
        );
        orderItemId = item.insertId;
        const [request1] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key)
             VALUES (?, ?, 'RETURN', 'RECEIVED', 'first', ?)`,
            [orderId, customer.id, `${integrationPrefix}-refund-request-1`],
        );
        firstRequestId = request1.insertId;
        const [request2] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key)
             VALUES (?, ?, 'RETURN', 'RECEIVED', 'second', ?)`,
            [orderId, customer.id, `${integrationPrefix}-refund-request-2`],
        );
        secondRequestId = request2.insertId;
        await integrationPool.execute(
            "INSERT INTO after_sales_items (request_id, order_item_id, quantity) VALUES (?, ?, 1), (?, ?, 1)",
            [firstRequestId, orderItemId, secondRequestId, orderItemId],
        );
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
        const saved = await new EvidenceService().store(actorId, {
            buffer: png, mimetype: "image/png", size: png.length, originalname: "refund-proof.png",
        });
        evidenceId = saved.id;
    });

    afterAll(async () => {
        await integrationPool.execute("DELETE FROM operations_tasks WHERE business_key LIKE ?", [`refund-${firstRequestId}-%`]);
        await integrationPool.execute("DELETE FROM transactional_emails WHERE event_key LIKE ?", [`refund-${firstRequestId}-%`]);
        await integrationPool.execute("DELETE FROM manual_refund_units WHERE operation_id IN (SELECT id FROM manual_refund_operations WHERE request_id IN (?, ?))", [firstRequestId, secondRequestId]);
        await integrationPool.execute("DELETE FROM manual_refund_operations WHERE request_id IN (?, ?)", [firstRequestId, secondRequestId]);
        await integrationPool.execute("DELETE FROM financial_evidence WHERE id = ?", [evidenceId]);
        await integrationPool.execute("DELETE FROM after_sales_events WHERE request_id IN (?, ?)", [firstRequestId, secondRequestId]);
        await integrationPool.execute("DELETE FROM after_sales_items WHERE request_id IN (?, ?)", [firstRequestId, secondRequestId]);
        await integrationPool.execute("DELETE FROM after_sales_requests WHERE id IN (?, ?)", [firstRequestId, secondRequestId]);
        await integrationPool.execute("DELETE FROM order_items WHERE id = ?", [orderItemId]);
        await integrationPool.execute("DELETE FROM order_payments WHERE id = ?", [paymentId]);
        await integrationPool.execute("DELETE FROM orders WHERE id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM products WHERE name LIKE ?", [`${integrationPrefix}-product-refund%`]);
        await integrationPool.execute("DELETE FROM users WHERE id LIKE ?", [`${integrationPrefix}%`]);
        await closeIntegrationPools();
    });

    it("integration allocates a refunded unit across requests and replays only matching facts", async () => {
        const rollbackInput = refundInput("refund-key-rollback", "refund-reference-rollback");
        const failingEmails = {
            enqueue: async (tx: { query<T>(sql: string, values?: unknown[]): Promise<T> }, event: { eventKey: string }) => {
                await tx.query(
                    `INSERT INTO transactional_emails
                        (event_key, event_type, recipient, locale, subject, text_body, html_body, snapshot, content_hash)
                     VALUES (?, 'refund_confirmation', 'snapshot@example.test', 'vi', 'subject', 'body', 'body', '{}', REPEAT('a', 64))`,
                    [event.eventKey],
                );
                throw new Error("simulated email enqueue failure");
            },
        };
        const failingService = new ManualRefundService(undefined, new EvidenceService(), failingEmails as never);
        await expect(failingService.confirm(firstRequestId, actorId, rollbackInput)).rejects.toThrow("simulated email enqueue failure");
        const [rolledBackOps] = await integrationPool.query<Array<{ id: number }>>(
            "SELECT id FROM manual_refund_operations WHERE idempotency_key = ?", [rollbackInput.idempotencyKey],
        );
        const [rolledBackEmails] = await integrationPool.query<Array<{ id: number }>>(
            "SELECT id FROM transactional_emails WHERE event_key LIKE ?", [`refund-${firstRequestId}-%`],
        );
        const [untouchedPayment] = await integrationPool.query<Array<{ status: string; refunded_amount: string }>>(
            "SELECT status, refunded_amount FROM order_payments WHERE id = ?", [paymentId],
        );
        expect(rolledBackOps).toEqual([]);
        expect(rolledBackEmails).toEqual([]);
        expect(untouchedPayment[0].status).toBe("paid");
        expect(Number(untouchedPayment[0].refunded_amount)).toBe(0);

        const input = refundInput("refund-key-1", "refund-reference-1");
        const observedEvents: Array<{ recipient: string; locale: string }> = [];
        const emails = { enqueue: async (_tx: unknown, event: { recipient: string; locale: string }) => { observedEvents.push(event); return 1; } };
        const withEmail = new ManualRefundService(undefined, new EvidenceService(), emails as never);
        const concurrentResults = await Promise.all([
            withEmail.confirm(firstRequestId, actorId, input),
            withEmail.confirm(secondRequestId, actorId, refundInput("refund-key-2", "refund-reference-2")),
        ]);
        expect(concurrentResults).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: "REFUNDED", refundAmount: 50000 }),
            expect.objectContaining({ status: "REFUNDED", refundAmount: 50000 }),
        ]));
        expect(observedEvents).toMatchObject([{
            type: "refund_confirmation", recipient: "snapshot@example.test", locale: "vi",
            snapshot: { customerName: "Snapshot Customer", refundAmount: 50000, currency: "VND" },
        }, {
            type: "refund_confirmation", recipient: "snapshot@example.test", locale: "vi",
            snapshot: { customerName: "Snapshot Customer", refundAmount: 50000, currency: "VND" },
        }]);
        await expect(withEmail.confirm(firstRequestId, actorId, input)).resolves.toMatchObject({ status: "REFUNDED" });
        const [paymentRows] = await integrationPool.query<Array<{ status: string; refunded_amount: string }>>(
            "SELECT status, refunded_amount FROM order_payments WHERE id = ?", [paymentId],
        );
        expect(paymentRows[0].status).toBe("refunded");
        expect(Number(paymentRows[0].refunded_amount)).toBe(100000);
        const [unitRows] = await integrationPool.query<Array<{ unit_index: number }>>(
            `SELECT u.unit_index FROM manual_refund_units u JOIN manual_refund_operations o ON o.id = u.operation_id
             WHERE o.request_id IN (?, ?) ORDER BY u.unit_index`, [firstRequestId, secondRequestId],
        );
        expect(unitRows.map((row) => Number(row.unit_index))).toEqual([0, 1]);
        await expect(withEmail.confirm(secondRequestId, actorId, refundInput("refund-key-2", "refund-reference-1")))
            .rejects.toMatchObject({ statusCode: 409 });
        await expect(withEmail.confirm(secondRequestId, otherActorId, refundInput("refund-key-2", "refund-reference-2")))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    it("integration caps refunds at the paid ledger balance", async () => {
        const customer = await createTestUser("refund-cap-customer");
        const productId = await createTestProduct("refund-cap", 1);
        const capOrderId = await createTestOrder(customer.id, 50000);
        const [payment] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO order_payments
                (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, paid_at)
             VALUES (?, 'cash', 'paid', ?, 30000, 'VND', 30000, 'VND', UTC_TIMESTAMP())`,
            [capOrderId, `${integrationPrefix}-cap-payment`],
        );
        const [item] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price, unit_price_snapshot) VALUES (?, ?, 1, 50000, 50000)",
            [capOrderId, productId],
        );
        const [request] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key)
             VALUES (?, ?, 'RETURN', 'RECEIVED', 'cap', ?)`,
            [capOrderId, customer.id, `${integrationPrefix}-cap-request`],
        );
        await integrationPool.execute("INSERT INTO after_sales_items (request_id, order_item_id, quantity) VALUES (?, ?, 1)", [request.insertId, item.insertId]);
        try {
            const input = refundInput("refund-key-over-cap", "refund-reference-over-cap");
            await expect(service.confirm(request.insertId, actorId, input)).rejects.toMatchObject({ statusCode: 409 });
            const [rows] = await integrationPool.query<Array<{ count: number }>>(
                "SELECT COUNT(*) AS count FROM manual_refund_operations WHERE idempotency_key = ?", [input.idempotencyKey],
            );
            const [ledger] = await integrationPool.query<Array<{ status: string; refunded_amount: string }>>(
                "SELECT status, refunded_amount FROM order_payments WHERE id = ?", [payment.insertId],
            );
            expect(Number(rows[0].count)).toBe(0);
            expect(ledger[0].status).toBe("paid");
            expect(Number(ledger[0].refunded_amount)).toBe(0);
        } finally {
            await integrationPool.execute("DELETE FROM after_sales_items WHERE request_id = ?", [request.insertId]);
            await integrationPool.execute("DELETE FROM after_sales_requests WHERE id = ?", [request.insertId]);
            await integrationPool.execute("DELETE FROM order_items WHERE id = ?", [item.insertId]);
            await integrationPool.execute("DELETE FROM order_payments WHERE id = ?", [payment.insertId]);
            await integrationPool.execute("DELETE FROM orders WHERE id = ?", [capOrderId]);
            await integrationPool.execute("DELETE FROM products WHERE id = ?", [productId]);
            await integrationPool.execute("DELETE FROM users WHERE id = ?", [customer.id]);
        }
    });
});
