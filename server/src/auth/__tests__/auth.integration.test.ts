import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { AuthRepository } from "../auth.repository";
import {
    cleanupTestData,
    closeIntegrationPools,
    createTestUser,
    integrationPool,
    type TestUser,
} from "../../database/__tests__/integration-database";

describe("authentication database integration", () => {
    let user: TestUser;
    let sessionId: number;

    beforeAll(async () => {
        user = await createTestUser("auth");
    });

    afterAll(async () => {
        await cleanupTestData();
        await closeIntegrationPools();
    });

    it("integration persists and closes a customer session through the repository", async () => {
        const repository = new AuthRepository();
        sessionId = await repository.startSession(user.id);

        expect(sessionId).toBeGreaterThan(0);
        await expect(repository.getSessionById(sessionId)).resolves.toEqual(
            expect.objectContaining({ session_start: expect.anything() }),
        );

        const sessionEnd = new Date("2026-09-04T10:00:00.000Z");
        await expect(repository.updateSession(sessionId, sessionEnd)).resolves.toEqual(
            expect.objectContaining({ affectedRows: 1 }),
        );

        const [rows] = await integrationPool.execute<Array<RowDataPacket & { session_end: Date | string | null }>>(
            "SELECT session_end FROM customer_sessions WHERE id = ?",
            [sessionId],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].session_end).not.toBeNull();
    });
});
