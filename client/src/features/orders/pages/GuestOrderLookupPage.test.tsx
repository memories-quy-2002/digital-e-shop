import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GuestOrderLookupPage from "./GuestOrderLookupPage";
import { LocaleProvider } from "../../../context/LocaleContext";

const lookupGuestOrder = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ lookupGuestOrder }));
vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("GuestOrderLookupPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("validates order ID and token inline before making a request", async () => {
        render(<MemoryRouter><LocaleProvider><GuestOrderLookupPage /></LocaleProvider></MemoryRouter>);

        fireEvent.click(screen.getByRole("button", { name: /find order/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent("valid order ID");
        expect(lookupGuestOrder).not.toHaveBeenCalled();
    });

    it("renders a token-protected guest order without exposing the token in the URL", async () => {
        lookupGuestOrder.mockResolvedValue({
            id: 42,
            date_added: "2026-09-08T10:00:00.000Z",
            guest_email: "guest@example.com",
            guest_name: "Guest Buyer",
            guest_phone: "+84123456789",
            status: 1,
            total_price: 180,
            discount: 20,
            shipping_address: JSON.stringify({ address: "1 Main Street", city: "HCMC", country: "VN" }),
            payment_method: "cash",
            items: [{
                productId: 10,
                productName: "Widget",
                price: 100,
                sale_price: null,
                stock: 5,
                main_image: "",
                quantity: 2,
                totalPrice: 200,
                category: "Components",
                brand: "Digital-E",
            }],
        });

        render(
            <MemoryRouter initialEntries={["/guest-order?orderId=42"]}>
                <LocaleProvider><GuestOrderLookupPage /></LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "private-token" } });
        fireEvent.click(screen.getByRole("button", { name: /find order/i }));

        await waitFor(() => expect(lookupGuestOrder).toHaveBeenCalledWith(42, "private-token"));
        expect(await screen.findByRole("heading", { name: "Guest Buyer" })).toBeInTheDocument();
        expect(screen.getByText("Widget x2")).toBeInTheDocument();
        expect(window.location.search).toBe("");
    });
});
