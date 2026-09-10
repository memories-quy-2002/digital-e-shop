import React, { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewsArticlePage from "../NewsArticlePage";
import NewsPage from "../NewsPage";
import { formatNewsDate, NEWS_ARTICLES } from "../newsData";
import { LocaleProvider, useLocale } from "../../context/LocaleContext";
import type { Locale } from "../../i18n";

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const LocaleSetter = ({ locale }: { locale: Locale }) => {
    const { setLocale } = useLocale();

    useEffect(() => setLocale(locale), [locale, setLocale]);
    return null;
};

const renderNews = (locale?: Locale) =>
    render(
        <MemoryRouter>
            <LocaleProvider>
                {locale ? <LocaleSetter locale={locale} /> : null}
                <NewsPage />
            </LocaleProvider>
        </MemoryRouter>,
    );

describe("NewsPage", () => {
    beforeEach(() => localStorage.clear());

    it("uses the source date for date-only values in a west-of-UTC timezone", () => {
        const previousTimezone = process.env.TZ;
        process.env.TZ = "America/Los_Angeles";

        try {
            expect(formatNewsDate("2026-05-10", "en")).toBe("10/05/2026");
        } finally {
            if (previousTimezone === undefined) delete process.env.TZ;
            else process.env.TZ = previousTimezone;
        }
    });

    it("uses the only featured article even when it is not first in the map", () => {
        const originalArticles = [...NEWS_ARTICLES];
        const featuredArticle = NEWS_ARTICLES.find((article) => article.featured);
        expect(featuredArticle).toBeDefined();
        NEWS_ARTICLES.splice(
            0,
            NEWS_ARTICLES.length,
            ...NEWS_ARTICLES.filter((article) => !article.featured),
            featuredArticle!,
        );

        try {
            renderNews();
            expect(screen.getAllByRole("link", { name: "Read article" })[0]).toHaveAttribute(
                "href",
                "/news/faster-order-tracking",
            );
        } finally {
            NEWS_ARTICLES.splice(0, NEWS_ARTICLES.length, ...originalArticles);
        }
    });

    it("links the featured story and every article to its stable detail slug", () => {
        renderNews();

        expect(screen.getAllByRole("link", { name: "Read article" })).toHaveLength(5);
        expect(screen.getAllByRole("link", { name: "Read article" }).map((link) => link.getAttribute("href"))).toEqual([
            "/news/faster-order-tracking",
            "/news/laptops-for-creators-students-and-hybrid-teams",
            "/news/checkout-and-payment-experience",
            "/news/choosing-the-right-audio-setup",
            "/news/inventory-signals-before-stockouts",
        ]);
    });

    it("formats dates with the active locale", async () => {
        renderNews("vi");

        await waitFor(() => {
            const dateOptions = { timeZone: "UTC" };
            expect(screen.getByText(new Intl.DateTimeFormat("vi-VN", dateOptions).format(new Date("2026-05-10T00:00:00Z")))).toBeVisible();
            expect(screen.getByText(new Intl.DateTimeFormat("vi-VN", dateOptions).format(new Date("2026-05-06T00:00:00Z")))).toBeVisible();
        });
    });
});

describe("NewsArticlePage", () => {
    beforeEach(() => localStorage.clear());

    const renderArticle = (slug: string) =>
        render(
            <MemoryRouter initialEntries={[`/news/${slug}`]}>
                <LocaleProvider>
                    <Routes>
                        <Route path="/news/:slug" element={<NewsArticlePage />} />
                    </Routes>
                </LocaleProvider>
            </MemoryRouter>,
        );

    it("renders the requested article and a back-to-news action", () => {
        renderArticle("checkout-and-payment-experience");

        expect(
            screen.getByRole("heading", { name: "What changed in our checkout and payment experience" }),
        ).toBeVisible();
        expect(screen.getByRole("link", { name: "Back to news" })).toHaveAttribute("href", "/news");
    });

    it("renders NotFoundPage for an unknown slug instead of the first article", () => {
        renderArticle("does-not-exist");

        expect(screen.getByRole("heading", { name: "Page not found" })).toBeVisible();
        expect(
            screen.queryByRole("heading", {
                name: "Digital-E expands faster order tracking and personalized product discovery",
            }),
        ).not.toBeInTheDocument();
    });

    it("resets the window scroll position when the article slug changes", async () => {
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

        const NavigateToArticle = () => {
            const navigate = useNavigate();

            useEffect(() => {
                navigate("/news/choosing-the-right-audio-setup");
            }, [navigate]);

            return null;
        };

        render(
            <MemoryRouter initialEntries={["/news/checkout-and-payment-experience"]}>
                <LocaleProvider>
                    <Routes>
                        <Route
                            path="/news/:slug"
                            element={
                                <>
                                    <NavigateToArticle />
                                    <NewsArticlePage />
                                </>
                            }
                        />
                    </Routes>
                </LocaleProvider>
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByRole("heading", { name: "Audio picks: when to choose ANC, open-back, or studio monitors" })).toBeVisible());
        expect(scrollTo).toHaveBeenCalledWith(0, 0);

        scrollTo.mockRestore();
    });
});
