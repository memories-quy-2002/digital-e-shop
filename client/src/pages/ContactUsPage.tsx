import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { createSupportTicket } from "../features/support/api";
import { BellIcon, HouseIcon, PersonIcon } from "../components/common/Icons";
import { useT } from "../hooks/useT";
import "../styles/pages/_contact.scss";

const CONTACT_DRAFT_KEY = "digital-e:contact-draft:v1";
type ContactDraft = { name: string; email: string; message: string };

const readContactDraft = (): ContactDraft | null => {
    try {
        const stored = sessionStorage.getItem(CONTACT_DRAFT_KEY);
        if (!stored) return null;
        const parsed: unknown = JSON.parse(stored);
        if (!parsed || typeof parsed !== "object") return null;
        const draft = parsed as Record<string, unknown>;
        if (typeof draft.name !== "string" || typeof draft.email !== "string" || typeof draft.message !== "string") {
            return null;
        }
        return { name: draft.name, email: draft.email, message: draft.message };
    } catch {
        return null;
    }
};

const writeContactDraft = (draft: ContactDraft) => {
    try {
        sessionStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // Navigation should still work when storage is unavailable.
    }
};

const clearContactDraft = () => {
    try {
        sessionStorage.removeItem(CONTACT_DRAFT_KEY);
    } catch {
        // Ignore storage failures after a successful submit.
    }
};

const ContactUsPage: React.FC = () => {
    const t = useT();
    const navigate = useNavigate();
    const { userData, loading } = useAuth();
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        message: "",
    });
    const { addToast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const draft = readContactDraft();
        if (draft) setFormData(draft);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            if (!userData) {
                writeContactDraft(formData);
                addToast(t("contact.guestTitle"), t("contact.guestBody"));
                navigate("/login?redirect=%2Fcontact-us");
                return;
            }
            await createSupportTicket({
                subject: `Contact request from ${formData.name.trim()}`,
                message: `Name: ${formData.name.trim()}\nEmail: ${formData.email.trim()}\n\n${formData.message.trim()}`,
                category: "general",
            });
            addToast(t("contact.submitSuccess"), t("contact.submitSuccessBody"));
            setFormData({ name: "", email: "", message: "" });
            clearContactDraft();
        } catch {
            addToast(t("contact.submitError"), t("contact.submitErrorBody"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <main className="contact info-page" aria-live="polite">
                    <p role="status">{t("contact.loading")}</p>
                </main>
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>{`${t("contact.title")} | Digital-E`}</title>
                <meta
                    name="description"
                    content={t("contact.metaDescription")}
                />
            </Helmet>
            <main className="contact info-page">
                <section className="contact__hero">
                    <div className="contact__hero__content">
                        <h1>{t("contact.title")}</h1>
                        <p>{t("contact.subtitle")}</p>
                        <div className="info-page__actions">
                            <Link to="/support">{t("contact.visitSupport")}</Link>
                            <Link to="/orders" className="ghost contact__hero__action--ghost">
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
                                        placeholder={t("contact.namePlaceholder")}
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
                                        placeholder={t("contact.emailPlaceholder")}
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
                                <button type="submit" className="contact__form__button contact__form__button--primary" disabled={isSubmitting}>
                                    {isSubmitting ? t("contact.pending") : t("contact.sendButton")}
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
                                    <a className="contact__direct-link" href={`mailto:${t("contact.metaEmailValue")}`}>
                                        {t("contact.metaEmailValue")}
                                    </a>
                                    <span>{t("contact.metaEmailNote")}</span>
                                </div>
                                <div className="info-page__meta-item">
                                    <small>{t("contact.metaPhoneLabel")}</small>
                                    <a className="contact__direct-link" href="tel:+84123456789">
                                        {t("contact.metaPhoneValue")}
                                    </a>
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
