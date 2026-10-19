import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useT } from "../../../hooks/useT";
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import "../../../styles/features/auth/_login.scss";

const VerifyEmailPage = () => {
    const t = useT();
    const copy = useCustomerJourneyCopy();
    return (
        <main className="auth-page">
            <Helmet>
                <title>{copy.auth.verifyEmailTitle} | Digital-E</title>
                <meta name="description" content={copy.auth.verifyEmailMetaDescription} />
            </Helmet>
            <section className="login__form" aria-labelledby="verify-email-title">
                <h1 id="verify-email-title" className="login__form__title">{copy.auth.verifyEmailTitle}</h1>
                <p className="login__form__subtitle" role="status">{copy.auth.verifyEmailDescription}</p>
                <div className="login__form__switch">
                    <Link to="/login">{t("auth.backToLogin")}</Link>
                </div>
            </section>
        </main>
    );
};

export default VerifyEmailPage;
