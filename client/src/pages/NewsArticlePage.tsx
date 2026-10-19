import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import featureImage from "../assets/images/news_1.jpg";
import Layout from "../components/layout/Layout";
import NotFoundPage from "./NotFoundPage";
import { useLocale } from "../context/LocaleContext";
import { useT } from "../hooks/useT";
import { findNewsArticle, formatNewsDate, getRelatedNewsArticles } from "./newsData";
import "../styles/pages/_news.scss";

const NewsArticlePage: React.FC = () => {
    const t = useT();
    const { locale } = useLocale();
    const { slug } = useParams();
    const article = findNewsArticle(slug);
    const [shareStatus, setShareStatus] = React.useState<"idle" | "copied" | "unavailable">("idle");

    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, [slug]);

    if (!article) return <NotFoundPage />;

    const stories = t("news.stories") as unknown as Record<
        string,
        { tag: string; title: string; excerpt: string; author: string; body: string[] }
    >;
    const story = stories[article.key];
    const relatedArticles = getRelatedNewsArticles(article).map((relatedArticle) => ({
        article: relatedArticle,
        story: stories[relatedArticle.key],
    }));

    const shareArticle = async () => {
        const url = window.location.href;

        try {
            if (navigator.share) {
                await navigator.share({ title: story.title, text: story.excerpt, url });
                setShareStatus("idle");
                return;
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
        }

        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
            await navigator.clipboard.writeText(url);
            setShareStatus("copied");
        } catch {
            setShareStatus("unavailable");
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>{`${story.title} | Digital-E`}</title>
                <meta name="description" content={story.excerpt} />
            </Helmet>
            <main className="news news-article info-page">
                <article className="news-article__surface">
                    <img src={featureImage} alt="" aria-hidden="true" />
                    <div className="news-article__content">
                        <nav className="news-article__breadcrumb" aria-label={t("news.breadcrumbLabel")}>
                            <Link to="/news">{t("news.title")}</Link>
                            <span aria-hidden="true">/</span>
                            <span aria-current="page">{story.tag}</span>
                        </nav>
                        <span className="news__featured__tag">{story.tag}</span>
                        <h1>{story.title}</h1>
                        <div className="news-article__meta">
                            <span>{story.author}</span>
                            <span>{formatNewsDate(article.date, locale)}</span>
                            <span>{t("news.readTimeMinutes", article.readMinutes)}</span>
                        </div>
                        <div className="news-article__utility">
                            <a className="news__source-link" href={article.sourceUrl} target="_blank" rel="noreferrer">
                                {t("news.originalSource")}: {article.sourceName}
                            </a>
                            <div className="news-article__actions">
                                <a className="news-article__read-action" href="#news-article-body">
                                    {t("news.jumpToArticle")}
                                </a>
                                <button className="news-article__share-action" type="button" onClick={shareArticle}>
                                    {t("news.shareArticle")}
                                </button>
                            </div>
                        </div>
                        <p className="news-article__share-status" role="status" aria-live="polite">
                            {shareStatus === "copied" ? t("news.shareCopied") : shareStatus === "unavailable" ? t("news.shareUnavailable") : ""}
                        </p>
                        <p className="news-article__excerpt">{story.excerpt}</p>
                        <div className="news-article__body" id="news-article-body">
                            {story.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                        </div>
                        <Link className="news-article__back-action" to="/news">
                            {t("news.backToNews")}
                        </Link>
                    </div>
                </article>
                <section className="news-article__related" aria-labelledby="related-news-heading">
                    <div className="news__section-heading info-page__section-heading">
                        <span>{t("news.relatedEyebrow")}</span>
                        <h2 id="related-news-heading">{t("news.relatedTitle")}</h2>
                    </div>
                    <div className="news__list__grid">
                        {relatedArticles.map(({ article: relatedArticle, story: relatedStory }) => (
                            <article className="news__card" key={relatedArticle.slug}>
                                <div className="news__card__top">
                                    <span>{relatedStory.tag}</span>
                                    <small>{t("news.readTimeMinutes", relatedArticle.readMinutes)}</small>
                                </div>
                                <h3>{relatedStory.title}</h3>
                                <p>{relatedStory.excerpt}</p>
                                <div className="news__card__meta">
                                    <span>{relatedStory.author}</span>
                                    <span>{formatNewsDate(relatedArticle.date, locale)}</span>
                                </div>
                                <Link className="news__card__link" to={`/news/${relatedArticle.slug}`}>
                                    {t("news.readArticle")}
                                </Link>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default NewsArticlePage;
