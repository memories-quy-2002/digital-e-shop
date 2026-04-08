import React from "react";
import "../../styles/NewsPage.scss";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

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
    const featured = {
        title: "Digital-E launches a personalized tech advisor",
        excerpt:
            "Meet our new AI-powered advisor that recommends devices based on your budget, workflow, and ecosystem - launching to all customers this month.",
        date: "2026-03-20",
        author: "Digital-E Team",
    };

    const articles: Article[] = [
        {
            id: 1,
            title: "Spring refresh: laptops built for creators",
            excerpt: "Top picks for editing, streaming, and design work - balanced for power and portability.",
            date: "2026-03-10",
            author: "Product Desk",
            tag: "Product",
            readTime: "4 min read",
        },
        {
            id: 2,
            title: "Audio week: flagship headphones under $200",
            excerpt: "We tested 12 models and picked the ones that sound premium without the premium price.",
            date: "2026-02-25",
            author: "Audio Lab",
            tag: "Guides",
            readTime: "6 min read",
        },
        {
            id: 3,
            title: "Smart home essentials for first-time buyers",
            excerpt: "Set up a secure, automated home in one weekend - no wiring required.",
            date: "2026-02-12",
            author: "Home Tech",
            tag: "Insights",
            readTime: "5 min read",
        },
    ];

    return (
        <Layout>
            <Helmet>
                <title>News & Updates | Digital-E</title>
                <meta name="description" content="Product releases, sales, and updates from Digital-E." />
            </Helmet>
            <div className="news">
                <header className="news__hero">
                    <span className="news__hero__badge">Digital-E Newsroom</span>
                    <h1>Product updates, launches, and buying guides</h1>
                    <p>
                        Stay ahead with launches, product insights, and curated buying advice from our specialists.
                    </p>
                </header>

                <section className="news__featured">
                    <div className="news__featured__content">
                        <span className="news__featured__tag">Featured</span>
                        <h2>{featured.title}</h2>
                        <p>{featured.excerpt}</p>
                        <div className="news__featured__meta">
                            <span>{featured.author}</span>
                            <span>|</span>
                            <span>{new Date(featured.date).toLocaleDateString("en-GB")}</span>
                        </div>
                        <button type="button">Read story</button>
                    </div>
                    <div className="news__featured__panel">
                        <div>
                            <strong>Weekly highlights</strong>
                            <p>Every Friday, get the best deals and the smartest picks in your inbox.</p>
                            <button type="button">Subscribe</button>
                        </div>
                        <div className="news__featured__panel__stats">
                            <div>
                                <strong>30+</strong>
                                <span>Guides published</span>
                            </div>
                            <div>
                                <strong>12</strong>
                                <span>Product labs</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="news__list">
                    {articles.map((article) => (
                        <article className="news__card" key={article.id}>
                            <div className="news__card__tag">{article.tag}</div>
                            <h3>{article.title}</h3>
                            <p>{article.excerpt}</p>
                            <div className="news__card__meta">
                                <span>{article.author}</span>
                                <span>|</span>
                                <span>{new Date(article.date).toLocaleDateString("en-GB")}</span>
                                <span>|</span>
                                <span>{article.readTime}</span>
                            </div>
                            <button type="button">Read more</button>
                        </article>
                    ))}
                </section>
            </div>
        </Layout>
    );
};

export default NewsPage;
