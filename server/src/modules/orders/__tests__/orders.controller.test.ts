import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../orders.service", () => {
    const mocked = {
        getOrderByStripeSessionId: vi.fn(),
    };
    return { ...mocked, default: mocked };
});
vi.mock("../orders.stripe.service", () => {
    const mocked = {
        createCheckoutSession: vi.fn(),
    };
    return { ...mocked, default: mocked };
});
vi.mock("#src/shared/utils/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import ordersController from "../orders.controller";
import * as orderService from "../orders.service";
import * as orderStripeService from "../orders.stripe.service";

const controller = ordersController as {
    createCheckoutSession: (req: Record<string, unknown>, res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }) => Promise<void>;
    getOrderBySessionId: (req: Record<string, unknown>, res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }) => Promise<void>;
};

const createResponse = () => {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
};

describe("orders.controller", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("hides internal errors when checkout session creation fails with a 500", async () => {
        (orderStripeService.createCheckoutSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Stripe exploded"));
        const res = createResponse();

        await controller.createCheckoutSession({
            params: { uid: "user-1" },
            body: {
                totalPrice: 10,
                cart: [{ productId: 1, quantity: 1, price: 10 }],
                discount: 0,
                shippingAddress: "123 Main St",
            },
        }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ msg: "Unable to start checkout right now" });
    });

    it("hides internal errors when loading an order by session id fails", async () => {
        (orderService.getOrderByStripeSessionId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("database blew up"));
        const res = createResponse();

        await controller.getOrderBySessionId(
            { params: { sessionId: "cs_test_123" }, user: { id: "user-1", role: "Customer" } },
            res,
        );

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ msg: "Unable to retrieve order right now" });
    });
});
