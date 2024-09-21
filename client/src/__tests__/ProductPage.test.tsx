import { render, waitFor, screen, fireEvent } from "@testing-library/react";
import ProductPage from "../components/pages/ProductPage";
import { MemoryRouter } from "react-router-dom";
import ToastProvider from "../context/ToastContext";
import axios from "../api/axios";
import { Product } from "../utils/interface";
import { useAuth } from "../context/AuthContext";

jest.mock("../api/axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;
jest.mock("../context/AuthContext", () => ({
    useAuth: jest.fn(),
}));
describe("ProductPage", () => {
    const mockProduct: Product[] = [
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
    ];
    const mockWishlist = [
        {
            id: 1,
            product_id: 1,
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
    ];
    const mockReview = [
        {
            id: 1,
            username: "12345",
            rating: 5,
            review_text: "Great product!",
            created_at: "This product is amazing!",
        },
    ];
    beforeEach(() => {
        mockedAxios.get.mockImplementation((url) => {
            if (url === "/api/products/1") {
                return Promise.resolve({
                    data: {
                        product: mockProduct[0],
                        msg: "Product have been fetched successfully",
                    },
                    status: 200,
                });
            }
            return Promise.resolve({
                data: {
                    msg: "No product found",
                },
                status: 200,
            });
        });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it("should match the ProductPage snapshot", async () => {
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("should render ProductPage correctly", async () => {
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(screen.getByText(/People who bought this product also buy/i)).toBeInTheDocument();
        });
    });

    it("should handle fetching API product correctly", async () => {
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/1");
        });
        await waitFor(() => {
            expect(screen.getByText(/Apple/i)).toBeInTheDocument();
        });
    });

    it("should handle adding product to cart correctly", async () => {
        mockedAxios.post.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    msg: "Product added to cart successfully",
                },
                status: 200,
            });
        });
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/1");
        });
        await waitFor(() => {
            expect(screen.getByText(/Electronics/i)).toBeInTheDocument();
        });
        const cartBtn = screen.getByRole("button", { name: /add to cart/i });
        expect(cartBtn).toBeInTheDocument();
        fireEvent.click(cartBtn);

        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/cart/", {
                uid: "12345",
                pid: 1,
                quantity: 1,
            });
        });

        await waitFor(() => {
            expect(screen.getByText(/Product added to cart successfully/i)).toBeInTheDocument();
        });
    });

    it("should handle remove product to wishlist correctly", async () => {
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        mockedAxios.get.mockImplementation((url) => {
            if (url === "/api/products/1") {
                return Promise.resolve({
                    data: {
                        product: mockProduct[0],
                        msg: "Product have been fetched successfully",
                    },
                    status: 200,
                });
            } else if (url === "/api/wishlist/12345") {
                return Promise.resolve({
                    data: {
                        wishlist: mockWishlist,
                        msg: "Wishlist has been fetched successfully",
                    },
                    status: 200,
                });
            }
            return Promise.resolve({
                data: {
                    msg: "No data found",
                },
                status: 204,
            });
        });
        mockedAxios.post.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    msg: "Product added to wishlist successfully",
                },
                status: 200,
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        // Wait for the product and wishlist to be fetched
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/1");
        });
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/wishlist/12345");
        });

        // Verify the product is displayed
        await waitFor(() => {
            expect(screen.getByText(/Electronics/i)).toBeInTheDocument();
        });

        // Find the "Add to wishlist" button
        const wishlistBtn = screen.getByRole("button", { name: /Remove from wishlist/i });
        expect(wishlistBtn).toBeInTheDocument();
        fireEvent.click(wishlistBtn);

        // Wait for the POST request to be made to the wishlist API
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/wishlist/delete", {
                uid: "12345",
                pid: 1,
            });
        });

        await waitFor(() => {
            expect(screen.getByText(/Remove wishlist item/i)).toBeInTheDocument();
        });
    });
    it("should handle adding review correctly", async () => {
        (useAuth as jest.Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        mockedAxios.get.mockImplementation((url) => {
            if (url === "/api/products/1") {
                return Promise.resolve({
                    data: {
                        product: mockProduct[0],
                        msg: "Products have been fetched successfully",
                    },
                    status: 200,
                });
            } else if (url === "/api/reviews/1") {
                return Promise.resolve({
                    data: {
                        reviews: mockReview,
                        msg: "Reviews have been fetched successfully",
                    },
                    status: 200,
                });
            }
            return Promise.resolve({
                data: {
                    msg: "No data found",
                },
                status: 204,
            });
        });
        mockedAxios.post.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    msg: "Review has been submitted successfully",
                },
                status: 200,
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/product?id=1"]}>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/1");
        });
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/reviews/1");
        });
        const reviewBtn = screen.getByRole("button", { name: "Review (1)" });
        expect(reviewBtn).toBeInTheDocument();
        fireEvent.click(reviewBtn);

        await waitFor(() => {
            expect(screen.getByText(/All reviews/i)).toBeInTheDocument();
        });

        const reviewStar = screen.getAllByTestId("reviewStar")[4];
        expect(reviewStar).toBeInTheDocument();
        fireEvent.click(reviewStar);
        fireEvent.change(screen.getByPlaceholderText("Enter your review"), { target: { value: "Test review" } });
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));

        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/reviews/", {
                uid: "12345",
                pid: 1,
                rating: 5,
                reviewText: "Test review",
            });
        });

        await waitFor(() => {
            expect(screen.getByText(/Review has been submitted successfully/i)).toBeInTheDocument();
        });
    });
});
