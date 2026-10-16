import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { withTransaction } from "../../database/transaction";
import { integrationPool, createTestUser, createTestProduct, createTestOrder, integrationPrefix, closeIntegrationPools } from "../../database/__tests__/integration-database";
import { ManualRefundRepository } from "../../after-sales/manual-refund.repository";
import { ManualRefundService } from "../../after-sales/manual-refund.service";
import { EvidenceService } from "../evidence.service";
import { CodSettlementService } from "../../payments/cod-settlement.service";
import { FulfillmentService } from "../../shipping/fulfillment.service";
import { DeliveryAssignmentService } from "../../shipping/delivery-assignment.service";
import { TaskRunnerService } from "../task-runner.service";
import { completeDeliveredOrder } from "../../orders/order-delivery";
import { deliveryAddress } from "../../shipping/__tests__/checkout-fixture";

describe("retail P0 database integration", () => {
    let app: INestApplicationContext | undefined;
    let orderId: number, paymentId: number, requestId: number;
    let journey: { orderId: number; paymentId: number; requestId: number; itemId: number; productId: number; userId: string; driverId: string; adminId: string; evidenceId: number } | undefined;
    const repository = new ManualRefundRepository();

    beforeAll(async () => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") throw new Error("Requires disposable local retail_p0_test");
        const user = await createTestUser("p0");
        const product = await createTestProduct("p0");
        orderId = await createTestOrder(user.id, 100000);
        const [payment] = await integrationPool.query<{ insertId: number } & import("mysql2").ResultSetHeader>("INSERT INTO order_payments (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, paid_at) VALUES (?, 'cash', 'paid', ?, 100000, 'VND', 100000, 'VND', UTC_TIMESTAMP())", [orderId, `${integrationPrefix}:payment`]);
        paymentId = payment.insertId;
        const [request] = await integrationPool.query<import("mysql2").ResultSetHeader>("INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key) VALUES (?, ?, 'RETURN', 'RECEIVED', 'test', ?)", [orderId, user.id, `${integrationPrefix}:request`]);
        requestId = request.insertId;
        await integrationPool.execute("INSERT INTO order_items (order_id, product_id, quantity, total_price, unit_price_snapshot) VALUES (?, ?, 2, 100000, 50000)", [orderId, product]);
    });

    afterAll(async () => {
        if (journey) {
            await integrationPool.execute("DELETE FROM operations_tasks WHERE business_key IN (SELECT event_key FROM transactional_emails WHERE JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.orderNumber')) = ?)", [String(journey.orderId)]);
            await integrationPool.execute("DELETE FROM email_delivery_events WHERE email_id IN (SELECT id FROM transactional_emails WHERE JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.orderNumber')) = ?)", [String(journey.orderId)]);
            await integrationPool.execute("DELETE FROM transactional_emails WHERE JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.orderNumber')) = ?", [String(journey.orderId)]);
            await integrationPool.execute("DELETE FROM manual_refund_units WHERE operation_id IN (SELECT id FROM manual_refund_operations WHERE request_id = ?)", [journey.requestId]);
            await integrationPool.execute("DELETE FROM manual_refund_operations WHERE request_id = ?", [journey.requestId]);
            await integrationPool.execute("DELETE FROM cod_settlement_events WHERE settlement_id IN (SELECT id FROM cod_settlements WHERE order_id = ?)", [journey.orderId]);
            await integrationPool.execute("DELETE FROM cod_settlements WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM financial_evidence WHERE id = ?", [journey.evidenceId]);
            await integrationPool.execute("DELETE FROM after_sales_events WHERE request_id = ?", [journey.requestId]);
            await integrationPool.execute("DELETE FROM after_sales_items WHERE request_id = ?", [journey.requestId]);
            await integrationPool.execute("DELETE FROM after_sales_requests WHERE id = ?", [journey.requestId]);
            await integrationPool.execute("DELETE FROM delivery_events WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM delivery_assignments WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM shipment_events WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)", [journey.orderId]);
            await integrationPool.execute("DELETE FROM shipments WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM order_status_events WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM order_items WHERE id = ?", [journey.itemId]);
            await integrationPool.execute("DELETE FROM order_payments WHERE id = ?", [journey.paymentId]);
            await integrationPool.execute("DELETE FROM loyalty_ledger WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM orders WHERE id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM products WHERE id = ?", [journey.productId]);
            await integrationPool.execute("DELETE FROM loyalty_accounts WHERE user_id IN (?, ?, ?)", [journey.userId, journey.driverId, journey.adminId]);
            await integrationPool.execute("DELETE FROM users WHERE id IN (?, ?, ?)", [journey.userId, journey.driverId, journey.adminId]);
        }
        await app?.close();
        await integrationPool.execute("DELETE FROM after_sales_events WHERE request_id = ?", [requestId]);
        await integrationPool.execute("DELETE FROM after_sales_requests WHERE id = ?", [requestId]);
        await integrationPool.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM order_payments WHERE order_id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM orders WHERE id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM products WHERE name LIKE ?", [`${integrationPrefix}%`]);
        await integrationPool.execute("DELETE FROM users WHERE id LIKE ?", [`${integrationPrefix}%`]);
        await closeIntegrationPools();
    });

    it("integration keeps a half refund partially refunded on actual MySQL assignment semantics", async () => {
        await withTransaction((tx) => repository.completeRefund(tx, { requestId, orderId, requestReason: "test", paymentId, actorId: `${integrationPrefix}-user-p0`, fromStatus: "RECEIVED", idempotencyKey: "test-key", transferReference: "test-transfer", transferDate: "2026-10-14", reviewedReason: "test", amountVnd: 50000, currency: "VND", evidenceId: 1 }));
        const [rows] = await integrationPool.query<Array<import("mysql2").RowDataPacket>>("SELECT status, refunded_amount FROM order_payments WHERE id = ?", [paymentId]);
        expect(rows[0].status).toBe("partially_refunded");
        expect(Number(rows[0].refunded_amount)).toBe(50000);
    });

    it("integration composes the application without a shipping-provider mode", async () => {
        expect(process.env.EMAIL_PROVIDER_MODE).toBe("sandbox");
        expect(process.env.PAYMENT_PROVIDER_MODE).toBe("mock");
        const { AppModule } = await import("../../app.module");
        app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
        expect(app.get(TaskRunnerService)).toBeDefined();
    });

    it("integration completes internal COD delivery, records remittance and preserves refund/email work", async () => {
        if (!app) throw new Error("Application context is not initialized");
        const user = await createTestUser("journey");
        const driver = await createTestUser("journey-driver");
        const admin = await createTestUser("journey-admin");
        const productId = await createTestProduct("journey");
        await integrationPool.execute("UPDATE users SET role = 'DeliveryStaff' WHERE id = ?", [driver.id]);
        await integrationPool.execute("UPDATE users SET role = 'Admin' WHERE id = ?", [admin.id]);
        const localOrderId = await createTestOrder(user.id, 100000);
        await integrationPool.execute("UPDATE orders SET currency = 'VND', contact_snapshot = ?, pricing_snapshot = ?, delivery_snapshot = ? WHERE id = ?", [
            JSON.stringify({ email: `${integrationPrefix}@example.test`, name: "Journey Customer", locale: "vi" }),
            JSON.stringify({ itemsSubtotal: 100000, merchandiseDiscount: 0, shippingFee: 0, payableTotal: 100000, currency: "VND" }),
            JSON.stringify({ provider: "INTERNAL", address: deliveryAddress, origin: { latitude: 10.78, longitude: 106.7 }, destination: { latitude: deliveryAddress.latitude, longitude: deliveryAddress.longitude }, distanceMeters: 0, routeGeometry: [], shippingFeeVnd: 0, quoteId: "internal-integration", settingsVersion: 1 }),
            localOrderId,
        ]);
        const [payment] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO order_payments (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, paid_at)
             VALUES (?, 'cash', 'pending', ?, 100000, 'VND', 100000, 'VND', NULL)`, [localOrderId, `${integrationPrefix}:journey-payment`],
        );
        const [item] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price, unit_price_snapshot) VALUES (?, ?, 1, 100000, 100000)", [localOrderId, productId],
        );
        await integrationPool.execute(
            `INSERT INTO shipments (order_id, state, provider, client_reference, expected_cod_vnd, actual_fee_vnd, sandbox)
             VALUES (?, 'UNFULFILLED', 'INTERNAL', ?, 100000, 0, 0)`, [localOrderId, `${integrationPrefix}:internal-delivery`],
        );
        await integrationPool.execute("INSERT INTO cod_settlements (order_id, expected_cod_vnd, currency) VALUES (?, 100000, 'VND')", [localOrderId]);
        journey = { orderId: localOrderId, paymentId: payment.insertId, requestId: 0, itemId: item.insertId, productId, userId: user.id, driverId: driver.id, adminId: admin.id, evidenceId: 0 };

        const fulfillment = app.get(FulfillmentService, { strict: false });
        for (const state of ["CONFIRMED", "PICKING", "PACKED", "READY_TO_SHIP"] as const) await fulfillment.transition(localOrderId, state, admin.id);
        const assignments = app.get(DeliveryAssignmentService, { strict: false });
        const scheduledStartAt = new Date(Date.now() + 60_000);
        const assignment = await assignments.assign({ orderId: localOrderId, employeeId: driver.id, scheduledStartAt, scheduledEndAt: new Date(scheduledStartAt.getTime() + 60 * 60_000) }, admin.id);
        await assignments.transition({ assignmentId: assignment.id, employeeId: driver.id, status: "OUT_FOR_DELIVERY" });
        await assignments.transition({ assignmentId: assignment.id, employeeId: driver.id, status: "DELIVERED" });

        const [deliveredRows] = await integrationPool.query<Array<{ status: number; state: string; provider: string; provider_order_code: string | null; actual_fee_vnd: string; expected_cod_vnd: string; assignment_status: string }>>(
            `SELECT o.status, s.state, s.provider, s.provider_order_code, s.actual_fee_vnd, s.expected_cod_vnd, a.status AS assignment_status
             FROM orders o JOIN shipments s ON s.order_id = o.id JOIN delivery_assignments a ON a.order_id = o.id WHERE o.id = ?`, [localOrderId],
        );
        expect(deliveredRows[0]).toMatchObject({ status: 1, state: "READY_TO_SHIP", provider: "INTERNAL", provider_order_code: null, assignment_status: "DELIVERED" });
        expect(Number(deliveredRows[0].expected_cod_vnd)).toBe(100000);
        expect(Number(deliveredRows[0].actual_fee_vnd)).toBe(0);
        const [settlementRows] = await integrationPool.query<Array<{ collected_vnd: string; carrier_fee_vnd: string; actual_fee_vnd: string; status: string }>>(
            `SELECT c.collected_vnd, c.carrier_fee_vnd, sh.actual_fee_vnd, c.status FROM cod_settlements c
             JOIN shipments sh ON sh.order_id = c.order_id WHERE c.order_id = ?`, [localOrderId],
        );
        expect(Number(settlementRows[0].collected_vnd)).toBe(100000);
        expect(Number(settlementRows[0].carrier_fee_vnd)).toBe(0);
        expect(Number(settlementRows[0].actual_fee_vnd)).toBe(0);
        expect(settlementRows[0].status).toBe("PENDING");
        const [paidRows] = await integrationPool.query<Array<{ status: string; simulated: number; paid_at: Date | null }>>(
            "SELECT status, simulated, paid_at FROM order_payments WHERE id = ?", [payment.insertId],
        );
        expect(paidRows[0].status).toBe("paid");
        expect(Number(paidRows[0].simulated)).toBe(0);
        expect(paidRows[0].paid_at).toBeTruthy();

        const evidence = await app.get(EvidenceService).store(user.id, {
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
            mimetype: "image/png", size: 9, originalname: "internal-remittance.png",
        });
        journey.evidenceId = evidence.id;
        const remittance = await app.get(CodSettlementService).recordRemittance(localOrderId, user.id, {
            remittedVnd: 100000,
            transferReference: `${integrationPrefix}:journey-remittance`, transferDate: "2026-10-14", evidenceId: evidence.id,
        });
        expect(remittance.status).toBe("MATCHED");

        const [request] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key)
             VALUES (?, ?, 'RETURN', 'RECEIVED', 'internal journey refund', ?)`, [localOrderId, user.id, `${integrationPrefix}:journey-refund`],
        );
        journey.requestId = request.insertId;
        await integrationPool.execute("INSERT INTO after_sales_items (request_id, order_item_id, quantity) VALUES (?, ?, 1)", [request.insertId, item.insertId]);
        await app.get(ManualRefundService, { strict: false }).confirm(request.insertId, user.id, {
            idempotencyKey: `${integrationPrefix}:journey-refund-operation`,
            transferReference: `${integrationPrefix}:journey-refund-transfer`, transferDate: "2026-10-14",
            reviewedReason: "Local internal-delivery refund attestation", evidenceId: evidence.id, currency: "VND",
        });
        await app.get(TaskRunnerService).run({ limit: 100, budgetMs: 20000 });
        const [refundRows] = await integrationPool.query<Array<{ status: string; refunded_amount: string }>>(
            "SELECT status, refunded_amount FROM order_payments WHERE id = ?", [payment.insertId],
        );
        expect(refundRows[0].status).toBe("refunded");
        expect(Number(refundRows[0].refunded_amount)).toBe(100000);
        const [emailRows] = await integrationPool.query<Array<{ event_type: string; state: string; locale: string }>>(
            "SELECT event_type, state, locale FROM transactional_emails WHERE recipient = ?", [`${integrationPrefix}@example.test`],
        );
        expect(emailRows.length).toBeGreaterThan(0);
        expect(emailRows.every((row) => row.state === "SANDBOX" && row.locale === "vi")).toBe(true);

        const [simulatedOrder] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO orders (user_id, status, total_price, discount, currency, shipping_address, payment_method, date_added, delivery_snapshot)
             VALUES (?, 0, 100000, 0, 'VND', 'test address', 'payos', UTC_TIMESTAMP(), ?)`, [user.id, JSON.stringify({ provider: "INTERNAL", address: deliveryAddress, shippingFeeVnd: 0 })],
        );
        const [simulatedPayment] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO order_payments (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, simulated, paid_at)
             VALUES (?, 'payos', 'paid', ?, 100000, 'VND', 100000, 'VND', 1, UTC_TIMESTAMP())`, [simulatedOrder.insertId, `${integrationPrefix}:simulated-payos`],
        );
        try {
            await expect(withTransaction((tx) => completeDeliveredOrder(tx, simulatedOrder.insertId, new Date(), null))).rejects.toThrow(/simulated PayOS/i);
            const [simulatedShipments] = await integrationPool.query<Array<{ id: number }>>("SELECT id FROM shipments WHERE order_id = ?", [simulatedOrder.insertId]);
            expect(simulatedShipments).toEqual([]);
        } finally {
            await integrationPool.execute("DELETE FROM order_payments WHERE id = ?", [simulatedPayment.insertId]);
            await integrationPool.execute("DELETE FROM orders WHERE id = ?", [simulatedOrder.insertId]);
        }
    });
});
