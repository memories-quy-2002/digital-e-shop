import { render, waitFor, screen } from "@testing-library/react";
import ProductPage from "../components/pages/ProductPage";
import { MemoryRouter } from "react-router-dom";
import ToastProvider from "../context/ToastContext";
import axios from "../api/axios";
import { Product } from "../utils/interface";

jest.mock("../api/axios");

// Now `axios.post` will be of type `jest.Mock`
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockProduct: Product = {
    id: 1,
    name: "Apple",
    category: "Electronics",
    brand: "Brand A",
    price: 99.99,
    sale_price: 79.99,
    rating: 4.5,
    reviews: 100,
    main_image: "https://example.com/product1.jpg",
    image_gallery: [
        "https://example.com/product1-1.jpg",
        "https://example.com/product1-2.jpg",
    ],
    stock: 10,
    description: "This is a description of Product 1",
    specifications: ["Specification 1", "Specification 2"],
};

describe("ProductPage", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    it("matches the ProductPage snapshot", async () => {
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
        render(
            <ToastProvider>
                <MemoryRouter>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(
                screen.getByText("People who bought this product also buy")
            ).toBeInTheDocument();
        });
    });

    it("should handle fetching API product correctly", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                data: {
                    product: mockProduct,
                    msg: "Product fetched successfully",
                },
                status: 200,
            });
        });
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <ProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/1");
        });
        await waitFor(() => {
            expect(screen.getByText("Electronics")).toBeInTheDocument();
        });
        expect(asFragment()).toMatchSnapshot();
    });
});
