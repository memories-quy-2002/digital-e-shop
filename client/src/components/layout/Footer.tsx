import { Link } from "react-router-dom";
import "../../styles/layout/_footer.scss";
import {
    FacebookIcon,
    InstagramIcon,
    LinkedinIcon,
    TelephoneIcon,
    TwitterIcon,
} from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import React, { useState } from "react";
import { useT } from "../../hooks/useT";

const socialLinks = [
    {
        platform: "Facebook",
        url: "https://www.facebook.com",
        icon: <FacebookIcon />,
    },
    {
        platform: "Twitter",
        url: "https://www.twitter.com",
        icon: <TwitterIcon />,
    },
    {
        platform: "Instagram",
        url: "https://www.instagram.com",
        icon: <InstagramIcon />,
    },
    {
        platform: "LinkedIn",
        url: "https://www.linkedin.com",
        icon: <LinkedinIcon />,
    },
];

const Footer = () => {
    const [email, setEmail] = useState<string>("");
    const { addToast } = useToast();
    const t = useT();
    const newsletterInputId = "footer-newsletter-email";

    const handleSubscribe = () => {
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (email.match(emailPattern)) {
            addToast(t("footer.subscribe"), t("footer.subscribeSuccess"));
            setEmail("");
        } else {
            addToast(t("footer.invalidEmail"), t("footer.invalidEmail"));
        }
    };

    return (
        <footer className="footer">
            <div className="footer__shell">
                <section className="footer__top">
                    <div className="footer__brand">
                        <Link to="/" className="footer__brand__logo">
                            DIGITAL-E
                        </Link>
                        <p className="footer__brand__text">{t("footer.brandTagline")}</p>

                        <div className="footer__contact">
                            <a href="tel:+841234567890">
                                <TelephoneIcon size={16} />
                                (+84) 123 456 7890
                            </a>
                            <span>123 ABC Street, HCM City, Vietnam</span>
                        </div>

                        <div className="footer__brand__social">
                            {socialLinks.map((link) => (
                                <a
                                    key={link.platform}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Digital-E on ${link.platform} (opens in a new tab)`}
                                >
                                    {link.icon}
                                </a>
                            ))}
                        </div>
                    </div>

                    <section className="footer__newsletter" aria-label="Newsletter signup">
                        <div>
                            <h2>{t("footer.newsletterTitle")}</h2>
                            <p>{t("footer.newsletterSubtitle")}</p>
                        </div>
                        <div className="footer__newsletter__form">
                            <label className="footer__sr-only" htmlFor={newsletterInputId}>
                                {t("footer.newsletterEmailLabel")}
                            </label>
                            <input
                                type="email"
                                name="email_subs"
                                id={newsletterInputId}
                                placeholder={t("footer.newsletterPlaceholder")}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            <button type="button" onClick={handleSubscribe}>
                                {t("footer.subscribe")}
                            </button>
                        </div>
                    </section>
                </section>

                <section className="footer__main" aria-label="Footer navigation">
                    <div className="footer__grid">
                        <div className="footer__col">
                            <h2 className="footer__col__heading">{t("footer.shop")}</h2>
                            <Link to="/shops">{t("footer.shopAll")}</Link>
                            <Link to="/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=5000&term=">
                                {t("footer.shopComponents")}
                            </Link>
                            <Link to="/wishlist">{t("common.wishlist")}</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">{t("footer.customerCare")}</h2>
                            <Link to="/support">{t("footer.helpCenter")}</Link>
                            <Link to="/contact-us">{t("footer.contactUs")}</Link>
                            <Link to="/orders">{t("footer.orderTracking")}</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">{t("footer.discover")}</h2>
                            <Link to="/about-us">{t("footer.about")}</Link>
                            <Link to="/news">{t("footer.latestNews")}</Link>
                            <Link to="/support">{t("footer.buyingGuides")}</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">{t("footer.payments")}</h2>
                            <div className="footer__payments" aria-label={t("footer.payments")}>
                                <span>{t("footer.bankTransfer")}</span>
                                <span>{t("footer.cashOnDelivery")}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="footer__bottom">
                    <span>{t("footer.copyright")}</span>
                    <nav className="footer__bottom__links" aria-label="Legal and policies">
                        <Link to="/support">{t("footer.terms")}</Link>
                        <Link to="/support">{t("footer.privacy")}</Link>
                        <Link to="/support">{t("footer.cookies")}</Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
