import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import supportImage from "../assets/images/support.jpg";
import Layout from "../components/layout/Layout";
import { useT } from "../hooks/useT";
import { HERO_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
import "../styles/pages/_support.scss";

type SupportChannel = { title: string; text: string; detail: string; action: string; href: string };
type SupportResource = { title: string; text: string; action: string; href: "/orders" | "/contact-us" };

const SupportPage: React.FC = () => {
    const t = useT();
    const [faqOpen, setFaqOpen] = useState<number | null>(0);
    const heroImageSource = getResponsiveImageSource(supportImage, {
        widths: HERO_IMAGE_WIDTHS,
        sizes: "100vw",
        fit: "fill",
    });

    const channels: SupportChannel[] = [
        { title: t("support.contactFormTitle"), text: t("support.contactFormText"), detail: t("support.contactFormDetail"), action: t("support.contactFormAction"), href: "/contact-us" },
        { title: t("support.emailTitle"), text: t("support.emailText"), detail: t("support.emailDetail"), action: t("support.emailAction"), href: "mailto:support@digital-e.com" },
        { title: t("support.hotlineTitle"), text: t("support.hotlineText"), detail: t("support.hotlineDetail"), action: t("support.hotlineAction"), href: "tel:+84123456789" },
    ];
    const resources: SupportResource[] = [
        { title: t("support.trackOrderTitle"), text: t("support.trackOrderText"), action: t("support.trackOrderAction"), href: "/orders" },
        { title: t("support.returnsTitle"), text: t("support.returnsText"), action: t("support.returnsAction"), href: "/contact-us" },
        { title: t("support.warrantyTitle"), text: t("support.warrantyText"), action: t("support.warrantyAction"), href: "/contact-us" },
        { title: t("support.paymentTitle"), text: t("support.paymentText"), action: t("support.paymentAction"), href: "/contact-us" },
    ];
    const faqs = [
        { question: t("support.faq1Question"), answer: t("support.faq1Answer") },
        { question: t("support.faq2Question"), answer: t("support.faq2Answer") },
        { question: t("support.faq3Question"), answer: t("support.faq3Answer") },
        { question: t("support.faq4Question"), answer: t("support.faq4Answer") },
    ];

    return (
        <Layout>
            <Helmet>
                <title>{`${t("support.title")} | Digital-E`}</title>
                <meta name="description" content={t("support.metaDescription")} />
            </Helmet>
            <main className="support info-page">
                <header className="support__hero">
                    <img src={heroImageSource.src} srcSet={heroImageSource.srcSet} sizes={heroImageSource.sizes} alt="" aria-hidden="true" loading="eager" fetchPriority="high" decoding="async" />
                    <h1>{t("support.title")}</h1>
                    <p>{t("support.heroSubtitle")}</p>
                    <div className="support__hero__actions info-page__actions">
                        <Link to="/orders">{t("support.viewOrderHistory")}</Link>
                        <Link to="/contact-us" className="ghost">{t("support.contactUs")}</Link>
                    </div>
                </header>

                <section className="support__channels" aria-labelledby="support-contact-heading">
                    <div className="support__section-heading info-page__section-heading">
                        <span>{t("support.contactLabel")}</span>
                        <h2 id="support-contact-heading">{t("support.contactHeading")}</h2>
                    </div>
                    <div className="support__channels__grid">
                        {channels.map((channel) => (
                            <article className="support__channels__card" key={channel.title}>
                                <h3>{channel.title}</h3>
                                <p>{channel.text}</p>
                                <span>{channel.detail}</span>
                                {channel.href.startsWith("/") ? <Link to={channel.href}>{channel.action}</Link> : <a href={channel.href}>{channel.action}</a>}
                            </article>
                        ))}
                    </div>
                </section>

                <section className="support__resources" aria-labelledby="support-resources-heading">
                    <div className="support__section-heading info-page__section-heading">
                        <span>{t("support.selfServiceLabel")}</span>
                        <h2 id="support-resources-heading">{t("support.resourcesHeading")}</h2>
                    </div>
                    <div className="support__resources__grid">
                        {resources.map((resource) => (
                            <article className="support__resources__card" key={resource.title}>
                                <h3>{resource.title}</h3>
                                <p>{resource.text}</p>
                                <Link to={resource.href}>{resource.action}</Link>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="support__faq" aria-labelledby="support-faq-heading">
                    <div className="support__section-heading info-page__section-heading">
                        <span>{t("support.faqLabel")}</span>
                        <h2 id="support-faq-heading">{t("support.faqHeading")}</h2>
                    </div>
                    <div className="support__faq__list">
                        {faqs.map((item, idx) => {
                            const questionId = `support-faq-question-${idx}`;
                            const answerId = `support-faq-answer-${idx}`;
                            const isOpen = faqOpen === idx;
                            return (
                                <React.Fragment key={questionId}>
                                    <button id={questionId} type="button" className={`support__faq__item ${isOpen ? "active" : ""}`} onClick={() => setFaqOpen(isOpen ? null : idx)} aria-expanded={isOpen} aria-controls={answerId}>
                                        <span className="support__faq__item__q">
                                            <span>{item.question}</span>
                                            <strong aria-hidden="true">{isOpen ? "-" : "+"}</strong>
                                        </span>
                                    </button>
                                    {isOpen && <div id={answerId} className="support__faq__item__a" role="region" aria-labelledby={questionId}>{item.answer}</div>}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default SupportPage;
