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
});
