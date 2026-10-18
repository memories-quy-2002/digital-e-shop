import React, { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewsArticlePage from "../NewsArticlePage";
import NewsPage from "../NewsPage";
import { formatNewsDate, getRelatedNewsArticles, NEWS_ARTICLES } from "../newsData";
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
            expect(formatNewsDate("2026-10-15", "en")).toBe("15/10/2026");
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
            expect(screen.getAllByRole("link", { name: "Read the guide" })[0]).toHaveAttribute(
                "href",
                "/news/galaxy-s26-ultra-time-best-inventions-2026",
            );
        } finally {
            NEWS_ARTICLES.splice(0, NEWS_ARTICLES.length, ...originalArticles);
        }
    });

    it("links the featured story and every article to its stable detail slug", () => {
        renderNews();

        expect(screen.getAllByRole("link", { name: "Read the guide" })).toHaveLength(10);
        const sourceLinks = screen.getAllByRole("link", { name: /^Source:/ });
        expect(sourceLinks).toHaveLength(10);
        expect(sourceLinks[0].closest(".news__featured__meta")).toBeNull();
        expect(sourceLinks[0].previousElementSibling).toHaveClass("news__featured__meta");
        expect(screen.getAllByRole("link", { name: "Read the guide" }).map((link) => link.getAttribute("href"))).toEqual([
            "/news/galaxy-s26-ultra-time-best-inventions-2026",
            "/news/galaxy-ai-language-support-vietnamese-bixby",
            "/news/samsung-health-sleep-coaching-update",
            "/news/lg-sound-suite-dtsx-update",
            "/news/apple-homepod-mini-2-announced",
            "/news/google-fitbit-edge-launch",
            "/news/windows-hybrid-intelligence-ai-pcs",
            "/news/samsung-smartthings-now-update",
            "/news/galaxy-tab-s12-now-available",
            "/news/apple-creator-studio-september-updates",
        ]);
    });

    it("keeps the news list in newest-first date order", () => {
        expect(NEWS_ARTICLES.map((article) => article.date)).toEqual(
            [...NEWS_ARTICLES.map((article) => article.date)].sort((left, right) => right.localeCompare(left)),
        );
    });

    it("formats dates with the active locale", async () => {
        renderNews("vi");

        await waitFor(() => {
            const dateOptions = { timeZone: "UTC" };
            expect(screen.getByText(new Intl.DateTimeFormat("vi-VN", dateOptions).format(new Date("2026-10-15T00:00:00Z")))).toBeVisible();
            expect(screen.getAllByText(new Intl.DateTimeFormat("vi-VN", dateOptions).format(new Date("2026-10-14T00:00:00Z")))).toHaveLength(3);
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
        renderArticle("galaxy-tab-s12-now-available");

        expect(
            screen.getByRole("heading", { name: "Galaxy Tab S12 series reaches availability" }),
        ).toBeVisible();
        expect(screen.getByRole("link", { name: "Source: Samsung Global Newsroom" })).toHaveAttribute(
            "href",
            "https://news.samsung.com/global/samsung-introduces-galaxy-tab-s12-series-the-ultimate-productivity-powerhouse-built-for-growth",
        );
        expect(screen.getByRole("link", { name: "Read article" })).toHaveAttribute("href", "#news-article-body");
        expect(screen.getByRole("button", { name: "Share article" })).toBeVisible();
        expect(screen.getByRole("link", { name: "Source: Samsung Global Newsroom" }).parentElement).toHaveClass("news-article__utility");
        const breadcrumb = screen.getByRole("navigation", { name: "Article breadcrumb" });
        expect(breadcrumb.parentElement).toHaveClass("news-article__content");
        expect(breadcrumb.querySelector("a")).toHaveAttribute("href", "/news");
        expect(screen.getAllByRole("link", { name: /Back to News/ })).toHaveLength(1);
    });

    it("shows three curated related stories after the current article", () => {
        const currentArticle = NEWS_ARTICLES.find((article) => article.slug === "galaxy-tab-s12-now-available");
        expect(currentArticle).toBeDefined();
        expect(getRelatedNewsArticles(currentArticle!)).toHaveLength(3);

        renderArticle("galaxy-tab-s12-now-available");

        expect(screen.getByRole("heading", { name: "Related stories" })).toBeVisible();
        expect(screen.getAllByRole("link", { name: "Read the guide" }).map((link) => link.getAttribute("href"))).toEqual([
            "/news/galaxy-s26-ultra-time-best-inventions-2026",
            "/news/windows-hybrid-intelligence-ai-pcs",
            "/news/apple-creator-studio-september-updates",
        ]);
    });

    it("copies the article URL when native sharing is unavailable", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        renderArticle("galaxy-tab-s12-now-available");

        fireEvent.click(screen.getByRole("button", { name: "Share article" }));

        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Article link copied."));
        expect(writeText).toHaveBeenCalledWith(window.location.href);
    });

    it("renders NotFoundPage for an unknown slug instead of the first article", () => {
        renderArticle("does-not-exist");

        expect(screen.getByRole("heading", { name: "Page not found" })).toBeVisible();
        expect(
            screen.queryByRole("heading", {
                name: "A clearer way to choose and buy technology",
            }),
        ).not.toBeInTheDocument();
    });

    it("resets the window scroll position when the article slug changes", async () => {
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

        const NavigateToArticle = () => {
            const navigate = useNavigate();

            useEffect(() => {
                navigate("/news/google-fitbit-edge-launch");
            }, [navigate]);

            return null;
        };

        render(
            <MemoryRouter initialEntries={["/news/galaxy-tab-s12-now-available"]}>
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

        await waitFor(() => expect(screen.getByRole("heading", { name: "Google introduces Fitbit Edge with up to seven days of battery life" })).toBeVisible());
        expect(scrollTo).toHaveBeenCalledWith(0, 0);

        scrollTo.mockRestore();
    });
});
