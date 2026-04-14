import { Link } from "react-router-dom";
import "../../styles/Footer.scss";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon } from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import React, { useState } from "react";

const Footer = () => {
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
    const [email, setEmail] = useState<string>("");
    const { addToast } = useToast();
    const handleSubscribe = () => {
        // Add your email subscription logic here
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
            <div className="footer__top">
                <div className="footer__brand">
                    <Link to="/" className="footer__brand__logo">
                        DIGITAL-E
                    </Link>
                    <p className="footer__brand__text">
                        Premium tech marketplace for laptops, accessories, and smart devices built for creators, teams,
                        and everyday shoppers.
                    </p>
                    <div className="footer__brand__social">
                        {socialLinks.map((link, index) => (
                            <Link
                                key={index}
                                to={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Digital-E on ${link.platform} (opens in a new tab)`}
                            >
                                {link.icon}
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="footer__grid">
                    <div className="footer__col">
                        <h2 className="footer__col__heading">Top Categories</h2>
                        <Link to={"/shops?categories=Laptop&brands=&minPrice=0&maxPrice=4000&term="}>Laptops</Link>
                        <Link to={"/shops?categories=Camera&brands=&minPrice=0&maxPrice=4000&term="}>Cameras</Link>
                        <Link to={"/shops?categories=Smartphone&brands=&minPrice=0&maxPrice=4000&term="}>
                            Smartphones
                        </Link>
                        <Link to={"/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=4000&term="}>
                            Graphics cards
                        </Link>
                    </div>
                    <div className="footer__col">
                        <h2 className="footer__col__heading">Support</h2>
                        <Link to="/support">Help center</Link>
                        <span>Delivery & returns</span>
                        <span>Track an order</span>
                        <span>Secure payments</span>
                    </div>
                    <div className="footer__col">
                        <h2 className="footer__col__heading">Company</h2>
                        <Link to="/about-us">About us</Link>
                        <Link to="/news">Newsroom</Link>
                        <span>Terms & conditions</span>
                        <span>Privacy policy</span>
                    </div>
                    <div className="footer__col">
                        <h2 className="footer__col__heading">Contact</h2>
                        <address>Email: digital-e@gmail.com</address>
                        <address>Phone: (+84) 123 456 7890</address>
                        <address>123 ABC Street, HCM City, Vietnam</address>
                    </div>
                    <div className="footer__col footer__col--newsletter">
                        <h2 className="footer__col__heading">Newsletter</h2>
                        <p>Receive product news, launch drops, and exclusive deals.</p>
                        <div className="footer__newsletter">
                            <input
                                type="email"
                                name="email_subs"
                                id="email_subs"
                                placeholder="Your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            <button type="button" onClick={handleSubscribe}>
                                Subscribe
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="footer__bottom">
                <span>© 2026 Digital-E. All rights reserved.</span>
                <nav className="footer__bottom__links" aria-label="Legal and policies">
                    <Link to="/support">Terms of service</Link>
                    <Link to="/support">Privacy policy</Link>
                    <Link to="/support">Cookie policy</Link>
                </nav>
            </div>
        </footer>
    );
};

export default Footer;
