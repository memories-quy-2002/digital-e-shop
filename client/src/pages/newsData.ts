export type NewsStoryKey = "featured" | "laptops" | "checkout" | "audio" | "inventory";

export type NewsArticle = {
    key: NewsStoryKey;
    slug: string;
    date: string;
    readMinutes: number;
    featured?: boolean;
};

export const NEWS_ARTICLES: NewsArticle[] = [
    { key: "featured", slug: "faster-order-tracking", date: "2026-05-10", readMinutes: 5, featured: true },
    { key: "laptops", slug: "laptops-for-creators-students-and-hybrid-teams", date: "2026-05-06", readMinutes: 6 },
    { key: "checkout", slug: "checkout-and-payment-experience", date: "2026-04-28", readMinutes: 4 },
    { key: "audio", slug: "choosing-the-right-audio-setup", date: "2026-04-18", readMinutes: 7 },
    { key: "inventory", slug: "inventory-signals-before-stockouts", date: "2026-04-09", readMinutes: 3 },
];

export const findNewsArticle = (slug: string | undefined) =>
    NEWS_ARTICLES.find((article) => article.slug === slug);

export const formatNewsDate = (date: string, locale: "en" | "vi") =>
    new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { timeZone: "UTC" }).format(
        new Date(`${date}T00:00:00Z`),
    );
