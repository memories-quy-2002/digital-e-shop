import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import featureImage from "../assets/images/news_1.jpg";
import Layout from "../components/layout/Layout";
import NotFoundPage from "./NotFoundPage";
import { useLocale } from "../context/LocaleContext";
import { useT } from "../hooks/useT";
import { findNewsArticle, formatNewsDate } from "./newsData";
import "../styles/pages/_news.scss";

const NewsArticlePage: React.FC = () => {
    const t = useT();
    const { locale } = useLocale();
    const { slug } = useParams();
    const article = findNewsArticle(slug);

    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, [slug]);

    if (!article) return <NotFoundPage />;

    const stories = t("news.stories") as unknown as Record<
        string,
        { tag: string; title: string; excerpt: string; author: string; body: string[] }
    >;
    const story = stories[article.key];

    return (
        <Layout>
            <Helmet>
                <title>{`${story.title} | Digital-E`}</title>
                <meta name="description" content={story.excerpt} />
            </Helmet>
            <main className="news news-article info-page">
                <div className="news-article__back">
                    <Link to="/news">← {t("news.backToNews")}</Link>
                </div>
                <article className="news-article__surface">
                    <img src={featureImage} alt="" aria-hidden="true" />
                    <div className="news-article__content">
                        <span className="news__featured__tag">{story.tag}</span>
                        <h1>{story.title}</h1>
                        <div className="news-article__meta">
                            <span>{story.author}</span>
                            <span>{formatNewsDate(article.date, locale)}</span>
                            <span>{t("news.readTimeMinutes", article.readMinutes)}</span>
                        </div>
                        <p className="news-article__excerpt">{story.excerpt}</p>
                        <div className="news-article__body">
                            {story.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                        </div>
                        <Link className="news-article__back-action" to="/news">
                            {t("news.backToNews")}
                        </Link>
                    </div>
                </article>
            </main>
        </Layout>
    );
};

export default NewsArticlePage;
