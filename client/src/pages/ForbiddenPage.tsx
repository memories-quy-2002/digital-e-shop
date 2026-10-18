import React from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import "../styles/pages/_not-found.scss";

const copy = {
    en: {
        title: "Access denied",
        description: "This signed-in account does not have permission to access this admin page.",
        home: "Go to home",
        account: "Go to account",
    },
    vi: {
        title: "Không có quyền truy cập",
        description: "Tài khoản đang đăng nhập không có quyền truy cập trang quản trị này.",
        home: "Về trang chủ",
        account: "Đến trang tài khoản",
    },
} as const;

const ForbiddenPage = () => {
    const { locale } = useLocale();
    const messages = copy[locale];

    return (
        <main className="forbidden">
            <section className="forbidden__panel" aria-labelledby="forbidden-title">
                <span className="forbidden__code">403</span>
                <h1 id="forbidden-title">{messages.title}</h1>
                <p>{messages.description}</p>
                <div className="forbidden__actions">
                    <Link to="/">{messages.home}</Link>
                    <Link className="ghost" to="/account">{messages.account}</Link>
                </div>
            </section>
        </main>
    );
};

export default ForbiddenPage;
