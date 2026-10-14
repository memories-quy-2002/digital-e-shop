import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../orders.service", () => ({ NestOrdersService: class {} }));
vi.mock("../orders.payos.service", () => ({ NestOrdersPayOSService: class {} }));

import { GuestOrdersController } from "../guest-orders.controller";
import type { GuestPurchasePayload } from "../orders.dto";
import type { NestOrdersService } from "../orders.service";
import type { NestOrdersPayOSService } from "../orders.payos.service";
import { deliveryCheckout } from "../../shipping/__tests__/checkout-fixture";

describe("GuestOrdersController", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps the guest purchase response contract and delegates to the order service", async () => {
        const ordersService = {
            makeGuestPurchase: vi.fn().mockResolvedValue({
                order: { id: 27 },
                guestOrderToken: "guest-token",
            }),
        } as unknown as NestOrdersService;
        const ordersPayOSService = {} as NestOrdersPayOSService;
        const controller = new GuestOrdersController(ordersService, ordersPayOSService);
        const payload: GuestPurchasePayload = {
            ...deliveryCheckout,
            paymentMethod: "cash",
            cart: [{ productId: 1, quantity: 1 }],
            contact: { email: "customer@example.com", name: "Test Customer" },
            shipping: { address: "123 Main Street", city: "Test City", country: "Test Country" },
        };

        await expect(controller.makeGuestPurchase(payload, { cookies: { digitalEGuestCartId: "11111111-1111-4111-8111-111111111111" } } as never)).resolves.toEqual({
            orderId: 27,
            order: { id: 27 },
            guestOrderToken: "guest-token",
            paymentMethod: "cash",
            msg: "Order has been created successfully with id = 27",
        });
        expect(ordersService.makeGuestPurchase).toHaveBeenCalledWith(payload, "11111111-1111-4111-8111-111111111111");
    });
});
