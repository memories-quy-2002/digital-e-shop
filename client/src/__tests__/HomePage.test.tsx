import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
    BrowserRouter,
    MemoryRouter,
    Route,
    Routes,
    useLocation,
} from "react-router-dom";
import HomePage from "../components/pages/HomePage";
import ShopsPage from "../components/pages/ShopsPage";
import ToastProvider from "../context/ToastContext";
import LoginPage from "../components/pages/LoginPage";
import SignupPage from "../components/pages/SignupPage";

const mockedUsedNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockedUsedNavigate,
}));

const LocationDisplay = () => {
    const location = useLocation();
    console.log("Location updated:", location.pathname);
    return <div data-testid="location-display">{location.pathname}</div>;
};

describe.skip("HomePage", () => {
    it("matches the HomePage snapshot", () => {
        const { asFragment } = render(
            <ToastProvider>
                <BrowserRouter>
                    <HomePage />
                </BrowserRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("navigates to shops page when 'View all' is clicked", async () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/"]}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/shops" element={<ShopsPage />} />
                    </Routes>
                    <LocationDisplay />
                </MemoryRouter>
            </ToastProvider>
        );

        const viewAllLink = screen.getByRole("link", { name: "View all" });
        expect(viewAllLink).toBeInTheDocument();
        expect(viewAllLink).toHaveAttribute("href", "/shops");
        fireEvent.click(viewAllLink);

        const location = screen.getByTestId("location-display");
        await waitFor(() => {
            expect(location).toHaveTextContent("/shops");
        });
    });

    it("navigates to login page when login link is clicked", async () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/"]}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/login" element={<LoginPage />} />
                    </Routes>
                    <LocationDisplay />
                </MemoryRouter>
            </ToastProvider>
        );

        const loginLink = screen.getByRole("link", { name: "Login" });
        expect(loginLink).toBeInTheDocument();
        expect(loginLink).toHaveAttribute("href", "/login");

        fireEvent.click(loginLink);
        const location = screen.getByTestId("location-display");

        await waitFor(() => {
            expect(location).toHaveTextContent("/login");
        });
    });

    it("navigates to signup page", async () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/"]}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/signup" element={<SignupPage />} />
                    </Routes>
                    <LocationDisplay />
                </MemoryRouter>
            </ToastProvider>
        );

        const signupLink = screen.getByRole("link", { name: /signup/i });
        expect(signupLink).toBeInTheDocument();
        expect(signupLink).toHaveAttribute("href", "/signup");

        fireEvent.click(signupLink);
        const location = screen.getByTestId("location-display");

        await waitFor(() => {
            expect(location).toHaveTextContent("/signup");
        });
    });

    it('displays "Login required" toast message when clicked', async () => {
        render(
            <ToastProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </ToastProvider>
        );

        const div = screen.getByText("Wishlist");
        fireEvent.click(div);

        await waitFor(() => {
            expect(screen.getByText("Login required")).toBeInTheDocument();
        });
    });
});
