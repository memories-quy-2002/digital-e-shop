import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GuestOrderLookupPage from "./GuestOrderLookupPage";
import { LocaleProvider } from "../../../context/LocaleContext";

const lookupGuestOrder = vi.hoisted(() => vi.fn());
const requestGuestOrderAccessRecovery = vi.hoisted(() => vi.fn());
const verifyGuestOrderAccessRecovery = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({ lookupGuestOrder, requestGuestOrderAccessRecovery, verifyGuestOrderAccessRecovery }));
vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("GuestOrderLookupPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.removeItem("digital-e:locale:v1");
        lookupGuestOrder.mockResolvedValue({ id: 42, guest_name: "Recovered buyer", items: [] });
    });

    it("validates order ID and token inline before making a request", async () => {
        render(<MemoryRouter><LocaleProvider><GuestOrderLookupPage /></LocaleProvider></MemoryRouter>);

        fireEvent.click(screen.getByRole("button", { name: /find order/i }));

        const orderIdInput = screen.getByRole("textbox", { name: /order id/i });
        const orderIdError = await screen.findByRole("alert");
        expect(orderIdError).toHaveTextContent("valid order ID");
        expect(orderIdInput).toHaveAttribute("aria-invalid", "true");
        expect(orderIdInput).toHaveAttribute("aria-describedby", "guest-order-id-error");

        fireEvent.change(orderIdInput, { target: { value: "42" } });
        fireEvent.click(screen.getByRole("button", { name: /find order/i }));

        const tokenInput = screen.getByLabelText(/access token/i);
        const tokenError = await screen.findByRole("alert");
        expect(tokenError).toHaveTextContent("access token");
        expect(tokenInput).toHaveAttribute("aria-invalid", "true");
        expect(tokenInput).toHaveAttribute("aria-describedby", "guest-order-token-error");
        expect(lookupGuestOrder).not.toHaveBeenCalled();
    });

    it("renders a token-protected guest order without exposing the token in the URL", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));
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

        expect(screen.getByRole("heading", { name: "Tra cứu đơn hàng khách" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Biểu mẫu tra cứu đơn hàng khách" })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Mã truy cập"), { target: { value: "private-token" } });
        fireEvent.click(screen.getByRole("button", { name: "Tìm đơn hàng" }));

        await waitFor(() => expect(lookupGuestOrder).toHaveBeenCalledWith(42, "private-token"));
        expect(await screen.findByRole("heading", { name: "Guest Buyer" })).toBeInTheDocument();
        expect(screen.getByText("Thanh toán khi nhận hàng")).toBeInTheDocument();
        expect(screen.getByText("Widget x2")).toBeInTheDocument();
        expect(window.location.search).toBe("");
    });

    it("restores the guest capability through email OTP and uses it for order lookup", async () => {
        verifyGuestOrderAccessRecovery.mockResolvedValue({ guestOrderToken: "recovered-token" });
        render(
            <MemoryRouter initialEntries={["/guest-order"]}>
                <LocaleProvider><GuestOrderLookupPage /></LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByRole("textbox", { name: /order id/i }), { target: { value: "42" } });
        fireEvent.click(screen.getByRole("button", { name: /recover.*email/i }));
        fireEvent.change(screen.getByRole("textbox", { name: /email/i }), { target: { value: "buyer@example.test" } });
        fireEvent.click(screen.getByRole("button", { name: /send.*code/i }));

        expect(await screen.findByRole("status")).toHaveTextContent(/details match a guest order/i);
        expect(requestGuestOrderAccessRecovery).toHaveBeenCalledWith(42, "buyer@example.test");
        fireEvent.change(screen.getByRole("textbox", { name: /verification code/i }), { target: { value: "012345" } });
        fireEvent.click(screen.getByRole("button", { name: /verify.*code/i }));

        await waitFor(() => expect(verifyGuestOrderAccessRecovery).toHaveBeenCalledWith(42, "buyer@example.test", "012345"));
        await waitFor(() => expect(lookupGuestOrder).toHaveBeenCalledWith(42, "recovered-token"));
        expect(await screen.findByRole("heading", { name: "Recovered buyer" })).toBeInTheDocument();
        expect(window.location.search).toBe("");
    });
});
