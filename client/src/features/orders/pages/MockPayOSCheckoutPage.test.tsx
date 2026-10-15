import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MockPayOSCheckoutPage from "./MockPayOSCheckoutPage";

const confirmMockPayOSPayment = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ confirmMockPayOSPayment }));
vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

const LocationProbe = () => {
    const location = useLocation();
    return <output aria-label="current location">{`${location.pathname}${location.search}`}</output>;
};

describe("MockPayOSCheckoutPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        confirmMockPayOSPayment.mockResolvedValue({ orderId: 42 });
    });

    it("requires a valid pending checkout link before rendering the simulator", () => {
        render(
            <MemoryRouter initialEntries={["/mock-payos-checkout"]}>
                <MockPayOSCheckoutPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole("alert")).toHaveTextContent(/checkout link is invalid/i);
        expect(screen.queryByRole("button", { name: /simulate payment success/i })).not.toBeInTheDocument();
    });

    it("does not accept a simulator link without a valid payment attempt reference", () => {
        render(
            <MemoryRouter initialEntries={["/mock-payos-checkout?payos_order_code=12345&payment_link_id=mock_payos_link&amount=2250000"]}>
                <MockPayOSCheckoutPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole("alert")).toHaveTextContent(/checkout link is invalid/i);
        expect(screen.queryByRole("button", { name: /simulate payment success/i })).not.toBeInTheDocument();
    });

    it("returns with the bound payment attempt after confirming the exact mock PayOS amount", async () => {
        render(
            <MemoryRouter initialEntries={["/mock-payos-checkout?payos_order_code=12345&payment_link_id=mock_payos_link&amount=2250000&payment_attempt_id=00000000-0000-4000-8000-000000000001"]}>
                <LocationProbe />
                <MockPayOSCheckoutPage />
            </MemoryRouter>,
        );

        expect(screen.getByLabelText("Payment amount")).toHaveTextContent("2.250.000");
        fireEvent.click(screen.getByRole("button", { name: /simulate payment success/i }));

        await waitFor(() => expect(confirmMockPayOSPayment).toHaveBeenCalledWith({
            orderCode: 12345,
            paymentLinkId: "mock_payos_link",
            amount: 2250000,
        }));
        await waitFor(() => expect(screen.getByLabelText("current location")).toHaveTextContent(
            "/checkout-success?payment_provider=payos&payment_attempt_id=00000000-0000-4000-8000-000000000001",
        ));
    });
});
