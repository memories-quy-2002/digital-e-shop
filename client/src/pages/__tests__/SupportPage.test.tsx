import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import SupportPage from "../SupportPage";
import { LocaleProvider } from "../../context/LocaleContext";

const titleMode = vi.hoisted(() => ({ useEnglishTitle: false }));

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../hooks/useT", async () => {
    const { dictionaries } = await import("../../i18n");
    const translations: Record<string, string> = {
        "support.metaDescription": "Translated support description",
        "support.heroSubtitle": "Translated support subtitle",
        "support.viewOrderHistory": "Translated order history",
        "support.contactUs": "Translated contact us",
        "support.contactLabel": "Translated contact",
        "support.contactHeading": "Translated contact heading",
        "support.contactFormTitle": "Translated contact form",
        "support.contactFormText": "Translated contact form text",
        "support.contactFormDetail": "Translated response detail",
        "support.contactFormAction": "Translated contact form action",
        "support.emailTitle": "Translated email title",
        "support.emailText": "Translated email text",
        "support.emailDetail": "support@digital-e.com",
        "support.emailAction": "Translated email action",
        "support.hotlineTitle": "Translated hotline title",
        "support.hotlineText": "Translated hotline text",
        "support.hotlineDetail": "+84 123 456 789",
        "support.hotlineAction": "Translated hotline action",
        "support.selfServiceLabel": "Translated self service",
        "support.resourcesHeading": "Translated resources heading",
        "support.trackOrderTitle": "Translated track order",
        "support.trackOrderText": "Translated track order text",
        "support.trackOrderAction": "Translated track order action",
        "support.returnsTitle": "Translated returns title",
        "support.returnsText": "Translated returns text",
        "support.returnsAction": "Translated returns action",
        "support.warrantyTitle": "Translated warranty title",
        "support.warrantyText": "Translated warranty text",
        "support.warrantyAction": "Translated warranty action",
        "support.paymentTitle": "Translated payment title",
        "support.paymentText": "Translated payment text",
        "support.paymentAction": "Translated payment action",
        "support.faqLabel": "Translated FAQ",
        "support.faqHeading": "Translated FAQ heading",
        "support.faq1Question": "Translated FAQ question",
        "support.faq1Answer": "Translated FAQ answer",
        "support.faq2Question": "Translated second question",
        "support.faq2Answer": "Translated second answer",
        "support.faq3Question": "Translated third question",
        "support.faq3Answer": "Translated third answer",
        "support.faq4Question": "Translated fourth question",
        "support.faq4Answer": "Translated fourth answer",
    };

    return {
        useT: () => (key: string) =>
            key === "support.title"
                ? titleMode.useEnglishTitle
                    ? dictionaries.en.support.title
                    : "Translated support title"
                : translations[key] || key,
    };
});

const renderSupport = () =>
    render(
        <LocaleProvider>
            <HelmetProvider>
                <MemoryRouter>
                    <SupportPage />
                </MemoryRouter>
            </HelmetProvider>
        </LocaleProvider>,
    );

describe("SupportPage", () => {
    it("sets the English document title with the site suffix", async () => {
        titleMode.useEnglishTitle = true;
        try {
            renderSupport();

            await waitFor(() => expect(document.title).toBe("Support Center | Digital-E"));
        } finally {
            titleMode.useEnglishTitle = false;
        }
    });

    it("renders user-facing copy through the support dictionary", () => {
        renderSupport();

        expect(screen.getByRole("heading", { name: "Translated support title" })).toBeVisible();
        expect(screen.getByText("Translated contact form")).toBeVisible();
        expect(screen.getByRole("heading", { name: "Translated resources heading" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Translated FAQ heading" })).toBeVisible();
        expect(screen.getByText("Translated FAQ question")).toBeVisible();
    });

    it("uses truthful contact actions and actionable resource links", () => {
        renderSupport();

        expect(screen.getByRole("link", { name: "Translated contact form action" })).toHaveAttribute(
            "href",
            "/contact-us",
        );
        expect(screen.getByRole("link", { name: "Translated email action" })).toHaveAttribute(
            "href",
            "mailto:support@digital-e.com",
        );
        expect(screen.getByRole("link", { name: "Translated hotline action" })).toHaveAttribute(
            "href",
            "tel:+84123456789",
        );
        expect(screen.getByRole("link", { name: "Translated track order action" })).toHaveAttribute(
            "href",
            "/orders",
        );
        expect(screen.getByRole("link", { name: "Translated returns action" })).toHaveAttribute(
            "href",
            "/contact-us",
        );
    });

    it("keeps the FAQ answer outside the control with stable ARIA relationships", async () => {
        const user = userEvent.setup();
        renderSupport();

        const firstQuestion = screen.getByRole("button", { name: /Translated FAQ question/ });
        expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
        expect(firstQuestion).toHaveAttribute("aria-controls", "support-faq-answer-0");
        expect(screen.getByRole("region", { name: "Translated FAQ question" })).toHaveAttribute(
            "id",
            "support-faq-answer-0",
        );

        const secondQuestion = screen.getByRole("button", { name: /Translated second question/ });
        await user.click(secondQuestion);

        expect(secondQuestion).toHaveAttribute("aria-expanded", "true");
        expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("Translated FAQ answer")).not.toBeInTheDocument();
        expect(screen.getByText("Translated second answer")).toBeVisible();
    });
});
