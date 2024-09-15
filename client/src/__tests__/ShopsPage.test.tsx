import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "../api/axios"; // Import your custom Axios instance
import ShopsPage from "../components/pages/ShopsPage"; // Adjust based on your project structure
import ToastProvider from "../context/ToastContext";
import { Product } from "../utils/interface";

// Mock Axios
jest.mock("../api/axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("ShopsPage", () => {
    const products: Product[] = [
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

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("matches the ShopsPage snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("renders the shops page with products", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: { products, msg: "Products are fetched successfully" },
                status: 200,
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        expect(screen.getByText("SHOPS PRODUCTS")).toBeInTheDocument();
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products");
        });
        await waitFor(() => {
            expect(screen.getByText("Apple")).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByText("Fashion")).toBeInTheDocument();
        });
    });

    it("renders the shop without products", async () => {
        render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            // Check for error message display
            expect(screen.getByText(/There is no product matched the filters/i)).toBeInTheDocument();
        });
    });

    it("renders the shops page with products filtered by search terms", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: { products, msg: "Products are fetched successfully" },
                status: 200,
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText("LG")).toBeInTheDocument();
        });
        const inputText = screen.getByPlaceholderText("Search product...");
        const applyButton = screen.getByRole("button", {
            name: /apply/i,
        });

        fireEvent.change(inputText, { target: { value: "LG" } });
        fireEvent.click(applyButton);
        await waitFor(() => {
            expect(screen.queryByText("Apple")).not.toBeInTheDocument();
        });
    });

    it("renders the shops page with no products matched filters by term", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: { products, msg: "Products are fetched successfully" },
                status: 200,
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText("LG")).toBeInTheDocument();
        });

        const inputText = screen.getByPlaceholderText("Search product...");
        const applyButton = screen.getByRole("button", {
            name: /apply/i,
        });

        fireEvent.change(inputText, { target: { value: "Not__filtered" } });
        fireEvent.click(applyButton);
        await waitFor(() => {
            expect(screen.queryByText("Apple")).not.toBeInTheDocument();
        });
        expect(screen.queryByRole("paragraph", { name: "Fashion" })).not.toBeInTheDocument();
        expect(screen.queryByText("LG")).not.toBeInTheDocument();
    });

    it("renders the shops page with products filtered by checkbox", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: { products, msg: "Products are fetched successfully" },
                status: 200,
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(screen.getByLabelText("Fashion")).toBeInTheDocument();
        });

        // const element = screen.getByTestId("shops__aside__brand");
        // console.log(prettyDOM(element));
        const checkbox = screen.getByLabelText("Fashion");
        const applyButton = screen.getByRole("button", {
            name: /apply/i,
        });

        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();
        fireEvent.click(applyButton);

        await waitFor(() => {
            expect(screen.queryByText("Apple")).not.toBeInTheDocument();
        });
        expect(screen.getByText("Gucci")).toBeInTheDocument();
    });
});
