import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
    closeIntegrationPools,
    createTestOrder,
    createTestUser,
    integrationPool,
    integrationPrefix,
} from "../../database/__tests__/integration-database";
import { CodSettlementRepository } from "../../payments/cod-settlement.repository";
import { CodSettlementService } from "../../payments/cod-settlement.service";
import { LoyaltyRepository } from "../../loyalty/loyalty.repository";
import { LoyaltyService } from "../../loyalty/loyalty.service";
import { DeliveryAssignmentRepository } from "../delivery-assignment.repository";
import { DeliveryAssignmentService } from "../delivery-assignment.service";

describe("internal delivery assignment database integration", () => {
    const orderIds: number[] = [];
    const userIds: string[] = [];
    const repository = new DeliveryAssignmentRepository();
    const emails = { emit: vi.fn(async () => undefined), emitPaymentConfirmed: vi.fn(async () => undefined) };
    const service = new DeliveryAssignmentService(
        repository,
        new CodSettlementService(new CodSettlementRepository(), {} as never),
        emails as never,
        new LoyaltyService(new LoyaltyRepository()),
    );
    let driverId = "";
    let adminId = "";
    let customerId = "";

    const createInternalOrder = async (label: string): Promise<number> => {
        const orderId = await createTestOrder(customerId, 100000);
        orderIds.push(orderId);
        const snapshot = {
            provider: "INTERNAL",
            address: {
                recipientName: "Test Customer",
                recipientPhone: "+84900000000",
                addressLine: "1 Integration Street",
                city: "Ho Chi Minh City",
                country: "VN",
                latitude: 10.78,
                longitude: 106.7,
            },
            shippingFeeVnd: 0,
        };
        await integrationPool.execute(
            "UPDATE orders SET currency = 'VND', delivery_snapshot = ?, pricing_snapshot = ? WHERE id = ?",
            [JSON.stringify(snapshot), JSON.stringify({ itemsSubtotal: 100000, merchandiseDiscount: 0, promotionDiscount: 0, loyaltyDiscount: 0 }), orderId],
        );
        await integrationPool.execute(
            `INSERT INTO order_payments (order_id, provider, status, idempotency_key, base_amount, base_currency, amount, currency, simulated)
             VALUES (?, 'cash', 'pending', ?, 100000, 'VND', 100000, 'VND', 0)`,
            [orderId, `${integrationPrefix}-payment-${label}`],
        );
        await integrationPool.execute(
            `INSERT INTO shipments (order_id, state, provider, client_reference, expected_cod_vnd, sandbox)
             VALUES (?, 'READY_TO_SHIP', 'INTERNAL', ?, 100000, 0)`,
            [orderId, `${integrationPrefix}-ship-${label}`],
        );
        await integrationPool.execute(
            "INSERT INTO cod_settlements (order_id, expected_cod_vnd, currency) VALUES (?, 100000, 'VND')",
            [orderId],
        );
        return orderId;
    };

    beforeAll(async () => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") {
            throw new Error("Requires local disposable retail_p0_test");
        }
        const [customer, driver, admin] = await Promise.all([
            createTestUser("delivery-customer"),
            createTestUser("delivery-driver"),
            createTestUser("delivery-admin"),
        ]);
        customerId = customer.id;
        driverId = driver.id;
        adminId = admin.id;
        userIds.push(customerId, driverId, adminId);
        await integrationPool.execute("UPDATE users SET role = 'DeliveryStaff' WHERE id = ?", [driverId]);
        await integrationPool.execute("UPDATE users SET role = 'Admin' WHERE id = ?", [adminId]);
        await createInternalOrder("schedule-a");
        await createInternalOrder("schedule-b");
    });

    afterAll(async () => {
        if (orderIds.length) {
            const orderIdPlaceholders = orderIds.map(() => "?").join(", ");
            await integrationPool.execute(`DELETE FROM delivery_events WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM delivery_assignments WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM cod_settlement_events WHERE settlement_id IN (SELECT id FROM cod_settlements WHERE order_id IN (${orderIdPlaceholders}))`, orderIds);
            await integrationPool.execute(`DELETE FROM loyalty_ledger WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM cod_settlements WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM shipments WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM order_status_events WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM order_payments WHERE order_id IN (${orderIdPlaceholders})`, orderIds);
            await integrationPool.execute(`DELETE FROM orders WHERE id IN (${orderIdPlaceholders})`, orderIds);
        }
        if (userIds.length) {
            const userIdPlaceholders = userIds.map(() => "?").join(", ");
            await integrationPool.execute(`DELETE FROM loyalty_accounts WHERE user_id IN (${userIdPlaceholders})`, userIds);
            await integrationPool.execute(`DELETE FROM users WHERE id IN (${userIdPlaceholders})`, userIds);
        }
        await closeIntegrationPools();
    });

    it("integration serializes overlapping assignments and completes COD, loyalty and email effects once", async () => {
        const schedule = {
            employeeId: driverId,
            scheduledStartAt: new Date("2026-10-17T02:00:00.000Z"),
            scheduledEndAt: new Date("2026-10-17T03:00:00.000Z"),
        };
        const assignmentResults = await Promise.allSettled([
            service.assign({ ...schedule, orderId: orderIds[0] }, adminId),
            service.assign({ ...schedule, orderId: orderIds[1] }, adminId),
        ]);
        expect(assignmentResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(assignmentResults.filter((result) => result.status === "rejected")).toHaveLength(1);
        const activeRows = await integrationPool.execute(
            "SELECT id, order_id FROM delivery_assignments WHERE employee_id = ? AND status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')",
            [driverId],
        );
        expect((activeRows[0] as unknown[])).toHaveLength(1);

        const created = assignmentResults.find((result) => result.status === "fulfilled");
        if (!created || created.status !== "fulfilled") throw new Error("An assignment was not created");
        const assignment = created.value;
        await service.transition({ assignmentId: assignment.id, employeeId: driverId, status: "OUT_FOR_DELIVERY" });
        await Promise.all([
            service.transition({ assignmentId: assignment.id, employeeId: driverId, status: "DELIVERED" }),
            service.transition({ assignmentId: assignment.id, employeeId: driverId, status: "DELIVERED" }),
        ]);

        const [orders] = await integrationPool.execute("SELECT status FROM orders WHERE id = ?", [assignment.orderId]);
        const [settlements] = await integrationPool.execute("SELECT collected_vnd FROM cod_settlements WHERE order_id = ?", [assignment.orderId]);
        const [collectionEvents] = await integrationPool.execute("SELECT id FROM cod_settlement_events WHERE settlement_id = (SELECT id FROM cod_settlements WHERE order_id = ?) AND event_type = 'COLLECTION'", [assignment.orderId]);
        const [loyalty] = await integrationPool.execute("SELECT balance_points FROM loyalty_accounts WHERE user_id = ?", [customerId]);
        const [earnEvents] = await integrationPool.execute("SELECT id FROM loyalty_ledger WHERE event_key = ?", [`order:${assignment.orderId}:earn`]);

        expect((orders as Array<{ status: number }>)[0]?.status).toBe(1);
        expect(Number((settlements as Array<{ collected_vnd: number }>)[0]?.collected_vnd)).toBe(100000);
        expect((collectionEvents as unknown[])).toHaveLength(1);
        expect(Number((loyalty as Array<{ balance_points: number }>)[0]?.balance_points)).toBe(100);
        expect((earnEvents as unknown[])).toHaveLength(1);
        expect(emails.emitPaymentConfirmed).toHaveBeenCalledTimes(1);
        expect(emails.emit).toHaveBeenCalledTimes(2);
    });
});
