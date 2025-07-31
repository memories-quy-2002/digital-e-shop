import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import AdminAddProductPage from "../components/pages/admin/AdminAddProductPage";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import AdminProductPage from "../components/pages/admin/AdminProductPage";
import ToastProvider from "../context/ToastContext";
import { Product, Role } from "../utils/interface";
import type { Mock, Mocked } from "vitest";
import AdminOrderPage from "../components/pages/admin/AdminOrderPage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

type Order = {
    id: number;
    date_added: Date;
    user_id: string;
    status: number;
    total_price: number;
    discount: number;
    subtotal: number;
};

type OrderItem = {
    id: number;
    name: string;
    price: number;
    order_id: number;
    sales: number;
    revenue: number;
};

type User = {
    id: string;
    email: string;
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role;
    created_at: Date;
};

vi.mock("../api/axios");

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

const mockedAxios = axios as Mocked<typeof axios>;

describe("AdminDashboard", () => {
    const mockOrders: Order[] = [
        {
            id: 1,
            date_added: new Date("2024-09-13"),
            user_id: "user1",
            status: 1,
            total_price: 100,
            discount: 0,
            subtotal: 100,
        },
        {
            id: 2,
            date_added: new Date("2024-10-01"),
            user_id: "user2",
            status: 2,
            total_price: 500,
            discount: 0,
            subtotal: 500,
        },
    ];

    const mockOrderItems: OrderItem[] = [
        {
            id: 1,
            name: "Product 1",
            price: 20,
            order_id: 1,
            sales: 5,
            revenue: 100,
        },
        {
            id: 2,
            name: "Product 2",
            price: 50,
            order_id: 2,
            sales: 4,
            revenue: 200,
        },
        {
            id: 3,
            name: "Product 3",
            price: 100,
            order_id: 2,
            sales: 3,
            revenue: 300,
        },
    ];
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
            price: 199.99,
            sale_price: 149.99,
            rating: 4.0,
            reviews: 50,
            main_image: "https://example.com/product2.jpg",
            image_gallery: ["https://example.com/product2-1.jpg", "https://example.com/product2-2.jpg"],
            stock: 5,
            description: "This is a description of Product 2",
            specifications: ["Specification 1", "Specification 2"],
        },
    ];
    const mockUsers: User[] = [
        {
            id: "user1",
            email: "user1@example.com",
            password: "password1",
            username: "user1",
            first_name: "John",
            last_name: "Doe",
            role: Role.Customer,
            created_at: new Date("2024-09-13"),
        },
        {
            id: "user2",
            email: "user2@example.com",
            password: "password2",
            username: "user2",
            first_name: "Jane",
            last_name: "Smith",
            role: Role.Admin,
            created_at: new Date("2024-09-15"),
        },
    ];
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should match the AdminDashboard snapshot", () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin"]}>
                    <AdminDashboard />
                </MemoryRouter>
            </ToastProvider>
        );

        expect(asFragment()).toMatchSnapshot();
    });
    it("should fetch and set products, orders, users, and order items", async () => {
        // Mock the API responses
        mockedAxios.get.mockImplementation((url: string) => {
            switch (url) {
                case "/api/products/":
                    return Promise.resolve({
                        status: 200,
                        data: { products: mockProducts, msg: "Products have been fetched successfully" },
                    });
                case "/api/orders/":
                    return Promise.resolve({
                        status: 200,
                        data: { orders: mockOrders, msg: "Orders have been fetched successfully" },
                    });
                case "/api/users/":
                    return Promise.resolve({
                        status: 200,
                        data: { accounts: mockUsers },
                    });
                case "/api/orders/item":
                    return Promise.resolve({
                        status: 200,
                        data: { orderItems: mockOrderItems },
                    });
                default:
                    return Promise.reject(new Error("Unknown endpoint"));
            }
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin"]}>
                    <AdminDashboard />
                </MemoryRouter>
            </ToastProvider>
        );

        // Ensure the API calls are made correctly
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/");
        });

        expect(mockedAxios.get).toHaveBeenCalledWith("/api/orders/");
        expect(mockedAxios.get).toHaveBeenCalledWith("/api/users/");
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/orders/item");
        });

        // Check if the data is rendered correctly
        const salesElement = await screen.findByText("Sales Over Time");
        expect(salesElement).toBeInTheDocument();

        // You can use similar checks for other elements
        const revenueElement = await screen.findByText(/300.00/i);
        expect(revenueElement).toBeInTheDocument();
    });

    it("should trigger download report on button click", async () => {
        mockedAxios.get.mockImplementation((url: string) => {
            switch (url) {
                case "/api/products/":
                    return Promise.resolve({
                        status: 200,
                        data: { products: mockProducts, msg: "Products have been fetched successfully" },
                    });
                case "/api/orders/":
                    return Promise.resolve({
                        status: 200,
                        data: { orders: mockOrders, msg: "Orders have been fetched successfully" },
                    });
                case "/api/users/":
                    return Promise.resolve({
                        status: 200,
                        data: { accounts: mockUsers },
                    });
                case "/api/orders/item":
                    return Promise.resolve({
                        status: 200,
                        data: { orderItems: mockOrderItems },
                    });
                default:
                    return Promise.reject(new Error("Unknown endpoint"));
            }
        });

        const mockCreateObjectURL = vi.fn();
        const mockRevokeObjectURL = vi.fn();
        global.URL.createObjectURL = mockCreateObjectURL;
        global.URL.revokeObjectURL = mockRevokeObjectURL;

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin"]}>
                    <AdminDashboard />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/products/");
        });

        expect(mockedAxios.get).toHaveBeenCalledWith("/api/orders/");
        expect(mockedAxios.get).toHaveBeenCalledWith("/api/users/");
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/orders/item");
        });
        const downloadButton = screen.getByText(/Download Report/i);
        fireEvent.click(downloadButton);

        // Assertions
        const blob = new Blob(["**Report**\n..."], { type: "text/plain" });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "report.txt";
        link.click();
        // Cleanup
        window.URL.revokeObjectURL(url);

        expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it("should render product list and filter by search term", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: { products: mockProducts, msg: "Products are fetched successfully" },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin/products"]}>
                    <AdminProductPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText("Electronics")).toBeInTheDocument();
        });
        expect(screen.getByText("Fashion")).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText("Search product"), { target: { value: "Electronics" } });

        await waitFor(() => {
            expect(screen.queryByText("Fashion")).toBeNull();
        });
        expect(screen.getByText("Electronics")).toBeInTheDocument();
    });

    it("should delete a product", async () => {
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: { products: mockProducts, msg: "Products are fetched successfully" },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin/products"]}>
                    <AdminProductPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText("Electronics")).toBeInTheDocument();
        });
        const deleteBtn = screen.getAllByTestId("deleteProductBtn")[0];
        expect(deleteBtn).toBeInTheDocument();
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(screen.getByText("Purchase Confirmation")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/products/delete", {
                pid: 1,
            });
        });
    });

    it("should navigate to AddProductPage when Add product button is clicked", async () => {
        const mockNavigate = vi.fn();
        (useNavigate as unknown as Mock).mockReturnValue(mockNavigate);
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin/products"]}>
                    <AdminProductPage />
                </MemoryRouter>
            </ToastProvider>
        );
        fireEvent.click(screen.getByRole("button", { name: /Add product/i }));
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/admin/add");
        });
    });

    it("should submit the product form", async () => {
        const mockProduct = {
            name: "Laptop",
            category: "Electronics",
            brand: "BrandA",
            description: "High performance laptop",
            price: 1000,
            quantity: 5,
        };
        mockedAxios.post.mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: { msg: "Product added successfully" },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin/add"]}>
                    <AdminAddProductPage />
                </MemoryRouter>
            </ToastProvider>
        );

        fireEvent.change(screen.getByLabelText(/Product name/i), { target: { value: mockProduct.name } });
        fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: mockProduct.category } });
        fireEvent.change(screen.getByLabelText(/Brand/i), { target: { value: mockProduct.brand } });
        fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: mockProduct.description } });
        fireEvent.change(screen.getByLabelText(/Product Price/i), { target: { value: mockProduct.price.toString() } });
        fireEvent.change(screen.getByLabelText(/Inventory Quantity/i), {
            target: { value: mockProduct.quantity.toString() },
        });

        // Simulate adding an image file (mocking File)
        const file = new File(["image content"], "image.jpg", { type: "image/jpeg" });
        const imageInput = screen.getByLabelText(/Image/i);
        fireEvent.change(imageInput, { target: { files: [file] } });

        // Simulate form submission
        const submitButton = screen.getByText("Submit");
        fireEvent.click(submitButton);

        // Wait for the axios post call to complete
        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith(
                "/api/products/add",
                expect.any(FormData), // Expect the formData to be passed
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                }
            );
        });

        // Ensure the navigation after submission happens (mock `navigate` in the component)
        await waitFor(() => {
            expect(screen.getByText("Product has been added successfully")).toBeInTheDocument();
        });
    });

    it("should change status of order", async () => {
        const mockOrders = [
            {
                id: 1,
                date_added: new Date("2024-09-15"),
                user_id: "12345",
                status: 0,
                total_price: 300,
                shipping_address: "HCM City, Vietnam",
            },
            {
                id: 2,
                date_added: new Date("2024-09-16"),
                user_id: "12345",
                status: 1,
                total_price: 400,
                shipping_address: "HCM City, Vietnam",
            },
        ];
        mockedAxios.get.mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: { orders: mockOrders, msg: "Orders have been fetch successfully" },
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin/orders"]}>
                    <AdminOrderPage />
                </MemoryRouter>
            </ToastProvider>
        );
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith("/api/orders");
        });
        await waitFor(() => {
            expect(screen.getAllByText("HCM City, Vietnam")[0]).toBeInTheDocument();
        });
        const doneBtn = screen.getAllByTestId("doneBtn")[0];
        fireEvent.click(doneBtn);
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/orders/status/1", { status: 1 });
        });
        await waitFor(() => {
            expect(screen.getByText("Done")).toBeInTheDocument();
        });
    });
});
