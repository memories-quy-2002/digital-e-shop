import { fireEvent, render, screen } from "@testing-library/react";
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

const mockedUsedNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockedUsedNavigate,
}));

const LocationDisplay = () => {
    const location = useLocation();
    return <div data-testid="location-display">{location.pathname}</div>;
};

describe("HomePage", () => {
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

    it("navigates to /shops when 'View all' is clicked", () => {
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
        expect(viewAllLink).toHaveAttribute("href", "/shops");
        if (viewAllLink) {
            fireEvent.click(viewAllLink);
        } else {
            throw new Error("Link 'View all' not found");
        }
        const location = screen.getByTestId("location-display");
        expect(location).toHaveTextContent("/shops");
    });
});
