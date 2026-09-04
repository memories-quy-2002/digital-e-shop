import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import featureImage from "../assets/images/news_1.jpg";
import heroImage from "../assets/images/news_2.jpg";
import Layout from "../components/layout/Layout";
import { HERO_IMAGE_WIDTHS, PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
import { useT } from "../hooks/useT";
import "../styles/pages/_news.scss";

const NewsPage: React.FC = () => {
    const t = useT();
    const heroImageSource = getResponsiveImageSource(heroImage, {
        widths: HERO_IMAGE_WIDTHS,
        sizes: "100vw",
        fit: "fill",
    });
    const featureImageSource = getResponsiveImageSource(featureImage, {
        widths: PAGE_IMAGE_WIDTHS,
        sizes: "(min-width: 1024px) 42vw, 92vw",
        fit: "fill",
    });

    const featured = {
        title: t("news.featuredTitle"),
        excerpt: t("news.featuredExcerpt"),
        author: t("news.featuredAuthor"),
        readTime: t("news.readTimeMinutes", 5),
    };

    const articles = (
        t("news.articles") as unknown as Array<{
            tag: string;
            title: string;
            excerpt: string;
            author: string;
        }>
    ).map((article, index) => ({
        id: index + 1,
        title: article.title,
        excerpt: article.excerpt,
        date: ["2026-05-06", "2026-04-28", "2026-04-18", "2026-04-09"][index] ?? "2026-01-01",
        author: article.author,
        tag: article.tag,
        readTime: t("news.readTimeMinutes", index === 0 ? 6 : index === 1 ? 4 : index === 2 ? 7 : 3),
    }));

    const briefs = t("news.briefs") as unknown as string[];

    return (
        <Layout>
            <Helmet>
                <title>{`${t("news.title")} | Digital-E`}</title>
                <meta
                    name="description"
                    content="Product releases, buying guides, and store updates from Digital-E."
                />
            </Helmet>
            <main className="news info-page">
                <header className="news__hero">
                    <img
                        src={heroImageSource.src}
                        srcSet={heroImageSource.srcSet}
                        sizes={heroImageSource.sizes}
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                    />
                    <div className="news__hero__content">
                        <h1>{t("news.title")}</h1>
                        <p>{t("news.subtitle")}</p>
                        <div className="news__hero__actions info-page__actions">
                            <Link to="/shops">{t("news.browseNewArrivals")}</Link>
                            <Link to="/support" className="ghost">
                                {t("news.visitSupport")}
                            </Link>
                        </div>
                    </div>
                    <div className="news__hero__ticker" aria-label={t("news.tickerAria")}>
                        {briefs.map((brief) => (
                            <span key={brief}>{brief}</span>
                        ))}
                    </div>
                </header>

                <section className="news__featured">
                    <div className="news__featured__media">
                        <img
                            src={featureImageSource.src}
                            srcSet={featureImageSource.srcSet}
                            sizes={featureImageSource.sizes}
                            alt="Workspace with electronics and productivity gear"
                            loading="lazy"
                            decoding="async"
                        />
                    </div>
                    <div className="news__featured__content">
                        <span className="news__featured__tag">{t("news.featuredTag")}</span>
                        <h2>{featured.title}</h2>
                        <p>{featured.excerpt}</p>
                        <div className="news__featured__meta">
                            <span>{featured.author}</span>
                            <span>{new Date("2026-05-10").toLocaleDateString("en-GB")}</span>
                            <span>{featured.readTime}</span>
                        </div>
                    </div>
                </section>

                <section className="news__list" aria-labelledby="news-list-heading">
                    <div className="news__section-heading info-page__section-heading">
                        <span>{t("news.sectionEyebrow")}</span>
                        <h2 id="news-list-heading">{t("news.sectionTitle")}</h2>
                    </div>
                    <div className="news__list__grid">
                        {articles.map((article) => (
                            <article className="news__card" key={article.id}>
                                <div className="news__card__top">
                                    <span>{article.tag}</span>
                                    <small>{article.readTime}</small>
                                </div>
                                <h3>{article.title}</h3>
                                <p>{article.excerpt}</p>
                                <div className="news__card__meta">
                                    <span>{article.author}</span>
                                    <span>{new Date(article.date).toLocaleDateString("en-GB")}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default NewsPage;
