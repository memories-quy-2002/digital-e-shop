import "reflect-metadata";
import { AppModule } from "../../app.module";
import { OrdersModule } from "../../orders/orders.module";
import { PayOSReconciliationTaskProcessor } from "../payos-reconciliation-task.processor";
import { TaskRunnerModule } from "../task-runner.module";
import { PAYOS_TASK_PROCESSOR, SHIPMENT_TASK_PROCESSOR } from "../task-runner.service";

describe("AppModule task runner composition", () => {
    it("registers the PayOS processor with OrdersModule dependencies", () => {
        const imports = Reflect.getMetadata("imports", AppModule) as Array<unknown>;
        const taskRunner = imports.find((module) =>
            typeof module === "object" && module !== null && "module" in module && module.module === TaskRunnerModule,
        ) as { imports?: unknown[]; providers?: Array<Record<string, unknown>> } | undefined;

        expect(taskRunner?.imports).toContain(OrdersModule);
        expect(taskRunner?.providers).toContainEqual({
            provide: PAYOS_TASK_PROCESSOR,
            useExisting: PayOSReconciliationTaskProcessor,
        });
        expect(taskRunner?.providers?.some((provider) => provider.provide === SHIPMENT_TASK_PROCESSOR)).toBe(true);
    });
});
