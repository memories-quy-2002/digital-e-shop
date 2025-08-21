import React, { useEffect, useState } from "react";
import "../../styles/NewsPage.scss"; // Assuming you have a CSS file for styling
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

type Article = {
    id: number;
    title: string;
    content: string;
    date: string;
    author: string;
};

const NewsPage: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);

    useEffect(() => {
        // Giả lập fetch API (sau bạn kết nối backend)
        setArticles([
            {
                id: 1,
                title: "Digital-E launches new AI-powered search!",
                content:
                    "We are excited to announce the rollout of our advanced AI search system to enhance your shopping experience...",
                date: "2025-08-10",
                author: "Digital-E Team",
            },
            {
                id: 2,
                title: "Summer Sale is Live 🔥",
                content: "Get up to 50% off on electronics, home appliances, and more. Limited time only!",
                date: "2025-08-01",
                author: "Marketing Dept",
            },
        ]);
    }, []);

    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>News</title>
                <meta name="description" content="Latest news and updates from Digital-E." />
            </Helmet>
            <div className="news">
                <h2 className="news__title">Latest News</h2>
                <div className="news__list">
                    {articles.map((article) => (
                        <div className="news__list__item" key={article.id}>
                            <div className="news__list__item__content">
                                <h3>{article.title}</h3>
                                <p className="news__list__item__meta">
                                    By {article.author} | {new Date(article.date).toLocaleDateString("en-GB")}
                                </p>
                                <p className="news__list__item__desc">{article.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Layout>
    );
};

export default NewsPage;
