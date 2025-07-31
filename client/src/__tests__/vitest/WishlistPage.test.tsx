import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import WishlistPage from "../../components/pages/WishlistPage";
import ToastProvider from "../../context/ToastContext";
import axios from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
vi.mock("../api/axios");
const mockedAxios = vi.mocked(axios);
vi.mock("../context/AuthContext", () => ({
    useAuth: vi.fn(),
}));
describe("WishlistPage", () => {
    const mockedWishlist = [
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
        {
            id: 2,
            product_id: 2,
            name: "Gucci",
            category: "Clothing",
            brand: "Brand B",
            price: 199.99,
            sale_price: 149.99,
            rating: 4.8,
            reviews: 80,
            main_image: "https://example.com/product2.jpg",
            image_gallery: ["https://example.com/product2-1.jpg", "https://example.com/product2-2.jpg"],
            stock: 5,
            description: "This is a description of Product 2",
            specifications: ["Specification 3", "Specification 4"],
        },
    ];
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
    });
    it("should match the WishlistPage snapshot", async () => {
        (useAuth as Mock).mockReturnValue({
            uid: "12345", // Mocked uid
            userData: null,
            loading: false,
        });
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });
    it("should fetch wishlist and display products", async () => {
        (mockedAxios.get as Mock).mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: {
                    wishlist: mockedWishlist,
                    msg: "Wishlist fetched successfully",
                },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith("/api/wishlist/12345");
        });
        await waitFor(() => {
            expect(screen.getByText("Apple")).toBeInTheDocument();
        });
    });

    it("should show text when wishlist is empty", async () => {
        (mockedAxios.get as Mock).mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: {
                    wishlist: [],
                    msg: "Wishlist fetched successfully",
                },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Đảm bảo rằng API được gọi
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith("/api/wishlist/12345");
        });
        await waitFor(() => {
            expect(screen.getByText("There is no product in your wishlist")).toBeInTheDocument();
        });
    });

    it("should add product to cart when click Add to cart", async () => {
        (mockedAxios.get as Mock).mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: {
                    wishlist: mockedWishlist,
                    msg: "Wishlist fetched successfully",
                },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Đảm bảo rằng API được gọi
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith("/api/wishlist/12345");
        });
        await waitFor(() => {
            expect(screen.getByText("Apple")).toBeInTheDocument();
        });
        const addButton = screen.getAllByRole("button", { name: /add to cart/i })[0];
        expect(addButton).toBeInTheDocument();
        fireEvent.click(addButton);
        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith("/api/cart/", {
                uid: "12345",
                pid: 1,
                quantity: 1,
            });
        });
    });

    it("should remove the wishlist item correctly", async () => {
        (mockedAxios.get as Mock).mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: {
                    wishlist: mockedWishlist,
                    msg: "Wishlist fetched successfully",
                },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <WishlistPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Đảm bảo rằng API được gọi
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith("/api/wishlist/12345");
        });
        await waitFor(() => {
            expect(screen.getByText("Apple")).toBeInTheDocument();
        });
        const deleteButton = screen.getAllByTestId("delete-btn")[0];
        expect(deleteButton).toBeInTheDocument();
        fireEvent.click(deleteButton);
        await waitFor(() => {
            expect(screen.getByText(/remove wishlist/i)).toBeInTheDocument();
        });
        const confirmButton = screen.getByRole("button", { name: "Save Changes" });
        expect(confirmButton).toBeInTheDocument();
        fireEvent.click(confirmButton);
        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith(`/api/wishlist/delete/`, {
                uid: "12345",
                pid: 1,
            });
        });
    });
});
