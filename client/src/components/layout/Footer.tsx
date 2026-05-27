import { Link } from "react-router-dom";
import "../../styles/Footer.scss";
import {
    BoxSeamIcon,
    CashStackIcon,
    CheckCircleIcon,
    CreditCardIcon,
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

const trustItems = [
    {
        icon: <BoxSeamIcon size={18} />,
        title: "Order tracking",
        text: "Clear order status from checkout to delivery.",
    },
    {
        icon: <CreditCardIcon size={18} />,
        title: "Safer checkout",
        text: "Stock validation and protected payment choices.",
    },
    {
        icon: <CashStackIcon size={18} />,
        title: "Honest pricing",
        text: "Promotions, totals, and discounts shown clearly.",
    },
    {
        icon: <CheckCircleIcon size={18} />,
        title: "Practical curation",
        text: "Electronics selected for real everyday setups.",
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
                <section className="footer__trust" aria-label="Why shop with Digital-E">
                    {trustItems.map((item) => (
                        <article key={item.title} className="footer__trust__item">
                            <span className="footer__trust__item__icon">{item.icon}</span>
                            <div>
                                <strong>{item.title}</strong>
                                <p>{item.text}</p>
                            </div>
                        </article>
                    ))}
                </section>

                <section className="footer__newsletter-band" aria-label="Newsletter signup">
                    <div className="footer__newsletter-band__copy">
                        <h2>Stay in the loop</h2>
                        <p>Get launch notes, support guides, limited promotions, and product highlights.</p>
                    </div>
                    <div className="footer__newsletter-band__form">
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
                    <small>No spam. Just launches, offers, and useful tech updates.</small>
                </section>

                <section className="footer__main">
                    <div className="footer__brand">
                        <Link to="/" className="footer__brand__logo">
                            DIGITAL-E
                        </Link>
                        <p className="footer__brand__text">
                            Digital-E helps customers choose dependable electronics with clearer product details,
                            smarter recommendations, and order support that stays visible after checkout.
                        </p>

                        <div className="footer__brand__status">
                            <span>UTC order timestamps</span>
                            <span>Low-stock validation</span>
                            <span>Customer support daily</span>
                        </div>

                        <div className="footer__contact">
                            <a href="tel:+841234567890">
                                <TelephoneIcon size={16} />
                                (+84) 123 456 7890
                            </a>
                            <span>123 ABC Street, HCM City, Vietnam</span>
                            <span>Open daily for support and order help.</span>
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

                    <div className="footer__grid">
                        <div className="footer__col">
                            <h2 className="footer__col__heading">Shop</h2>
                            <Link to="/shops">All products</Link>
                            <Link to="/shops?categories=Laptop&brands=&minPrice=0&maxPrice=5000&term=">
                                Laptops
                            </Link>
                            <Link to="/shops?categories=Smartphone&brands=&minPrice=0&maxPrice=5000&term=">
                                Smartphones
                            </Link>
                            <Link to="/shops?categories=Camera&brands=&minPrice=0&maxPrice=5000&term=">
                                Cameras
                            </Link>
                            <Link to="/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=5000&term=">
                                Components
                            </Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">Customer care</h2>
                            <Link to="/support">Help center</Link>
                            <Link to="/contact-us">Contact us</Link>
                            <Link to="/support">Shipping information</Link>
                            <Link to="/support">Returns and refunds</Link>
                            <Link to="/support">Payment support</Link>
                        </div>

                        <div className="footer__col">
                            <h2 className="footer__col__heading">Discover</h2>
                            <Link to="/about-us">About Digital-E</Link>
                            <Link to="/news">Latest news</Link>
                            <Link to="/shops">New arrivals</Link>
                            <Link to="/shops">Best sellers</Link>
                            <Link to="/support">Buying guides</Link>
                        </div>

                        <div className="footer__col footer__col--support">
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
