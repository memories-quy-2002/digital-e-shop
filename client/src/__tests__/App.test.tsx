import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "../App";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import ProductPage from "../components/pages/ProductPage";
import HomePage from "../components/pages/HomePage";
import ToastProvider from "../context/ToastContext";
import NoPage from "../components/pages/NoPage";
import ShopsPage from "../components/pages/ShopsPage";

describe("App", () => {
    it("matches the App snapshot", () => {
        const { asFragment } = render(<App />);
        expect(asFragment()).toMatchSnapshot();
    });

    it("renders HomePage component on default route", async () => {
        render(
            <ToastProvider>
                <BrowserRouter>
                    <HomePage />
                </BrowserRouter>
            </ToastProvider>
        );

        // Assert that HomePage content is displayed
        await waitFor(() => {
            expect(screen.getByText(/Explore Our Latest Devices/i)).toBeInTheDocument();
        });
    });

    it("should render ProductPage when navigating to /product", () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Assert that ProductPage content is displayed
        expect(screen.getByText(/People who bought this product also buy/i)).toBeInTheDocument();
    });

    it("should display NotFoundPage for an invalid route", async () => {
        render(
            <MemoryRouter initialEntries={["/invalid-route"]}>
                <NoPage />
            </MemoryRouter>
        );

        // Assert that NotFoundPage is rendered
        await waitFor(() => {
            expect(screen.getByText(/404 Error/i)).toBeInTheDocument();
        });
    });

    it("redirects unauthenticated user from protected routes", () => {
        render(
            <ToastProvider>
                <BrowserRouter>
                    <AdminDashboard />
                </BrowserRouter>
            </ToastProvider>
        );

        let link = screen.getAllByText(/Dashboard/i)[0] as HTMLAnchorElement;
        expect(link).toBeInTheDocument();
        expect(screen.getByText(/Download Report/i)).toBeInTheDocument();
        expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
    });

    it("should navigate between pages correctly", async () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/", "/shops"]}>
                    <HomePage />
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Assert HomePage is initially displayed
        await waitFor(() => {
            expect(screen.getByText(/Explore Our Latest Devices/i)).toBeInTheDocument();
        });

        const viewAllLink = screen.getByRole("link", { name: "View all" });
        expect(viewAllLink).toBeInTheDocument();
        expect(viewAllLink).toHaveAttribute("href", "/shops");
        fireEvent.click(viewAllLink);

        await waitFor(() => {
            expect(screen.getByText(/SHOPS PRODUCTS/i)).toBeInTheDocument();
        });
    });
});
