import React from "react";
import "../../styles/AboutUsPage.scss";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

const AboutUsPage: React.FC = () => {
    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>About us</title>
                <meta name="description" content="Learn more about Digital-E, our mission, and our team." />
            </Helmet>
            <div className="about">
                <h2 className="about__title">About Digital-E</h2>
                <div className="about__content">
                    <p>
                        Digital-E is a forward-thinking e-commerce platform, founded with the mission of bringing
                        innovation and convenience to online shopping. From cutting-edge electronics to everyday
                        essentials, we aim to provide customers with the best products at competitive prices.
                    </p>
                    <p>
                        Our journey started in 2023, and since then we have grown into a trusted brand with thousands of
                        satisfied customers. With AI-powered search, secure transactions, and excellent customer
                        support, we’re committed to delivering a premium shopping experience.
                    </p>
                </div>
                <div className="about__mission">
                    <h3>Our Mission</h3>
                    <p>
                        To empower customers by providing smart, reliable, and affordable e-commerce solutions while
                        fostering innovation in the digital marketplace.
                    </p>
                </div>
                <div className="about__team">
                    <h3>Meet Our Team</h3>
                    <p>
                        Digital-E is powered by a team of passionate professionals in technology, marketing, and
                        customer service who work tirelessly to enhance your experience.
                    </p>
                </div>
            </div>
        </Layout>
    );
};

export default AboutUsPage;
