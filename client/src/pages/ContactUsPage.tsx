import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { useToast } from "../context/ToastContext";
import { BellIcon, HouseIcon, PersonIcon } from "../components/common/Icons";
import "../styles/pages/_contact.scss";

const ContactUsPage: React.FC = () => {
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
        addToast("Submit successfully", "Thank you for contacting us! We'll get back to you soon.");
        setFormData({ name: "", email: "", message: "" });
    };
    return (
        <Layout>
            <Helmet>
                <title>Contact Us | Digital-E</title>
                <meta name="description" content="Get in touch with Digital-E for support, inquiries, or feedback." />
            </Helmet>
            <main className="contact info-page">
                <section className="contact__hero">
                    <div className="contact__hero__content">
                        <span className="info-page__hero-badge">Contact Digital-E</span>
                        <h1>Talk to the team behind your order and account experience.</h1>
                        <p>
                            Reach out for product questions, order follow-up, account issues, warranty guidance, or
                            general store feedback. Use the form for detailed requests or choose a direct support
                            channel when you already know what you need.
                        </p>
                        <div className="info-page__actions">
                            <Link to="/support">Visit support</Link>
                            <Link to="/orders" className="ghost">
                                Review orders
                            </Link>
                        </div>
                    </div>
                    <div className="contact__hero__stats">
                        <article>
                            <span>Response</span>
                            <strong>Under 1 business day</strong>
                        </article>
                        <article>
                            <span>Coverage</span>
                            <strong>Orders, products, accounts</strong>
                        </article>
                        <article>
                            <span>Channels</span>
                            <strong>Email, phone, support desk</strong>
                        </article>
                    </div>
                </section>

                <section className="contact__grid">
                    <div className="contact__form-panel info-page__surface">
                        <div className="info-page__section-heading">
                            <span>Send a message</span>
                            <h2>Tell us what you need clearly</h2>
                            <p>
                                Include order details, product names, or the account email you used so the team can
                                respond faster.
                            </p>
                        </div>

                        <form className="contact__form" onSubmit={handleSubmit}>
                            <div className="contact__form__grid">
                                <label>
                                    <span>Your name</span>
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
                                    <span>Email address</span>
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
                                <span>Your message</span>
                                <textarea
                                    name="message"
                                    placeholder="Tell us about your question, issue, or feedback."
                                    value={formData.message}
                                    onChange={handleChange}
                                    required
                                    rows={7}
                                    className="contact__form__textarea"
                                />
                            </label>
                            <div className="contact__form__actions">
                                <button type="submit" className="contact__form__button">
                                    Send Message
                                </button>
                                <small>We will reply as soon as possible with the next useful step.</small>
                            </div>
                        </form>
                    </div>

                    <aside className="contact__side">
                        <section className="contact__panel info-page__panel">
                            <div className="info-page__section-heading">
                                <span>Direct channels</span>
                                <h2>Reach us without the form</h2>
                            </div>
                            <div className="info-page__meta-list">
                                <div className="info-page__meta-item">
                                    <small>Email</small>
                                    <strong>contact@digital-e.com</strong>
                                    <span>Best for detailed order questions, screenshots, and warranty follow-up.</span>
                                </div>
                                <div className="info-page__meta-item">
                                    <small>Phone</small>
                                    <strong>+84 123 456 789</strong>
                                    <span>Useful when delivery or payment issues need faster clarification.</span>
                                </div>
                                <div className="info-page__meta-item">
                                    <small>Office</small>
                                    <strong>123 Digital-E Street</strong>
                                    <span>Ho Chi Minh City, Vietnam</span>
                                </div>
                            </div>
                        </section>

                        <section className="contact__panel contact__panel--help info-page__panel">
                            <div className="info-page__section-heading">
                                <span>Helpful shortcuts</span>
                                <h2>Go straight to the right place</h2>
                            </div>
                            <div className="contact__shortcut-list">
                                <Link to="/orders">
                                    <span><BellIcon size={18} /></span>
                                    <div>
                                        <strong>Order history</strong>
                                        <small>Check order status, payment method, and item details.</small>
                                    </div>
                                </Link>
                                <Link to="/account">
                                    <span><PersonIcon size={18} /></span>
                                    <div>
                                        <strong>My account</strong>
                                        <small>Review addresses, notifications, and account activity.</small>
                                    </div>
                                </Link>
                                <Link to="/support">
                                    <span><HouseIcon size={18} /></span>
                                    <div>
                                        <strong>Support center</strong>
                                        <small>Read common answers before contacting the team.</small>
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
