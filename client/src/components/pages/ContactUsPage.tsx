import React, { useState } from "react";
import "../../styles/ContactUsPage.scss";
import Layout from "../layout/Layout";
import NavigationBar from "../common/NavigationBar";
import { Helmet } from "react-helmet";
import { useToast } from "../../context/ToastContext";

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
            <NavigationBar />
            <Helmet>
                <title>Contact us</title>
                <meta name="description" content="Get in touch with Digital-E for support, inquiries, or feedback." />
            </Helmet>
            <div className="contact">
                <h2 className="contact__title">Contact Us</h2>
                <p className="contact__intro">
                    Have questions or feedback? Reach out to us using the form below or through our support channels.
                </p>
                <form className="contact__form" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        name="name"
                        placeholder="Your Name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="contact__form__input"
                    />
                    <input
                        type="email"
                        name="email"
                        placeholder="Your Email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="contact__form__input"
                    />
                    <textarea
                        name="message"
                        placeholder="Your Message"
                        value={formData.message}
                        onChange={handleChange}
                        required
                        rows={6}
                        className="contact__form__textarea"
                    />
                    <button type="submit" className="contact__form__button">
                        Send Message
                    </button>
                </form>

                <div className="contact__info">
                    <h3>Other ways to reach us</h3>
                    <p>Email: contact@digital-e.com</p>
                    <p>Phone: +84 123 456 789</p>
                    <p>Address: 123 Digital-E Street, Ho Chi Minh City, Vietnam</p>
                </div>
            </div>
        </Layout>
    );
};

export default ContactUsPage;
