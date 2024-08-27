import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../App";
import withSessionCheck from "../components/common/withSessionCheck";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import LoginPage from "../components/pages/LoginPage";

const ProtectedAdminDashboard = withSessionCheck(AdminDashboard);

describe("App", () => {
    it("renders HomePage component on default route", () => {
        render(<App />);
        expect(screen.getByText(/Up to 55% OFF/i)).toBeInTheDocument();
        expect(screen.getByText(/with the new devices/i)).toBeInTheDocument();
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
                <ProtectedAdminDashboard />
            </BrowserRouter>
        );

        let link = screen.getAllByText(/Dashboard/i)[0] as HTMLAnchorElement;
        expect(link).toBeInTheDocument();
        expect(screen.getByText(/Download Report/i)).toBeInTheDocument();
        expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
    });

    it("matches the App snapshot", () => {
        const { asFragment } = render(<App />);
        expect(asFragment()).toMatchSnapshot();
    });
});
