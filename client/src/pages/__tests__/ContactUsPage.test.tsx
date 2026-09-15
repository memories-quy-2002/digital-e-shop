import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ContactUsPage from "../ContactUsPage";
import { LocaleProvider } from "../../context/LocaleContext";
import { createSupportTicket } from "../../features/support/api";

const navigate = vi.fn();
const useAuth = vi.fn();
const addToast = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

vi.mock("../../context/AuthContext", () => ({ useAuth: () => useAuth() }));

vi.mock("../../features/support/api", () => ({
    createSupportTicket: vi.fn(),
}));

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../context/ToastContext", () => ({
    useToast: () => ({ addToast }),
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ContactUsPage", () => {
    const renderPage = () =>
        render(
            <LocaleProvider>
                <MemoryRouter>
                    <ContactUsPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        useAuth.mockReturnValue({ userData: null, loading: false });
        vi.mocked(createSupportTicket).mockResolvedValue({} as never);
    });

    it("marks the submit action as the primary contact button", () => {
        renderPage();

        expect(screen.getByRole("button")).toHaveClass("contact__form__button--primary");
        expect(screen.getByRole("link", { name: "Check an order" })).toHaveClass("contact__hero__action--ghost");
    });

    it("stores a guest draft and redirects without calling the protected API", async () => {
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByLabelText("Full name"), "Guest Buyer");
        await user.type(screen.getByLabelText("Email address"), "guest@example.com");
        await user.type(screen.getByLabelText("How can we help?"), "I need help");
        await user.click(screen.getByRole("button", { name: "Send request" }));

        expect(createSupportTicket).not.toHaveBeenCalled();
        expect(sessionStorage.getItem("digital-e:contact-draft:v1")).toBe(
            JSON.stringify({ name: "Guest Buyer", email: "guest@example.com", message: "I need help" }),
        );
        expect(navigate).toHaveBeenCalledWith("/login?redirect=%2Fcontact-us");
        expect(addToast).toHaveBeenCalledWith(
            "Sign in to send your request",
            "Your message is saved for this session. Sign in to continue without starting over.",
        );
    });

    it("restores a valid draft and clears it after authenticated submission", async () => {
        const user = userEvent.setup();
        sessionStorage.setItem(
            "digital-e:contact-draft:v1",
            JSON.stringify({ name: "Saved Buyer", email: "saved@example.com", message: "Saved question" }),
        );
        useAuth.mockReturnValue({ userData: { id: 1 }, loading: false });
        renderPage();

        expect(screen.getByDisplayValue("Saved Buyer")).toBeInTheDocument();
        expect(screen.getByDisplayValue("saved@example.com")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Saved question")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Send request" }));

        await waitFor(() => expect(createSupportTicket).toHaveBeenCalledTimes(1));
        expect(sessionStorage.getItem("digital-e:contact-draft:v1")).toBeNull();
    });

    it("renders direct contact channels as actionable links", () => {
        renderPage();

        expect(screen.getByRole("link", { name: "contact@digital-e.com" })).toHaveAttribute(
            "href",
            "mailto:contact@digital-e.com",
        );
        expect(screen.getByRole("link", { name: "contact@digital-e.com" })).toHaveClass("contact__direct-link");
        expect(screen.getByRole("link", { name: "+84 123 456 789" })).toHaveAttribute(
            "href",
            "tel:+84123456789",
        );
        expect(screen.getByRole("link", { name: "+84 123 456 789" })).toHaveClass("contact__direct-link");
    });

    it("uses localized loading and error copy", async () => {
        useAuth.mockReturnValue({ userData: null, loading: true });
        renderPage();
        expect(screen.getByText("Preparing your contact form…")).toBeInTheDocument();

        useAuth.mockReturnValue({ userData: { id: 1 }, loading: false });
        vi.mocked(createSupportTicket).mockRejectedValueOnce(new Error("failed"));
        const user = userEvent.setup();
        renderPage();
        await user.type(screen.getByLabelText("Full name"), "Buyer");
        await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
        await user.type(screen.getByLabelText("How can we help?"), "Help");
        await user.click(screen.getByRole("button", { name: "Send request" }));

        await waitFor(() =>
            expect(addToast).toHaveBeenCalledWith(
                "We couldn't send your request",
                "Please try again, or use the email or phone options on this page.",
            ),
        );
    });
});
