import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { InventoryRepository } from "../inventory.repository";
import { NestInventoryService } from "../inventory.service";
import {
    cleanupTestData,
    closeIntegrationPools,
    createTestProduct,
    integrationPool,
} from "../../database/__tests__/integration-database";

describe("inventory database integration", () => {
    let productId: number;

    beforeAll(async () => {
        productId = await createTestProduct("inventory");
    });

    afterAll(async () => {
        await cleanupTestData();
        await closeIntegrationPools();
    });

    it("integration persists an inventory movement and reloads it from MySQL", async () => {
        const repository = new InventoryRepository();
        const movement = {
            productId,
            movementType: "integration-test",
            quantityChange: -2,
            stockBefore: 10,
            stockAfter: 8,
            note: "Integration inventory mutation",
            actorId: "integration-test",
        };

        await new Promise<void>((resolve, reject) => {
            repository.createMovement(movement, (error) => (error ? reject(error) : resolve()));
        });

        const movements = await new NestInventoryService(repository).getMovements(200);
        expect(movements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    product_id: productId,
                    movement_type: "integration-test",
                    quantity_change: -2,
                    stock_before: 10,
                    stock_after: 8,
                }),
            ]),
        );

        const [rows] = await integrationPool.execute<Array<RowDataPacket & { total: number }>>(
            "SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id = ? AND movement_type = ?",
            [productId, "integration-test"],
        );
        expect(Number(rows[0].total)).toBe(1);
    });
});
