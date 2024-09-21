import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import axios from "../api/axios";
import HomePage from "../components/pages/HomePage";
import LoginPage from "../components/pages/LoginPage";
import ShopsPage from "../components/pages/ShopsPage";
import ToastProvider from "../context/ToastContext";
import { Product } from "../utils/interface";
import ProductPage from "../components/pages/ProductPage";

const mockedUsedNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
    ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockedUsedNavigate,
}));
jest.mock("../api/axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const LocationDisplay = () => {
    const location = useLocation();
    console.log("Location updated:", location.pathname);
    return <div data-testid="location-display">{location.pathname}</div>;
};

const mockProducts: Product[] = [
    {
        id: 1,
        name: "Apple",
        category: "Electronics",
        brand: "Brand A",
        price: 99.99,
        sale_price: 79.99,
        rating: 4.5,
        reviews: 100,
        main_image: "https://example.com/product1.jpg",
        image_gallery: ["https://example.com/product1-1.jpg", "https://example.com/product1-2.jpg"],
        stock: 10,
        description: "This is a description of Product 1",
        specifications: ["Specification 1", "Specification 2"],
    },
    {
        id: 2,
        name: "Gucci",
        category: "Fashion",
        brand: "Brand B",
        price: 49.99,
        sale_price: null,
        rating: 4.2,
        reviews: 50,
        main_image: "https://example.com/product2.jpg",
        image_gallery: null,
        stock: 20,
        description: "This is a description of Product 2",
        specifications: ["Specification 3", "Specification 4"],
    },
    {
        id: 3,
        name: "LG",
        category: "Television",
        brand: "Brand C",
        price: 149.99,
        sale_price: null,
        rating: 4.8,
        reviews: 22,
        main_image: "https://example.com/product3.jpg",
        image_gallery: null,
        stock: 2,
        description: "This is a description of Product 3",
        specifications: ["Specification 5"],
    },
];

describe("HomePage", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    it("should match the HomePage snapshot", () => {
        const { asFragment } = render(
            <ToastProvider>
                <BrowserRouter>
                    <HomePage />
                </BrowserRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("should navigate to shops page when 'View all' is clicked", async () => {
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

    it("should handle list of empty product when not handle API", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    products: [],
                },
                status: 200,
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products");
        });
        await waitFor(() => {
            expect(screen.queryByText("Add to cart")).not.toBeInTheDocument();
        });
    });

    it("should handle list of product when fetching API", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    products: mockProducts,
                    msg: "Products are fetched successfully",
                },
                status: 200,
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products");
        });
        await waitFor(() => {
            const addToCartButton = screen.getAllByText("Add to cart")[0];
            expect(addToCartButton).toBeInTheDocument();
        });
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("Gucci")).toBeInTheDocument();
    });

    it("should navigate to product details page when a product is clicked", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    products: mockProducts,
                    msg: "Products are fetched successfully",
                },
                status: 200,
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/"]}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/product" element={<ProductPage />} />
                    </Routes>
                    <LocationDisplay />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products");
        });
        await waitFor(() => {
            expect(screen.getByText("Apple")).toBeInTheDocument();
        });
        const productImageDiv = screen.getByAltText("Apple");
        expect(productImageDiv).toBeInTheDocument();

        fireEvent.click(productImageDiv);

        // Check if navigate has been called with the correct argument
        expect(mockedUsedNavigate).toHaveBeenCalledWith("/product?id=1");
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

        await waitFor(() => {
            const location = screen.getByTestId("location-display");
            expect(location).toHaveTextContent("/login");
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
