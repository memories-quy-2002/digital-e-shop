import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import featureImage from "../assets/images/news_1.jpg";
import heroImage from "../assets/images/news_2.jpg";
import Layout from "../components/layout/Layout";
import { HERO_IMAGE_WIDTHS, PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
import "../styles/pages/_news.scss";

type Article = {
    id: number;
    title: string;
    excerpt: string;
    date: string;
    author: string;
    tag: string;
    readTime: string;
};

const NewsPage: React.FC = () => {
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
        title: "Digital-E expands faster order tracking and personalized product discovery",
        excerpt:
            "The latest Digital-E update brings smarter recommendations, clearer order timelines, and better inventory signals so customers can shop with more confidence.",
        date: "2026-05-10",
        author: "Digital-E Product Team",
        readTime: "5 min read",
    };

    const articles: Article[] = [
        {
            id: 1,
            title: "How we pick laptops for creators, students, and hybrid teams",
            excerpt:
                "A look inside our selection process for performance, battery life, display quality, and long-term value.",
            date: "2026-05-06",
            author: "Product Desk",
            tag: "Buying guide",
            readTime: "6 min read",
        },
        {
            id: 2,
            title: "What changed in our checkout and payment experience",
            excerpt:
                "Cleaner payment choices, better stock validation, and clearer order confirmation for every purchase.",
            date: "2026-04-28",
            author: "Operations",
            tag: "Store update",
            readTime: "4 min read",
        },
        {
            id: 3,
            title: "Audio picks: when to choose ANC, open-back, or studio monitors",
            excerpt: "A practical guide to choosing audio gear based on work, travel, gaming, and content creation.",
            date: "2026-04-18",
            author: "Audio Lab",
            tag: "Guide",
            readTime: "7 min read",
        },
        {
            id: 4,
            title: "Inventory signals now help admins react before products sell out",
            excerpt: "Low-stock watchlists and analytics help the store keep popular products available for customers.",
            date: "2026-04-09",
            author: "Admin Team",
            tag: "Operations",
            readTime: "3 min read",
        },
    ];

    const briefs = [
        "New gaming monitors added",
        "More COD coverage",
        "Weekend laptop deals",
        "Warranty guide refreshed",
    ];

    return (
        <Layout>
            <Helmet>
                <title>News & Updates | Digital-E</title>
                <meta name="description" content="Product releases, buying guides, and store updates from Digital-E." />
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
                        <span className="info-page__hero-badge">Digital-E Newsroom</span>
                        <h1>Stay updated on launches, buying guidance, and store improvements that matter.</h1>
                        <p>
                            Follow product drops, practical buying advice, and the operational updates that keep
                            Digital-E running smoothly.
                        </p>
                        <div className="news__hero__actions info-page__actions">
                            <Link to="/shops">Browse new arrivals</Link>
                            <Link to="/support" className="ghost">
                                Visit support
                            </Link>
                        </div>
                    </div>
                    <div className="news__hero__ticker" aria-label="Latest quick updates">
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
                        <span className="news__featured__tag">Featured update</span>
                        <h2>{featured.title}</h2>
                        <p>{featured.excerpt}</p>
                        <div className="news__featured__meta">
                            <span>{featured.author}</span>
                            <span>{new Date(featured.date).toLocaleDateString("en-GB")}</span>
                            <span>{featured.readTime}</span>
                        </div>
                    </div>
                </section>

                <section className="news__list" aria-labelledby="news-list-heading">
                    <div className="news__section-heading info-page__section-heading">
                        <span>Latest articles</span>
                        <h2 id="news-list-heading">Helpful updates for smarter tech shopping</h2>
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
