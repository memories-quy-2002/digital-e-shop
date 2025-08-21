import React, { useState } from "react";
import "../../styles/SupportPage.scss"; // Assuming you have a CSS file for styling
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";
import { Nav } from "react-bootstrap";
import NavigationBar from "../common/NavigationBar";

const SupportPage: React.FC = () => {
    const [faqOpen, setFaqOpen] = useState<number | null>(null);

    const faqs = [
        {
            q: "How can I track my order?",
            a: "You can track your order by logging into your Digital-E account and checking the 'Orders' section.",
        },
        {
            q: "What is your return policy?",
            a: "We accept returns within 30 days of delivery. Items must be unused and in original packaging.",
        },
        {
            q: "How can I contact support?",
            a: "You can email us at support@digital-e.com or use the live chat on our website.",
        },
    ];

    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>Support</title>
                <meta name="description" content="Get help and support for your Digital-E orders and products." />
            </Helmet>
            <div className="support">
                <h2 className="support__title">Support Center</h2>
                <p className="support__intro">Find answers to common questions or contact our support team for help.</p>

                <div className="support__faq">
                    <h3>Frequently Asked Questions</h3>
                    {faqs.map((item, idx) => (
                        <div
                            key={idx}
                            className={`support__faq__item ${faqOpen === idx ? "active" : ""}`}
                            onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                        >
                            <div className="support__faq__item__q">{item.q}</div>
                            {faqOpen === idx && <div className="support__faq__item__a">{item.a}</div>}
                        </div>
                    ))}
                </div>

                <div className="support__contact">
                    <h3>Need more help?</h3>
                    <p>Email: support@digital-e.com</p>
                    <p>Hotline: +84 123 456 789</p>
                    <button className="support__contact__btn">Contact Us</button>
                </div>
            </div>
        </Layout>
    );
};

export default SupportPage;
