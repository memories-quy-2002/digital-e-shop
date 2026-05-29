import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import supportImage from "../assets/images/support.jpg";
import Layout from "../components/layout/Layout";
import { HERO_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
import "../styles/SupportPage.scss";

const SupportPage: React.FC = () => {
    const [faqOpen, setFaqOpen] = useState<number | null>(0);
    const heroImageSource = getResponsiveImageSource(supportImage, {
        widths: HERO_IMAGE_WIDTHS,
        sizes: "100vw",
        fit: "fill",
    });

    const channels = [
        {
            title: "Live chat",
            text: "Fast help for product questions, checkout issues, delivery updates, and returns.",
            detail: "Average response: 3 minutes",
            action: "Start chat",
        },
        {
            title: "Email support",
            text: "Send details, screenshots, order IDs, or warranty documents for deeper help.",
            detail: "support@digital-e.com",
            action: "Send email",
        },
        {
            title: "Hotline",
            text: "Speak with a support agent when delivery, payment, or account access needs urgent attention.",
            detail: "+84 123 456 789",
            action: "Call now",
        },
    ];

    const resources = [
        { title: "Track an order", text: "Check status, payment method, delivery address, and order items from your account." },
        { title: "Returns and refunds", text: "Review return conditions, refund timelines, and what to prepare before sending items back." },
        { title: "Warranty help", text: "Understand coverage, repair steps, proof-of-purchase needs, and service options." },
        { title: "Payment support", text: "Get help with cash on delivery, bank transfer confirmation, and failed checkout attempts." },
    ];

    const faqs = [
        {
            q: "How can I track my order?",
            a: "Sign in and open Order History. Each order shows status, payment method, total, address, and item details.",
        },
        {
            q: "Can I change the shipping address after checkout?",
            a: "Contact support as soon as possible. Address changes are easiest before the order is confirmed or packed.",
        },
        {
            q: "What happens if an item is out of stock?",
            a: "Checkout blocks unavailable stock. If stock changes after purchase, support will contact you with replacement or refund options.",
        },
        {
            q: "How do promotions work?",
            a: "Discount codes may have active dates, minimum order values, and usage limits. The cart will validate the promotion before checkout.",
        },
    ];

    return (
        <Layout>
            <Helmet>
                <title>Support | Digital-E</title>
                <meta name="description" content="Get help with Digital-E orders, payments, products, warranties, and account support." />
            </Helmet>
            <main className="support">
                <header className="support__hero">
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
                    <span className="support__hero__badge">Support Center</span>
                    <h1>Help that keeps your order moving.</h1>
                    <p>
                        Find quick answers, contact our support team, or review the practical guides customers need most
                        before and after checkout.
                    </p>
                    <div className="support__hero__actions">
                        <Link to="/orders">View order history</Link>
                        <Link to="/contact-us" className="ghost">
                            Contact us
                        </Link>
                    </div>
                </header>

                <section className="support__channels" aria-labelledby="support-contact-heading">
                    <div className="support__section-heading">
                        <span>Contact</span>
                        <h2 id="support-contact-heading">Choose the fastest way to reach us</h2>
                    </div>
                    <div className="support__channels__grid">
                        {channels.map((channel) => (
                            <article className="support__channels__card" key={channel.title}>
                                <h3>{channel.title}</h3>
                                <p>{channel.text}</p>
                                <span>{channel.detail}</span>
                                <button type="button">{channel.action}</button>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="support__resources">
                    <div className="support__section-heading">
                        <span>Self service</span>
                        <h2>Popular support topics</h2>
                    </div>
                    <div className="support__resources__grid">
                        {resources.map((resource) => (
                            <article className="support__resources__card" key={resource.title}>
                                <h3>{resource.title}</h3>
                                <p>{resource.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="support__faq">
                    <div className="support__section-heading">
                        <span>FAQ</span>
                        <h2>Answers customers ask for most often</h2>
                    </div>
                    <div className="support__faq__list">
                        {faqs.map((item, idx) => (
                            <button
                                key={item.q}
                                type="button"
                                className={`support__faq__item ${faqOpen === idx ? "active" : ""}`}
                                onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                                aria-expanded={faqOpen === idx}
                            >
                                <div className="support__faq__item__q">
                                    <span>{item.q}</span>
                                    <strong>{faqOpen === idx ? "-" : "+"}</strong>
                                </div>
                                {faqOpen === idx && <div className="support__faq__item__a">{item.a}</div>}
                            </button>
                        ))}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default SupportPage;
