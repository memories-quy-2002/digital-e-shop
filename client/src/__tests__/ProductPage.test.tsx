import { render } from "@testing-library/react";
import ProductPage from "../components/pages/ProductPage";
import { MemoryRouter } from "react-router-dom";
import ToastProvider from "../context/ToastContext";

describe("ProductPage", () => {
    it("matches the ProductPage snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });
});
