import React, { useState } from "react";
import "../../styles/SupportPage.scss";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

const SupportPage: React.FC = () => {
    const [faqOpen, setFaqOpen] = useState<number | null>(0);

    const faqs = [
        {
            q: "How can I track my order?",
            a: "Go to your account dashboard and open Orders. Each order includes a live tracking link.",
        },
        {
            q: "What is your return policy?",
            a: "Returns are accepted within 30 days of delivery, unused and in original packaging.",
        },
        {
            q: "How long does delivery take?",
            a: "Standard delivery takes 2-4 business days, express delivery takes 24-48 hours.",
        },
        {
            q: "How can I contact support?",
            a: "Email support@digital-e.com or call the hotline for urgent cases.",
        },
    ];

    return (
        <Layout>
            <Helmet>
                <title>Support | Digital-E</title>
                <meta name="description" content="Get help and support for your Digital-E orders and products." />
            </Helmet>
            <div className="support">
                <header className="support__hero">
                    <span className="support__hero__badge">Support Center</span>
                    <h1>We are here to help every step of the way</h1>
                    <p>Find answers, troubleshoot, or contact our team for fast assistance.</p>
                </header>

                <section className="support__channels">
                    <div className="support__channels__card">
                        <h3>Live Chat</h3>
                        <p>Instant answers for product questions, orders, and returns.</p>
                        <span>Average response: 3 minutes</span>
                        <button type="button">Start chat</button>
                    </div>
                    <div className="support__channels__card">
                        <h3>Email Support</h3>
                        <p>Get detailed help within 24 hours from our specialists.</p>
                        <span>support@digital-e.com</span>
                        <button type="button">Send an email</button>
                    </div>
                    <div className="support__channels__card">
                        <h3>Hotline</h3>
                        <p>Speak directly with a support agent for urgent requests.</p>
                        <span>+84 123 456 789</span>
                        <button type="button">Call now</button>
                    </div>
                </section>

                <section className="support__resources">
                    <div className="support__resources__intro">
                        <h2>Popular resources</h2>
                        <p>Start here for self-service answers and how-to guides.</p>
                    </div>
                    <div className="support__resources__grid">
                        <div className="support__resources__card">
                            <h4>Order tracking</h4>
                            <p>Track shipments, update addresses, and manage delivery preferences.</p>
                        </div>
                        <div className="support__resources__card">
                            <h4>Returns & exchanges</h4>
                            <p>Start a return, print a label, and view refund timelines.</p>
                        </div>
                        <div className="support__resources__card">
                            <h4>Warranty & repairs</h4>
                            <p>Check coverage, claim warranties, and book repair services.</p>
                        </div>
                        <div className="support__resources__card">
                            <h4>Account security</h4>
                            <p>Reset passwords, enable 2FA, and protect your account.</p>
                        </div>
                    </div>
                </section>

                <section className="support__faq">
                    <div className="support__faq__header">
                        <h2>Frequently Asked Questions</h2>
                        <p>Quick answers to the questions we get most often.</p>
                    </div>
                    <div className="support__faq__list">
                        {faqs.map((item, idx) => (
                            <button
                                key={idx}
                                type="button"
                                className={`support__faq__item ${faqOpen === idx ? "active" : ""}`}
                                onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                            >
                                <div className="support__faq__item__q">{item.q}</div>
                                {faqOpen === idx && <div className="support__faq__item__a">{item.a}</div>}
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </Layout>
    );
};

export default SupportPage;
