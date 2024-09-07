import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WishlistPage from "../components/pages/WishlistPage";
import ToastProvider from "../context/ToastContext";

describe("WishlistPage", () => {
    it("matches the WishlistPage snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });
});
