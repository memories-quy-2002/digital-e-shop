import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import "../../../styles/features/auth/_login.scss";

const VerifyEmailPage = () => {
    return (
        <main className="auth-page">
            <Helmet>
                <title>Verify email | Digital-E</title>
                <meta name="description" content="Verify your Digital-E email address." />
            </Helmet>
            <section className="login__form" aria-labelledby="verify-email-title">
                <h1 id="verify-email-title" className="login__form__title">Check your inbox</h1>
                <p className="login__form__subtitle" role="status">
                    Firebase sent a verification link to your email address. Open that link, then sign in again to
                    refresh your Digital-E account status.
                </p>
                <div className="login__form__switch">
                    <Link to="/login">Back to login</Link>
                </div>
            </section>
        </main>
    );
};

export default VerifyEmailPage;
