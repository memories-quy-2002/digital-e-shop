import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import AddressBookPage from "./AddressBookPage";

const mocks = vi.hoisted(() => ({
    auth: { userData: { id: "customer-1" } },
    toast: { addToast: vi.fn() },
    addresses: {
        fetchCustomerAddresses: vi.fn(),
        createCustomerAddress: vi.fn(),
        updateCustomerAddress: vi.fn(),
        deleteCustomerAddress: vi.fn(),
    },
    shipping: { fetchDeliveryMapConfig: vi.fn() },
}));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: mocks.auth.userData }),
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => mocks.toast,
}));

vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/CustomerAccountShell", () => ({
    default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("../api", () => ({
    fetchCustomerAddresses: mocks.addresses.fetchCustomerAddresses,
    createCustomerAddress: mocks.addresses.createCustomerAddress,
    updateCustomerAddress: mocks.addresses.updateCustomerAddress,
    deleteCustomerAddress: mocks.addresses.deleteCustomerAddress,
}));

vi.mock("../../shipping/api", () => ({
    fetchDeliveryMapConfig: mocks.shipping.fetchDeliveryMapConfig,
}));

vi.mock("../../shipping/components/DeliveryMapPicker", () => ({
    default: ({ onDestinationChange }: { onDestinationChange: (point: { latitude: number; longitude: number }) => void }) => (
        <button type="button" onClick={() => onDestinationChange({ latitude: 10.7769, longitude: 106.7009 })}>Select pin</button>
    ),
}));

vi.mock("../../../components/common/Icons", () => ({
    HouseIcon: () => <span aria-hidden="true" />,
}));

vi.mock("../../../components/common/EmptyState", () => ({
    default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../../components/common/ConfirmActionModal", () => ({
    default: () => null,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: () => null,
}));

const renderPage = () =>
    render(
        <MemoryRouter>
            <LocaleProvider>
                <AddressBookPage />
            </LocaleProvider>
        </MemoryRouter>,
    );

describe("AddressBookPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.removeItem("digital-e:locale:v1");
        mocks.addresses.fetchCustomerAddresses.mockResolvedValue([]);
        mocks.addresses.createCustomerAddress.mockResolvedValue({ id: 1 });
        mocks.addresses.updateCustomerAddress.mockResolvedValue({ id: 1 });
        mocks.addresses.deleteCustomerAddress.mockResolvedValue(undefined);
        mocks.shipping.fetchDeliveryMapConfig.mockResolvedValue({
            origin: { latitude: 10.78, longitude: 106.7 },
            storeAddress: "Digital-E Store",
            tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
            tileAttribution: "Map contributors",
        });
    });

    it("announces the required address field error and links it to the input", async () => {
        renderPage();
        const addressInput = await screen.findByLabelText("Address");

        fireEvent.click(screen.getByRole("button", { name: "Add address" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Address line is required.");
        expect(addressInput).toHaveAttribute("aria-invalid", "true");
        expect(addressInput).toHaveAttribute("aria-describedby", "address-line-error");
        expect(mocks.addresses.createCustomerAddress).not.toHaveBeenCalled();
    });

    it("submits the address form through the form submit event", async () => {
        renderPage();
        const addressInput = await screen.findByLabelText("Address");
        fireEvent.change(addressInput, { target: { value: "123 Main Street" } });
        fireEvent.submit(addressInput.closest("form")!);

        await waitFor(() => expect(mocks.addresses.createCustomerAddress).toHaveBeenCalledWith(
            "customer-1",
            expect.objectContaining({ addressLine: "123 Main Street" }),
        ));
    });

    it("saves manually selected map coordinates with an address", async () => {
        renderPage();
        fireEvent.change(await screen.findByLabelText("Address"), { target: { value: "12 Main Street" } });
        fireEvent.change(await screen.findByLabelText("City"), { target: { value: "Ho Chi Minh City" } });
        fireEvent.click(await screen.findByRole("button", { name: "Select pin" }));
        fireEvent.submit(screen.getByLabelText("Address").closest("form")!);

        await waitFor(() => expect(mocks.addresses.createCustomerAddress).toHaveBeenCalledWith("customer-1", expect.objectContaining({
            city: "Ho Chi Minh City",
            latitude: 10.7769,
            longitude: 106.7009,
        })));
    });
});
