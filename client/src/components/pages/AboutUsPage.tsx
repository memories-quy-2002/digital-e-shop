import React from "react";
import "../../styles/AboutUsPage.scss";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

const AboutUsPage: React.FC = () => {
    const values = [
        {
            title: "Curated quality",
            desc: "We only feature products that pass performance, durability, and warranty checks.",
        },
        {
            title: "Human support",
            desc: "Real people respond within hours, not days - across email, chat, and hotline.",
        },
        {
            title: "Transparent pricing",
            desc: "No hidden fees, no surprise add-ons. What you see is what you pay.",
        },
    ];

    const milestones = [
        { year: "2023", text: "Launched Digital-E with a focus on premium laptops and accessories." },
        { year: "2024", text: "Expanded into audio, smart home, and gaming with 2K+ products." },
        { year: "2025", text: "Rolled out AI-powered search and personalized recommendations." },
        { year: "2026", text: "Reached 5,000+ products and partnerships with top global brands." },
    ];

    return (
        <Layout>
            <Helmet>
                <title>About Us | Digital-E</title>
                <meta name="description" content="Learn more about Digital-E, our mission, and our team." />
            </Helmet>
            <div className="about">
                <section className="about__hero">
                    <span className="about__hero__badge">About Digital-E</span>
                    <h1>We make premium tech easy to discover, trust, and afford.</h1>
                    <p>
                        Digital-E is built for people who want powerful devices without the guesswork. We curate top
                        electronics, negotiate honest pricing, and back it with fast delivery and real support.
                    </p>
                    <div className="about__hero__stats">
                        <div>
                            <strong>5K+</strong>
                            <span>Products</span>
                        </div>
                        <div>
                            <strong>120+</strong>
                            <span>Brands</span>
                        </div>
                        <div>
                            <strong>24/7</strong>
                            <span>Support</span>
                        </div>
                        <div>
                            <strong>98%</strong>
                            <span>Delivery on time</span>
                        </div>
                    </div>
                </section>

                <section className="about__values">
                    <h2>What we stand for</h2>
                    <div className="about__values__grid">
                        {values.map((value) => (
                            <div className="about__values__card" key={value.title}>
                                <h3>{value.title}</h3>
                                <p>{value.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="about__story">
                    <div className="about__story__content">
                        <h2>Our mission</h2>
                        <p>
                            To empower customers with reliable, smart, and affordable technology, while creating a
                            shopping experience that feels confident from checkout to delivery.
                        </p>
                        <p>
                            We partner directly with trusted suppliers and optimize every step from packaging to
                            shipping to ensure your tech arrives fast and ready to perform.
                        </p>
                    </div>
                    <div className="about__story__milestones">
                        {milestones.map((milestone) => (
                            <div key={milestone.year} className="about__story__milestones__item">
                                <strong>{milestone.year}</strong>
                                <p>{milestone.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="about__team">
                    <div className="about__team__intro">
                        <h2>Meet the team</h2>
                        <p>
                            We are a cross-functional group of engineers, product experts, and customer advocates
                            building the most trusted electronics marketplace in the region.
                        </p>
                    </div>
                    <div className="about__team__grid">
                        <div className="about__team__card">
                            <h4>Product Specialists</h4>
                            <p>Hands-on testing, comparisons, and category roadmaps.</p>
                        </div>
                        <div className="about__team__card">
                            <h4>Operations</h4>
                            <p>Fulfillment, logistics, and vendor relationships.</p>
                        </div>
                        <div className="about__team__card">
                            <h4>Customer Care</h4>
                            <p>Fast resolutions and personalized help when you need it.</p>
                        </div>
                    </div>
                </section>
            </div>
        </Layout>
    );
};

export default AboutUsPage;
