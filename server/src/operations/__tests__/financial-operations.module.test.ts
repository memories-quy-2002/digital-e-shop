import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { OrdersModule } from "../../orders/orders.module";
import { FinancialOperationsModule } from "../financial-operations.module";
import { ShippingModule } from "../../shipping/shipping.module";

describe("Financial operations module composition", () => {
    it("breaks the Orders, Shipping, FinancialOperations cycle with a forward reference", () => {
        const financialImports = Reflect.getMetadata("imports", FinancialOperationsModule) as unknown[];
        const shippingImports = Reflect.getMetadata("imports", ShippingModule) as Array<unknown>;
        const ordersRef = financialImports.find((value) =>
            typeof value === "object" && value !== null && "forwardRef" in value,
        ) as { forwardRef?: () => unknown } | undefined;
        const shippingFinancialRef = shippingImports.find((value) =>
            typeof value === "object" && value !== null && "forwardRef" in value,
        ) as { forwardRef?: () => unknown } | undefined;

        expect(ordersRef?.forwardRef?.()).toBe(OrdersModule);
        expect(shippingFinancialRef?.forwardRef?.()).toBe(FinancialOperationsModule);
    });
});
