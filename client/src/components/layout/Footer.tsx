import { Link } from "react-router-dom";
import "../../styles/Footer.scss";
import {
    FacebookIcon,
    InstagramIcon,
    LinkedinIcon,
    TelephoneIcon,
    TwitterIcon,
} from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import React, { useState } from "react";

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
    const newsletterInputId = "footer-newsletter-email";

    const handleSubscribe = () => {
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (email.match(emailPattern)) {
            addToast("Subscribe to newsletter", "Subscribe to newsletter successfully");
            setEmail("");
        } else {
            addToast("Invalid email format", "Invalid email format");
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
                        <p className="footer__brand__text">
                            Dependable electronics, clear checkout, order tracking, and practical support in one place.
                        </p>

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
                            <h2>Stay in the loop</h2>
                            <p>Product highlights, guides, and limited promotions.</p>
                        </div>
                        <div className="footer__newsletter__form">
                            <label className="footer__sr-only" htmlFor={newsletterInputId}>
                                Email address for newsletter subscription
                            </label>
                            <input
                                type="email"
                                name="email_subs"
                                id={newsletterInputId}
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            <button type="button" onClick={handleSubscribe}>
                                Subscribe
                            </button>
                        </div>
                    </section>
                </section>

                <section className="footer__main" aria-label="Footer navigation">
                    <div className="footer__grid">
                        <div className="footer__col">
                            <h2 className="footer__col__heading">Shop</h2>
                            <Link to="/shops">All products</Link>
                            <Link to="/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=5000&term=">
                                Components
                            </Link>
                            <Link to="/wishlist">Wishlist</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">Customer care</h2>
                            <Link to="/support">Help center</Link>
                            <Link to="/contact-us">Contact us</Link>
                            <Link to="/orders">Order tracking</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">Discover</h2>
                            <Link to="/about-us">About Digital-E</Link>
                            <Link to="/news">Latest news</Link>
                            <Link to="/support">Buying guides</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">Payments</h2>
                            <div className="footer__payments" aria-label="Supported payment methods">
                                <span>Bank transfer</span>
                                <span>Cash on delivery</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="footer__bottom">
                    <span>&copy; 2026 Digital-E. Built for everyday tech shopping.</span>
                    <nav className="footer__bottom__links" aria-label="Legal and policies">
                        <Link to="/support">Terms of service</Link>
                        <Link to="/support">Privacy policy</Link>
                        <Link to="/support">Cookie policy</Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
