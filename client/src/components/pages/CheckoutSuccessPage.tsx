import React, { useContext, useEffect } from "react";
import Layout from "../layout/Layout";
import { UserContext } from "../../context/UserDataProvider";
import Cookies from "universal-cookie";
import "../../styles/CheckoutSuccessPage.scss";
import { FiCheckCircle } from "react-icons/fi";
import NavigationBar from "../common/NavigationBar";

const cookies = new Cookies();

const CheckoutSuccessPage = () => {
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const { userData, loading, fetchUserData } = useContext(UserContext);
    useEffect(() => {
        fetchUserData(uid);
    }, [uid]);
    return (
        <Layout>
            <NavigationBar />
            <div className="success__container">
                <div>
                    <FiCheckCircle size={100} color="green" />
                </div>
                <p>
                    Hey {userData && !loading ? userData.username : "Anonymous"}
                    ,
                </p>
                <strong>Your Order is Confirmed</strong>
                <p>
                    We will send you a confirmation email as soon as your order
                    ships
                </p>
                <div className="success__container__buttons">
                    <button type="button">Check order status</button>
                    <a href="/">Go back to home</a>
                </div>
            </div>
        </Layout>
    );
};

export default CheckoutSuccessPage;
