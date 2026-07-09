import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { useToast } from "../context/ToastContext";
import { BellIcon, HouseIcon, PersonIcon } from "../components/common/Icons";
import { useT } from "../hooks/useT";
import "../styles/pages/_contact.scss";

const ContactUsPage: React.FC = () => {
    const t = useT();
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        message: "",
    });
    const { addToast } = useToast();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addToast(t("contact.submitSuccess"), t("contact.submitSuccessBody"));
        setFormData({ name: "", email: "", message: "" });
    };

    return (
        <Layout>
            <Helmet>
                <title>{`${t("contact.title")} | Digital-E`}</title>
                <meta
                    name="description"
                    content="Get in touch with Digital-E for support, inquiries, or feedback."
                />
            </Helmet>
            <main className="contact info-page">
                <section className="contact__hero">
                    <div className="contact__hero__content">
                        <h1>{t("contact.title")}</h1>
                        <p>{t("contact.subtitle")}</p>
                        <div className="info-page__actions">
                            <Link to="/support">{t("contact.visitSupport")}</Link>
                            <Link to="/orders" className="ghost">
                                {t("contact.reviewOrders")}
                            </Link>
                        </div>
                    </div>
                    <div className="contact__hero__stats">
                        <article>
                            <span>{t("contact.stats.responseLabel")}</span>
                            <strong>{t("contact.stats.responseValue")}</strong>
                        </article>
                        <article>
                            <span>{t("contact.stats.coverageLabel")}</span>
                            <strong>{t("contact.stats.coverageValue")}</strong>
                        </article>
                        <article>
                            <span>{t("contact.stats.channelsLabel")}</span>
                            <strong>{t("contact.stats.channelsValue")}</strong>
                        </article>
                    </div>
                </section>

                <section className="contact__grid">
                    <div className="contact__form-panel info-page__surface">
                        <div className="info-page__section-heading">
                            <h2>{t("contact.formHeading")}</h2>
                        </div>

                        <form className="contact__form" onSubmit={handleSubmit}>
                            <div className="contact__form__grid">
                                <label>
                                    <span>{t("contact.nameLabel")}</span>
                                    <input
                                        type="text"
                                        name="name"
                                        placeholder="Nguyen Van A"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        className="contact__form__input"
                                    />
                                </label>
                                <label>
                                    <span>{t("contact.emailLabel")}</span>
                                    <input
                                        type="email"
                                        name="email"
                                        placeholder="you@example.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        className="contact__form__input"
                                    />
                                </label>
                            </div>
                            <label>
                                <span>{t("contact.messageLabel")}</span>
                                <textarea
                                    name="message"
                                    placeholder={t("contact.messagePlaceholder")}
                                    value={formData.message}
                                    onChange={handleChange}
                                    required
                                    rows={7}
                                    className="contact__form__textarea"
                                />
                            </label>
                            <div className="contact__form__actions">
                                <button type="submit" className="contact__form__button">
                                    {t("contact.sendButton")}
                                </button>
                                <small>{t("contact.replyNote")}</small>
                            </div>
                        </form>
                    </div>

                    <aside className="contact__side">
                        <section className="contact__panel info-page__panel">
                            <div className="info-page__section-heading">
                                <span>{t("contact.directChannelsHeading")}</span>
                                <h2>{t("contact.directChannelsSubtitle")}</h2>
                            </div>
                            <div className="info-page__meta-list">
                                <div className="info-page__meta-item">
                                    <small>{t("contact.metaEmailLabel")}</small>
                                    <strong>{t("contact.metaEmailValue")}</strong>
                                    <span>{t("contact.metaEmailNote")}</span>
                                </div>
                                <div className="info-page__meta-item">
                                    <small>{t("contact.metaPhoneLabel")}</small>
                                    <strong>{t("contact.metaPhoneValue")}</strong>
                                    <span>{t("contact.metaPhoneNote")}</span>
                                </div>
                                <div className="info-page__meta-item">
                                    <small>{t("contact.metaOfficeLabel")}</small>
                                    <strong>{t("contact.metaOfficeValue")}</strong>
                                    <span>{t("contact.metaOfficeNote")}</span>
                                </div>
                            </div>
                        </section>

                        <section className="contact__panel contact__panel--help info-page__panel">
                            <div className="info-page__section-heading">
                                <span>{t("contact.shortcutsHeading")}</span>
                                <h2>{t("contact.shortcutsSubtitle")}</h2>
                            </div>
                            <div className="contact__shortcut-list">
                                <Link to="/orders">
                                    <span>
                                        <BellIcon size={18} />
                                    </span>
                                    <div>
                                        <strong>{t("contact.shortcutOrderTitle")}</strong>
                                        <small>{t("contact.shortcutOrderNote")}</small>
                                    </div>
                                </Link>
                                <Link to="/account">
                                    <span>
                                        <PersonIcon size={18} />
                                    </span>
                                    <div>
                                        <strong>{t("contact.shortcutAccountTitle")}</strong>
                                        <small>{t("contact.shortcutAccountNote")}</small>
                                    </div>
                                </Link>
                                <Link to="/support">
                                    <span>
                                        <HouseIcon size={18} />
                                    </span>
                                    <div>
                                        <strong>{t("contact.shortcutSupportTitle")}</strong>
                                        <small>{t("contact.shortcutSupportNote")}</small>
                                    </div>
                                </Link>
                            </div>
                        </section>
                    </aside>
                </section>
            </main>
        </Layout>
    );
};

export default ContactUsPage;
