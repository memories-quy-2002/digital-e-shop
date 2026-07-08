import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { HealthModule } from "../health.module";
import { HealthController } from "../health.controller";

describe("HealthController", () => {
    it("returns status ok with a timestamp", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [HealthModule],
        }).compile();

        const controller = moduleRef.get(HealthController);
        const result = controller.getHealth();

        expect(result.status).toBe("ok");
        expect(typeof result.timestamp).toBe("string");
        expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    });
});
