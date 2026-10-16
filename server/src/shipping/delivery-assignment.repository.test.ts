import { describe, expect, it, vi } from "vitest";
import { DeliveryAssignmentRepository } from "./delivery-assignment.repository";

describe("DeliveryAssignmentRepository", () => {
    it("keeps customer delivery summaries public and omits internal failure and actor details", async () => {
        const tx = {
            query: vi.fn(async (sql: string) => {
                if (sql.includes("FROM delivery_assignments a")) return [{
                    id: 5,
                    order_id: 42,
                    employee_id: "driver-1",
                    scheduled_start_at: new Date("2026-10-17T02:00:00Z"),
                    scheduled_end_at: new Date("2026-10-17T03:00:00Z"),
                    status: "DELIVERY_FAILED",
                    first_name: "Driver",
                    last_name: "One",
                    username: "driver-one",
                }] as never;
                if (sql.includes("FROM delivery_events")) return [{
                    id: 8,
                    assignment_id: 5,
                    status: "DELIVERY_FAILED",
                    public_note: "Delivery could not be completed",
                    created_at: new Date("2026-10-17T03:00:00Z"),
                }] as never;
                return [] as never;
            }),
        };
        const repository = new DeliveryAssignmentRepository();
        repository.transaction = vi.fn(async (work) => work(tx as never));

        const summary = await repository.customerSummary(42);

        expect(summary).toEqual({
            id: 5,
            orderId: 42,
            employeeName: "Driver One",
            scheduledStartAt: "2026-10-17T02:00:00.000Z",
            scheduledEndAt: "2026-10-17T03:00:00.000Z",
            status: "DELIVERY_FAILED",
            events: [{ id: 8, status: "DELIVERY_FAILED", publicNote: "Delivery could not be completed", createdAt: "2026-10-17T03:00:00.000Z" }],
        });
        expect(summary).not.toHaveProperty("failureReason");
        expect(summary?.events[0]).not.toHaveProperty("actorId");
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("a.order_id = ? AND a.status <> 'REASSIGNED' ORDER BY a.id DESC"), [42]);
        expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("failure_reason") || String(sql).includes("actor_id"))).toBe(false);
    });

    it("scopes employee assignment detail queries in SQL by assignment and employee", async () => {
        const tx = { query: vi.fn(async () => [] as never) };
        const repository = new DeliveryAssignmentRepository();
        repository.transaction = vi.fn(async (work) => work(tx as never));

        await repository.getAssignmentForStaff(5, "driver-2");

        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("WHERE a.id = ? AND a.employee_id = ?"), [5, "driver-2"]);
    });
});
