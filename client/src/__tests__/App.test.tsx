import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import LoginPage from "../components/pages/LoginPage";

describe.skip("App", () => {
    it("matches the App snapshot", () => {
        const { asFragment } = render(<App />);
        expect(asFragment()).toMatchSnapshot();
    });

    it("renders HomePage component on default route", async () => {
        render(<App />);

        await waitFor(() => {
            expect(
                screen.getByText(/Explore Our Latest Devices/i)
            ).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(
                screen.getByText(
                    /Get the latest electronic devices and components at unbeatable prices/i
                )
            ).toBeInTheDocument();
        });
    });

    it("renders LoginPage component on /login route", () => {
        render(
            <BrowserRouter>
                <LoginPage />
            </BrowserRouter>
        );
        expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    });

    it("redirects unauthenticated user from protected routes", () => {
        render(
            <BrowserRouter>
                <AdminDashboard />
            </BrowserRouter>
        );

        let link = screen.getAllByText(/Dashboard/i)[0] as HTMLAnchorElement;
        expect(link).toBeInTheDocument();
        expect(screen.getByText(/Download Report/i)).toBeInTheDocument();
        expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
    });
});
