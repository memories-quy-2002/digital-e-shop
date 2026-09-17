import { Link } from "react-router-dom";
import "../../styles/layout/_footer.scss";
import {
    FacebookIcon,
    InstagramIcon,
    LinkedinIcon,
    TelephoneIcon,
    TwitterIcon,
} from "../common/Icons";
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
    const t = useT();

    return (
        <footer className="footer">
            <div className="footer__shell">
                <section className="footer__top">
                    <div className="footer__brand">
                        <Link to="/" className="footer__brand__identity">
                            <span className="footer__brand__mark" aria-hidden="true">
                                <span className="footer__brand__mark-core">D</span>
                                <span className="footer__brand__mark-dot" />
                            </span>
                            <span className="footer__brand__wordmark">
                                <strong translate="no">DIGITAL-E</strong>
                                <small>{t("header.tagline")}</small>
                            </span>
                        </Link>
                        <p className="footer__brand__text">{t("footer.brandTagline")}</p>

                        <div className="footer__contact">
                            <a href="tel:+841234567890">
                                <TelephoneIcon size={16} />
                                {t("footer.phone")}
                            </a>
                            <span>{t("footer.address")}</span>
                        </div>

                        <div className="footer__brand__social">
                            {socialLinks.map((link) => (
                                <a
                                    key={link.platform}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("footer.socialLinkLabel", link.platform)}
                                >
                                    {link.icon}
                                </a>
                            ))}
                        </div>
                    </div>

                    <section className="footer__main" aria-label={t("footer.navigationLabel")}>
                        <div className="footer__grid">
                            <div className="footer__col">
                                <h2 className="footer__col__heading">{t("footer.shop")}</h2>
                                <Link to="/shops">{t("footer.shopAll")}</Link>
                                <Link to="/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=100000000&term=">
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
                                    <span>{t("cart.payos")}</span>
                                    <span>{t("footer.cashOnDelivery")}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </section>

                <div className="footer__bottom">
                    <span>{t("footer.copyright")}</span>
                    <nav className="footer__bottom__links" aria-label={t("footer.legalNavigationLabel")}>
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
