import { Link } from "react-router-dom";
import "../../styles/Footer.scss";
import {
    FaFacebookF,
    FaTwitter,
    FaInstagram,
    FaLinkedinIn,
} from "react-icons/fa";
import { useToast } from "../../context/ToastContext";
import { useState } from "react";

const Footer = () => {
    const socialLinks = [
        {
            platform: "Facebook",
            url: "https://www.facebook.com/yourpage",
            icon: <FaFacebookF />,
        },
        {
            platform: "Twitter",
            url: "https://www.twitter.com/yourprofile",
            icon: <FaTwitter />,
        },
        {
            platform: "Instagram",
            url: "https://www.instagram.com/yourprofile",
            icon: <FaInstagram />,
        },
        {
            platform: "LinkedIn",
            url: "https://www.linkedin.com/in/yourprofile",
            icon: <FaLinkedinIn />,
        },
    ];
    const [email, setEmail] = useState<string>("");
    const { addToast } = useToast();
    const handleSubscribe = () => {
        // Add your email subscription logic here
        const emailPattern =
            /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (email.match(emailPattern)) {
            addToast(
                "Subscribe to newsletter",
                "Subscribe to newsletter successfully"
            );
            setEmail("");
        } else {
            addToast("Invalid email format", "Invalid email format");
        }
    };
    return (
        <div className="footer">
            <div className="footer__menuGroup">
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">
                        Top Categories
                    </h5>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Laptops"}>Laptops</Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Cameras"}>Cameras</Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Smartphones"}>
                            Smartphones
                        </Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Graphic_Cards"}>
                            Graphic cards
                        </Link>
                    </div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Help</h5>
                    <div className="footer__menuGroup__menu__item">
                        Delivery
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        Track an order
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        Secure payments
                    </div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">About us</h5>
                    <div className="footer__menuGroup__menu__item">Careers</div>
                    <div className="footer__menuGroup__menu__item">
                        Terms and Conditions
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        Privacies and Policies
                    </div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Feedback</h5>
                    <div className="footer__menuGroup__menu__item">
                        Leave a feedback
                    </div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">
                        Contact us
                    </h5>
                    <div className="footer__menuGroup__menu__item-disabled">
                        Email: digital-e@gmail.com
                    </div>
                    <div className="footer__menuGroup__menu__item-disabled">
                        Phone: (+84) 123 456 7890
                    </div>
                    <div className="footer__menuGroup__menu__item-disabled">
                        Address: 123 ABC Street, Ho Chi Minh City, Vietnam
                    </div>
                </div>
            </div>
            <div className="footer__otherGroup">
                <div className="footer__otherGroup__menu">
                    <h5 className="footer__otherGroup__menu__title">
                        Find a store
                    </h5>
                    <div className="footer__otherGroup__menu__item-disabled">
                        Find Digital-E stores near you
                    </div>
                    <button
                        className="btn"
                        type="button"
                        style={{
                            width: "250px",
                        }}
                    >
                        Store location
                    </button>
                </div>
                <div className="footer__otherGroup__menu">
                    <h5>Follow Us</h5>
                    <ul>
                        {socialLinks.map((link, index) => (
                            <li key={index}>
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {link.icon} <span>{link.platform}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="footer__otherGroup__menu">
                    <h5 className="footer__otherGroup__menu__title">
                        Newsletter subscription
                    </h5>
                    <div className="footer__otherGroup__menu__item-disabled">
                        Receive product news and updates to your inbox
                    </div>
                    <div className="d-flex">
                        <input
                            type="email"
                            name="email_subs"
                            id="email_subs"
                            placeholder="Your email"
                            className="ps-2"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <button
                            className="btn"
                            type="button"
                            onClick={handleSubscribe}
                        >
                            Go
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Footer;
