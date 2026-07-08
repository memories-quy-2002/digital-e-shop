import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { NestConfigModule } from "../nest-config.module";
import { NestConfigService } from "../nest-config.service";

describe("NestConfigService", () => {
    it("exposes values from the existing env config object", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [NestConfigModule],
        }).compile();

        const service = moduleRef.get(NestConfigService);

        expect(service.get("nodeEnv")).toBe(process.env.NODE_ENV || "development");
        expect(service.get("port")).toBeTypeOf("number");
    });

    it("exposes isProduction matching the existing env module's flag", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [NestConfigModule],
        }).compile();

        const service = moduleRef.get(NestConfigService);

        expect(service.isProduction).toBe(process.env.NODE_ENV === "production");
    });
});
