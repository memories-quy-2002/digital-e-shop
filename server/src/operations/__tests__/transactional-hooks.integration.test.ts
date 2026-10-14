import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeIntegrationPools, integrationPool, integrationPrefix } from "../../database/__tests__/integration-database";
import { withTransaction } from "../../database/transaction";
import { TransactionalEmailRepository } from "../../transactional-email/email.repository";
import type { EmailBusinessEvent } from "../../transactional-email/email.types";
import { renderEmail } from "../../transactional-email/email.templates";
import { TasksRepository } from "../tasks.repository";

describe("transactional business hooks database integration", () => {
    const emailRepository = new TransactionalEmailRepository();
    const tasksRepository = new TasksRepository();
    const key = `${integrationPrefix}-hook`;
    const event: EmailBusinessEvent = {
        type: "order_cancelled",
        eventKey: `${key}-cancelled`,
        recipient: "snapshot@example.test",
        locale: "vi",
        snapshot: { orderNumber: "42", customerName: "Snapshot Customer", reason: "Customer requested cancellation" },
    };

    beforeAll(() => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") {
            throw new Error("Transactional hook integration requires disposable local retail_p0_test");
        }
    });

    afterAll(async () => {
        await integrationPool.execute("DELETE FROM operations_tasks WHERE business_key LIKE ?", [`${key}%`]);
        await integrationPool.execute("DELETE FROM transactional_emails WHERE event_key LIKE ?", [`${key}%`]);
        await closeIntegrationPools();
    });

    it("integration commits email and task together, and rolls both back with the business transaction", async () => {
        const message = renderEmail(event);
        await expect(withTransaction(async (tx) => {
            await emailRepository.enqueue(tx, event, message);
            await tasksRepository.enqueue(tx, { kind: "EMAIL_SEND", key: event.eventKey, payload: { emailId: 999 } });
            throw new Error("simulated business rollback");
        })).rejects.toThrow("simulated business rollback");
        const [rolledBackEmails] = await integrationPool.query<Array<{ id: number }>>(
            "SELECT id FROM transactional_emails WHERE event_key = ?", [event.eventKey],
        );
        const [rolledBackTasks] = await integrationPool.query<Array<{ id: number }>>(
            "SELECT id FROM operations_tasks WHERE kind = 'EMAIL_SEND' AND business_key = ?", [event.eventKey],
        );
        expect(rolledBackEmails).toEqual([]);
        expect(rolledBackTasks).toEqual([]);

        const committedId = await withTransaction(async (tx) => {
            const persisted = await emailRepository.enqueue(tx, event, message);
            await tasksRepository.enqueue(tx, { kind: "EMAIL_SEND", key: event.eventKey, payload: { emailId: persisted.id } });
            return persisted.id;
        });
        const [committedEmails] = await integrationPool.query<Array<{ id: number; locale: string; recipient: string }>>(
            "SELECT id, locale, recipient FROM transactional_emails WHERE event_key = ?", [event.eventKey],
        );
        const [committedTasks] = await integrationPool.query<Array<{ payload: string; state: string }>>(
            "SELECT payload, state FROM operations_tasks WHERE kind = 'EMAIL_SEND' AND business_key = ?", [event.eventKey],
        );
        expect(committedEmails[0]).toMatchObject({ id: committedId, locale: "vi", recipient: "snapshot@example.test" });
        expect(committedTasks).toHaveLength(1);
        expect(committedTasks[0].state).toBe("READY");
        const payload = typeof committedTasks[0].payload === "string" ? JSON.parse(committedTasks[0].payload) : committedTasks[0].payload;
        expect(payload).toEqual({ emailId: committedId });
    });
});
