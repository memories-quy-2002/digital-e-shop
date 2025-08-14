import React from "react";
import { FiCheckCircle } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import "../../styles/CheckoutSuccessPage.scss";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";

const CheckoutSuccessPage = () => {
    const { userData, loading } = useAuth();
    return (
        <Layout>
            <NavigationBar />
            <article className="success__container">
                <div>
                    <FiCheckCircle size={100} color="green" />
                </div>
                <p>Hey {userData && !loading ? userData.username : "Anonymous"},</p>
                <strong>Your Order is Confirmed</strong>
                <p>We will send you a confirmation email as soon as your order ships</p>
                <div className="success__container__buttons">
                    <button type="button">Check order status</button>
                    <a href="/">Go back to home</a>
                </div>
            </article>
        </Layout>
    );
};

export default CheckoutSuccessPage;
