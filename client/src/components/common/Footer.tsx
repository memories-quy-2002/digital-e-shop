import { Link } from "react-router-dom";
import "../../styles/Footer.scss";
import { FaFacebookF, FaTwitter, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { useToast } from "../../context/ToastContext";
import { useState } from "react";

const Footer = () => {
    const socialLinks = [
        {
            platform: "Facebook",
            url: "https://www.facebook.com",
            icon: <FaFacebookF />,
        },
        {
            platform: "Twitter",
            url: "https://www.twitter.com",
            icon: <FaTwitter />,
        },
        {
            platform: "Instagram",
            url: "https://www.instagram.com",
            icon: <FaInstagram />,
        },
        {
            platform: "LinkedIn",
            url: "https://www.linkedin.com",
            icon: <FaLinkedinIn />,
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
            <div className="footer__menuGroup">
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Top Categories</h5>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Laptop&brands=&minPrice=0&maxPrice=4000&term="}>Laptops</Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Camera&brands=&minPrice=0&maxPrice=4000&term="}>Cameras</Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Smartphone&brands=&minPrice=0&maxPrice=4000&term="}>
                            Smartphones
                        </Link>
                    </div>
                    <div className="footer__menuGroup__menu__item">
                        <Link to={"/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=4000&term="}>
                            Graphic cards
                        </Link>
                    </div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Help</h5>
                    <div className="footer__menuGroup__menu__item">Delivery</div>
                    <div className="footer__menuGroup__menu__item">Track an order</div>
                    <div className="footer__menuGroup__menu__item">Secure payments</div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">About us</h5>
                    <div className="footer__menuGroup__menu__item">
                        <Link to="/about-us">Careers</Link>
                    </div>

                    <div className="footer__menuGroup__menu__item">Terms and Conditions</div>
                    <div className="footer__menuGroup__menu__item">Privacies and Policies</div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Feedback</h5>
                    <div className="footer__menuGroup__menu__item">Leave a feedback</div>
                </div>
                <div className="footer__menuGroup__menu">
                    <h5 className="footer__menuGroup__menu__title">Contact us</h5>
                    <address>
                        <div className="footer__menuGroup__menu__item-disabled">Email: digital-e@gmail.com</div>
                    </address>
                    <address>
                        <div className="footer__menuGroup__menu__item-disabled">Phone: (+84) 123 456 7890</div>
                    </address>
                    <address>
                        <div className="footer__menuGroup__menu__item-disabled">
                            Address: 123 ABC Street, HCM City, Vietnam
                        </div>
                    </address>
                </div>
            </div>
            <div className="footer__otherGroup">
                <div className="footer__otherGroup__menu">
                    <h5 className="footer__otherGroup__menu__title">Find a store</h5>
                    <div className="footer__otherGroup__menu__item-disabled">Find Digital-E stores near you</div>
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
                                <Link to={link.url} target="_blank" rel="noopener noreferrer">
                                    {link.icon} <span>{link.platform}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="footer__otherGroup__menu">
                    <h5 className="footer__otherGroup__menu__title">Newsletter subscription</h5>
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
                        <button className="btn" type="button" onClick={handleSubscribe}>
                            Go
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
