import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CartPage from "../components/pages/CartPage";
import ToastProvider from "../context/ToastContext";

describe("CartPage", () => {
    it("matches the CartPage snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <CartPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });
});
