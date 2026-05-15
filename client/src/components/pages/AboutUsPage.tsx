import React from "react";
import "../../styles/AboutUsPage.scss";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import heroImage from "../../assets/images/carousel_3.jpg";

const AboutUsPage: React.FC = () => {
    const values = [
        {
            title: "Curated, not crowded",
            desc: "We keep the catalog focused on products that meet practical standards for performance, support, and value.",
        },
        {
            title: "Operational honesty",
            desc: "Stock, pricing, payment methods, and order status are designed to be clear before customers commit.",
        },
        {
            title: "Support after checkout",
            desc: "Our team helps with setup questions, warranty guidance, returns, and delivery updates after the sale.",
        },
    ];

    const milestones = [
        { year: "2023", text: "Digital-E launched with a curated catalog for laptops and workspace accessories." },
        { year: "2024", text: "The store expanded into audio, smart home, phones, and gaming essentials." },
        { year: "2025", text: "Personalized search, wishlist signals, and smarter recommendations became part of the experience." },
        { year: "2026", text: "Admin analytics, inventory alerts, and customer profiles turned operations into a stronger system." },
    ];

    const teams = [
        { name: "Product desk", detail: "Compares specifications, warranty coverage, and real-world use cases." },
        { name: "Operations", detail: "Keeps orders, stock, promotions, and fulfillment moving cleanly." },
        { name: "Customer care", detail: "Supports shoppers before purchase and keeps post-order help human." },
    ];

    return (
        <Layout>
            <Helmet>
                <title>About Us | Digital-E</title>
                <meta name="description" content="Learn more about Digital-E, our mission, and how we build a trusted electronics shopping experience." />
            </Helmet>
            <main className="about">
                <section className="about__hero">
                    <div className="about__hero__content">
                        <span className="about__hero__badge">About Digital-E</span>
                        <h1>We build a clearer way to shop for everyday technology.</h1>
                        <p>
                            Digital-E is an electronics store designed for people who want useful recommendations,
                            honest product information, smooth checkout, and support that does not disappear after delivery.
                        </p>
                        <div className="about__hero__actions">
                            <Link to="/shops">Explore products</Link>
                            <Link to="/support" className="ghost">
                                Get support
                            </Link>
                        </div>
                    </div>
                    <div className="about__hero__media">
                        <img src={heroImage} alt="Digital-E mobile technology selection" />
                    </div>
                </section>

                <section className="about__stats" aria-label="Digital-E operating snapshot">
                    <div>
                        <strong>5K+</strong>
                        <span>Products curated</span>
                    </div>
                    <div>
                        <strong>120+</strong>
                        <span>Brand partners</span>
                    </div>
                    <div>
                        <strong>24/7</strong>
                        <span>Order support</span>
                    </div>
                    <div>
                        <strong>UTC</strong>
                        <span>Consistent order time</span>
                    </div>
                </section>

                <section className="about__values">
                    <div className="about__section-heading">
                        <span>Principles</span>
                        <h2>What customers should feel every time they shop</h2>
                    </div>
                    <div className="about__values__grid">
                        {values.map((value, index) => (
                            <article className="about__values__card" key={value.title}>
                                <small>{String(index + 1).padStart(2, "0")}</small>
                                <h3>{value.title}</h3>
                                <p>{value.desc}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="about__story">
                    <div className="about__story__content">
                        <span>Our mission</span>
                        <h2>Make technology decisions less noisy.</h2>
                        <p>
                            Electronics shopping can become a maze of model numbers, unclear discounts, and uncertain
                            stock. Digital-E turns that into a calmer flow: compare what matters, see what is available,
                            choose a payment method, and track the order with confidence.
                        </p>
                        <p>
                            Behind the storefront, our admin tools focus on inventory risk, customer history, order
                            status, promotions, and analytics so the store can react before customers feel friction.
                        </p>
                    </div>
                    <div className="about__story__milestones">
                        {milestones.map((milestone) => (
                            <article key={milestone.year}>
                                <strong>{milestone.year}</strong>
                                <p>{milestone.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="about__team">
                    <div className="about__section-heading">
                        <span>Team</span>
                        <h2>The groups behind the shopping experience</h2>
                    </div>
                    <div className="about__team__grid">
                        {teams.map((team) => (
                            <article className="about__team__card" key={team.name}>
                                <h3>{team.name}</h3>
                                <p>{team.detail}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default AboutUsPage;
