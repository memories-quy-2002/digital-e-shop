import React from "react";
import "../../styles/AboutUsPage.scss";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";

const AboutUsPage: React.FC = () => {
    return (
        <Layout>
            <NavigationBar />
            <div className="about-us">
                <div className="about-us__container">
                    <h1 className="about-us__title">About Us</h1>
                    <p className="about-us__description">
                        Welcome to DIGITAL-E, your go-to destination for
                        high-quality electronic equipment and components. We are
                        passionate about providing our customers with the latest
                        and most reliable products in the market. Our mission is
                        to deliver top-tier products at competitive prices,
                        coupled with exceptional customer service. Join us on
                        our journey to innovate and elevate your tech
                        experience.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default AboutUsPage;