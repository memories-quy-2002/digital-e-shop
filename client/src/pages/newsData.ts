export type NewsStoryKey =
    | "featured"
    | "galaxyAi"
    | "samsungHealth"
    | "lgSound"
    | "homePod"
    | "fitbitEdge"
    | "windowsAi"
    | "galaxyTab"
    | "smartThings"
    | "creatorStudio";

export type NewsArticle = {
    key: NewsStoryKey;
    slug: string;
    date: string;
    readMinutes: number;
    sourceName: string;
    sourceUrl: string;
    featured?: boolean;
};

export const NEWS_ARTICLES: NewsArticle[] = [
    {
        key: "featured",
        slug: "galaxy-s26-ultra-time-best-inventions-2026",
        date: "2026-10-15",
        readMinutes: 4,
        sourceName: "Samsung Newsroom",
        sourceUrl: "https://news.samsung.com/us/samsung-galaxy-s26-ultra-earns-spot-times-best-inventions-2026/",
        featured: true,
    },
    {
        key: "galaxyAi",
        slug: "galaxy-ai-language-support-vietnamese-bixby",
        date: "2026-10-14",
        readMinutes: 4,
        sourceName: "Samsung Global Newsroom",
        sourceUrl: "https://news.samsung.com/global/samsung-expands-language-support-across-ai-experiences-on-galaxy",
    },
    {
        key: "samsungHealth",
        slug: "samsung-health-sleep-coaching-update",
        date: "2026-10-14",
        readMinutes: 4,
        sourceName: "Samsung Newsroom",
        sourceUrl: "https://news.samsung.com/uk/samsung-health-makes-sleep-coaching-easier-to-start-and-tailors-weekly-guidance",
    },
    {
        key: "lgSound",
        slug: "lg-sound-suite-dtsx-update",
        date: "2026-10-14",
        readMinutes: 4,
        sourceName: "LG Newsroom",
        sourceUrl: "https://www.lg.com/us/newsroom/media-entertainment/lg-advances-the-lg-sound-suite-experience-with-new-dts-x-support-greater-flexibility-and-expanded-home-theater-capabilities",
    },
    {
        key: "homePod",
        slug: "apple-homepod-mini-2-announced",
        date: "2026-10-13",
        readMinutes: 4,
        sourceName: "Apple Newsroom",
        sourceUrl: "https://www.apple.com/newsroom/2026/10/apple-announces-the-next-generation-of-homepod-mini/",
    },
    {
        key: "fitbitEdge",
        slug: "google-fitbit-edge-launch",
        date: "2026-10-12",
        readMinutes: 5,
        sourceName: "Google Blog",
        sourceUrl: "https://blog.google/products-and-platforms/devices/fitbit/google-fitbit-edge/",
    },
    {
        key: "windowsAi",
        slug: "windows-hybrid-intelligence-ai-pcs",
        date: "2026-10-07",
        readMinutes: 4,
        sourceName: "Microsoft News",
        sourceUrl: "https://news.microsoft.com/source/emea/2026/10/building-windows-for-hybrid-intelligence/",
    },
    {
        key: "smartThings",
        slug: "samsung-smartthings-now-update",
        date: "2026-10-05",
        readMinutes: 4,
        sourceName: "Samsung Newsroom",
        sourceUrl: "https://news.samsung.com/us/samsung-introduces-smartthings-now-platform-update-brings-intuitive-user-experiences/",
    },
    {
        key: "galaxyTab",
        slug: "galaxy-tab-s12-now-available",
        date: "2026-09-30",
        readMinutes: 4,
        sourceName: "Samsung Global Newsroom",
        sourceUrl: "https://news.samsung.com/global/samsung-introduces-galaxy-tab-s12-series-the-ultimate-productivity-powerhouse-built-for-growth",
    },
    {
        key: "creatorStudio",
        slug: "apple-creator-studio-september-updates",
        date: "2026-09-29",
        readMinutes: 4,
        sourceName: "Apple Newsroom",
        sourceUrl: "https://www.apple.com/newsroom/2026/09/new-updates-coming-to-apple-creator-studio/",
    },
];

const RELATED_NEWS_KEYS: Record<NewsStoryKey, NewsStoryKey[]> = {
    featured: ["galaxyAi", "galaxyTab", "windowsAi"],
    galaxyAi: ["featured", "windowsAi", "smartThings"],
    samsungHealth: ["fitbitEdge", "galaxyAi", "smartThings"],
    lgSound: ["homePod", "smartThings", "creatorStudio"],
    homePod: ["smartThings", "lgSound", "galaxyAi"],
    fitbitEdge: ["samsungHealth", "galaxyAi", "featured"],
    windowsAi: ["galaxyAi", "galaxyTab", "creatorStudio"],
    galaxyTab: ["featured", "windowsAi", "creatorStudio"],
    smartThings: ["homePod", "lgSound", "samsungHealth"],
    creatorStudio: ["galaxyTab", "windowsAi", "galaxyAi"],
};

export const getRelatedNewsArticles = (article: NewsArticle, limit = 3) => {
    const articlesByKey = new Map(NEWS_ARTICLES.map((item) => [item.key, item]));

    return RELATED_NEWS_KEYS[article.key]
        .map((key) => articlesByKey.get(key))
        .filter((item): item is NewsArticle => item !== undefined && item.slug !== article.slug)
        .slice(0, limit);
};

export const findNewsArticle = (slug: string | undefined) =>
    NEWS_ARTICLES.find((article) => article.slug === slug);

export const formatNewsDate = (date: string, locale: "en" | "vi") =>
    new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { timeZone: "UTC" }).format(
        new Date(`${date}T00:00:00Z`),
    );
