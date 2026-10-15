import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { withTransaction } from "../../database/transaction";
import { integrationPool, createTestUser, createTestProduct, createTestOrder, integrationPrefix, closeIntegrationPools } from "../../database/__tests__/integration-database";
import { ManualRefundRepository } from "../../after-sales/manual-refund.repository";
import { ManualRefundService } from "../../after-sales/manual-refund.service";
import { EvidenceService } from "../evidence.service";
import { CodSettlementService } from "../../payments/cod-settlement.service";
import { PersistedSandboxShippingProvider } from "../../shipping/persisted-sandbox-shipping.provider";
import { FulfillmentService } from "../../shipping/fulfillment.service";
import { ShippingWebhookService } from "../../shipping/shipping-webhook.service";
import { TaskRunnerService } from "../task-runner.service";
import { completeDeliveredOrder } from "../../orders/order-delivery";
import { deliveryAddress } from "../../shipping/__tests__/checkout-fixture";

describe("retail P0 database integration", () => {
    let app: INestApplicationContext | undefined;
    let orderId: number, paymentId: number, requestId: number;
    let journey: { orderId: number; paymentId: number; requestId: number; itemId: number; productId: number; userId: string; evidenceId: number; clientReference: string } | undefined;
    const previousGhnSecret = process.env.GHN_WEBHOOK_SECRET;
    const previousGhnShopId = process.env.GHN_SHOP_ID;
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
            await integrationPool.execute("DELETE FROM operations_tasks WHERE business_key = ? OR business_key IN (SELECT event_key FROM transactional_emails WHERE JSON_UNQUOTE(JSON_EXTRACT(snapshot, '$.orderNumber')) = ?) OR business_key IN (SELECT provider_event_key FROM shipment_events WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?))", [journey.clientReference, String(journey.orderId), journey.orderId]);
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
            await integrationPool.execute("DELETE FROM shipment_events WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)", [journey.orderId]);
            await integrationPool.execute("DELETE FROM shipments WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM sandbox_carrier_shipments WHERE client_reference = ?", [journey.clientReference]);
            await integrationPool.execute("DELETE FROM order_status_events WHERE order_id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM order_items WHERE id = ?", [journey.itemId]);
            await integrationPool.execute("DELETE FROM order_payments WHERE id = ?", [journey.paymentId]);
            await integrationPool.execute("DELETE FROM orders WHERE id = ?", [journey.orderId]);
            await integrationPool.execute("DELETE FROM products WHERE id = ?", [journey.productId]);
            await integrationPool.execute("DELETE FROM users WHERE id = ?", [journey.userId]);
        }
        await app?.close();
        await integrationPool.execute("DELETE FROM sandbox_carrier_shipments WHERE client_reference LIKE ?", [`${integrationPrefix}%`]);
        await integrationPool.execute("DELETE FROM after_sales_events WHERE request_id = ?", [requestId]);
        await integrationPool.execute("DELETE FROM after_sales_requests WHERE id = ?", [requestId]);
        await integrationPool.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM order_payments WHERE order_id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM orders WHERE id = ?", [orderId]);
        await integrationPool.execute("DELETE FROM products WHERE name LIKE ?", [`${integrationPrefix}%`]);
        await integrationPool.execute("DELETE FROM users WHERE id LIKE ?", [`${integrationPrefix}%`]);
        await closeIntegrationPools();
        if (previousGhnSecret === undefined) delete process.env.GHN_WEBHOOK_SECRET;
        else process.env.GHN_WEBHOOK_SECRET = previousGhnSecret;
        if (previousGhnShopId === undefined) delete process.env.GHN_SHOP_ID;
        else process.env.GHN_SHOP_ID = previousGhnShopId;
    });
    it("integration keeps a half refund partially refunded on actual MySQL assignment semantics", async () => {
        await withTransaction((tx) => repository.completeRefund(tx, { requestId, orderId, requestReason: "test", paymentId, actorId: `${integrationPrefix}-user-p0`, fromStatus: "RECEIVED", idempotencyKey: "test-key", transferReference: "test-transfer", transferDate: "2026-10-14", reviewedReason: "test", amountVnd: 50000, currency: "VND", evidenceId: 1 }));
        const [rows] = await integrationPool.query<Array<import("mysql2").RowDataPacket>>("SELECT status, refunded_amount FROM order_payments WHERE id = ?", [paymentId]);
        expect(rows[0].status).toBe("partially_refunded");
        expect(Number(rows[0].refunded_amount)).toBe(50000);
    });
    it("integration recovers a sandbox parcel after provider instance restart", async () => {
        const input = { clientReference: `${integrationPrefix}-parcel`, address: deliveryAddress, parcel: { grams: 500, lengthCm: 20, widthCm: 10, heightCm: 5 }, service: { serviceTypeId: 2 }, codAmountVnd: 100000, orderValueVnd: 100000 };
        const first = await new PersistedSandboxShippingProvider().createShipment(input);
        const restarted = new PersistedSandboxShippingProvider();
        expect(await restarted.findByClientReference(input.clientReference)).toEqual(first);
        expect(await restarted.createShipment(input)).toEqual(first);
    });
    it("integration composes the application with sandbox adapters", async () => {
        expect(process.env.SHIPPING_PROVIDER_MODE).toBe("sandbox");
        expect(process.env.EMAIL_PROVIDER_MODE).toBe("sandbox");
        expect(process.env.PAYMENT_PROVIDER_MODE).toBe("mock");
        const { AppModule } = await import("../../app.module");
        app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
        expect(app.get(TaskRunnerService)).toBeDefined();
    });

    it("integration completes a COD sandbox delivery, deduplicates callbacks, settles remittance and records refund/email work", async () => {
        if (!app) throw new Error("Sandbox application context is not initialized");
        const user = await createTestUser("journey");
        const productId = await createTestProduct("journey");
        const localOrderId = await createTestOrder(user.id, 100000);
        const clientReference = `digital-e-order-${localOrderId}`;
        await integrationPool.execute("UPDATE orders SET currency = 'VND', contact_snapshot = ?, pricing_snapshot = ?, delivery_snapshot = ? WHERE id = ?", [
            JSON.stringify({ email: `${integrationPrefix}@example.test`, name: "Journey Customer", locale: "vi" }),
            JSON.stringify({ itemsSubtotal: 100000, merchandiseDiscount: 0, shippingFee: 0, payableTotal: 100000, currency: "VND" }),
            JSON.stringify({ provider: "SANDBOX", address: deliveryAddress, parcel: { grams: 500, lengthCm: 20, widthCm: 10, heightCm: 5 }, serviceTypeId: 2 }),
            localOrderId,
        ]);
        const [payment] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO order_payments (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, paid_at)
             VALUES (?, 'cash', 'pending', ?, 100000, 'VND', 100000, 'VND', NULL)`, [localOrderId, `${integrationPrefix}:journey-payment`],
        );
        const [item] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price, unit_price_snapshot) VALUES (?, ?, 1, 100000, 100000)", [localOrderId, productId],
        );
        journey = { orderId: localOrderId, paymentId: payment.insertId, requestId: 0, itemId: item.insertId, productId, userId: user.id, evidenceId: 0, clientReference };
        process.env.GHN_WEBHOOK_SECRET = "retail-p0-test-only-secret";
        process.env.GHN_SHOP_ID = "12345";

        const fulfillment = app.get(FulfillmentService, { strict: false });
        for (const state of ["CONFIRMED", "PICKING", "PACKED", "READY_TO_SHIP"] as const) await fulfillment.transition(localOrderId, state, user.id);
        await fulfillment.requestShipment(localOrderId, user.id, `${integrationPrefix}:journey-shipment`);
        const runner = app.get(TaskRunnerService);
        await runner.run({ limit: 100, budgetMs: 20000 });

        const [shipmentRows] = await integrationPool.query<Array<{ provider_order_code: string; actual_fee_vnd: string; expected_cod_vnd: string; sandbox: number }>>(
            "SELECT provider_order_code, actual_fee_vnd, expected_cod_vnd, sandbox FROM shipments WHERE order_id = ?", [localOrderId],
        );
        expect(shipmentRows).toHaveLength(1);
        const shipment = shipmentRows[0];
        expect(shipment.provider_order_code).toMatch(/^SBX-/);
        expect(Number(shipment.expected_cod_vnd)).toBe(100000);
        expect(Boolean(shipment.sandbox)).toBe(true);
        const sandboxCarrier = new PersistedSandboxShippingProvider();
        const deliveredAt = new Date(Date.now() + 5000);
        await sandboxCarrier.setFixtureStatus(clientReference, "DELIVERED", deliveredAt);
        const webhook = app.get(ShippingWebhookService, { strict: false });
        const callback = {
            ShopID: 12345, OrderCode: shipment.provider_order_code, ClientOrderCode: clientReference,
            Type: "ORDER_STATUS", Time: deliveredAt.toISOString(), Status: "delivered", CODAmount: 100000,
        };
        await expect(webhook.accept(callback, { "x-digital-e-webhook-secret": "wrong-test-value" })).rejects.toThrow(/authentication/i);
        await expect(webhook.accept({ ...callback, ShopID: 54321 }, { "x-digital-e-webhook-secret": "retail-p0-test-only-secret" })).rejects.toThrow(/shop/i);
        await expect(webhook.accept(callback, { "x-digital-e-webhook-secret": "retail-p0-test-only-secret" })).resolves.toMatchObject({ kind: "queued" });
        await expect(webhook.accept(callback, { "x-digital-e-webhook-secret": "retail-p0-test-only-secret" })).resolves.toMatchObject({ kind: "duplicate" });
        await runner.run({ limit: 100, budgetMs: 20000 });
        const staleCallback = { ...callback, Type: "STALE_PICKUP", Time: new Date(deliveredAt.getTime() - 1000).toISOString(), Status: "picked_up" };
        await webhook.accept(staleCallback, { "x-digital-e-webhook-secret": "retail-p0-test-only-secret" });
        await runner.run({ limit: 100, budgetMs: 20000 });

        const [deliveredRows] = await integrationPool.query<Array<{ status: number; state: string; provider_updated_at: Date }>>(
            "SELECT o.status, s.state, s.provider_updated_at FROM orders o JOIN shipments s ON s.order_id = o.id WHERE o.id = ?", [localOrderId],
        );
        expect(deliveredRows[0].status).toBe(1);
        expect(deliveredRows[0].state).toBe("DELIVERED");
        const [settlementRows] = await integrationPool.query<Array<{ collected_vnd: string; carrier_fee_vnd: string; actual_fee_vnd: string; status: string }>>(
            `SELECT c.collected_vnd, c.carrier_fee_vnd, sh.actual_fee_vnd, c.status FROM cod_settlements c
             JOIN shipments sh ON sh.order_id = c.order_id WHERE c.order_id = ?`, [localOrderId],
        );
        expect(Number(settlementRows[0].collected_vnd)).toBe(100000);
        expect(Number(settlementRows[0].carrier_fee_vnd)).toBe(0);
        expect(Number(settlementRows[0].actual_fee_vnd)).toBeGreaterThan(0);
        expect(settlementRows[0].status).toBe("PENDING");
        const [paidRows] = await integrationPool.query<Array<{ status: string; simulated: number; paid_at: Date | null }>>(
            "SELECT status, simulated, paid_at FROM order_payments WHERE id = ?", [payment.insertId],
        );
        expect(paidRows[0].status).toBe("paid");
        expect(Number(paidRows[0].simulated)).toBe(0);
        expect(paidRows[0].paid_at).toBeTruthy();

        const evidence = await app.get(EvidenceService).store(user.id, {
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
            mimetype: "image/png", size: 9, originalname: "sandbox-remittance.png",
        });
        journey.evidenceId = evidence.id;
        const remittance = await app.get(CodSettlementService).recordRemittance(localOrderId, user.id, {
            remittedVnd: 100000 - Number(settlementRows[0].actual_fee_vnd),
            transferReference: `${integrationPrefix}:journey-remittance`, transferDate: "2026-10-14", evidenceId: evidence.id,
        });
        expect(remittance.status).toBe("MATCHED");
        await expect(app.get(CodSettlementService).recordRemittance(localOrderId, user.id, {
            remittedVnd: 100000 - Number(settlementRows[0].actual_fee_vnd),
            transferReference: `${integrationPrefix}:journey-remittance`, transferDate: "2026-10-14", evidenceId: evidence.id,
        })).resolves.toMatchObject({ status: "MATCHED" });

        const [request] = await integrationPool.execute<import("mysql2").ResultSetHeader>(
            `INSERT INTO after_sales_requests (order_id, user_id, kind, status, reason, request_idempotency_key)
             VALUES (?, ?, 'RETURN', 'RECEIVED', 'sandbox journey refund', ?)`, [localOrderId, user.id, `${integrationPrefix}:journey-refund`],
        );
        journey.requestId = request.insertId;
        await integrationPool.execute("INSERT INTO after_sales_items (request_id, order_item_id, quantity) VALUES (?, ?, 1)", [request.insertId, item.insertId]);
        await app.get(ManualRefundService, { strict: false }).confirm(request.insertId, user.id, {
            idempotencyKey: `${integrationPrefix}:journey-refund-operation`,
            transferReference: `${integrationPrefix}:journey-refund-transfer`, transferDate: "2026-10-14",
            reviewedReason: "Local sandbox refund attestation", evidenceId: evidence.id, currency: "VND",
        });
        await runner.run({ limit: 100, budgetMs: 20000 });
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
             VALUES (?, 0, 100000, 0, 'VND', 'test address', 'payos', UTC_TIMESTAMP(), ?)`, [user.id, JSON.stringify({ provider: "SANDBOX", address: deliveryAddress, parcel: { grams: 500, lengthCm: 20, widthCm: 10, heightCm: 5 }, serviceTypeId: 2 })],
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
