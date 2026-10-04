import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "../../../components/common/Icons";
import ColorSchemeToggle from "../../../components/common/ColorSchemeToggle";
import { useT } from "../../../hooks/useT";

export type AuthShellMode = "login" | "signup";

interface AuthShellProps {
    mode: AuthShellMode;
    titleId: string;
    eyebrow: string;
    title: string;
    description: string;
    storyTitle: string;
    storyDescription: string;
    children: ReactNode;
    footer: ReactNode;
}

const AuthShell = ({
    mode,
    titleId,
    eyebrow,
    title,
    description,
    storyTitle,
    storyDescription,
    children,
    footer,
}: AuthShellProps) => {
    const t = useT();
    const benefits = mode === "login"
        ? [
            t("auth.loginBenefitOne"),
            t("auth.loginBenefitTwo"),
            t("auth.loginBenefitThree"),
        ]
        : [
            t("auth.signupBenefitOne"),
            t("auth.signupBenefitTwo"),
            t("auth.signupBenefitThree"),
        ];

    return (
        <main className={`auth-page auth-page--${mode}`}>
            <div className="auth-shell">
                <header className="auth-shell__topbar">
                    <Link className="auth-shell__brand" to="/" aria-label={t("common.storefrontHome")}>
                        <span className="auth-shell__brand-mark" aria-hidden="true">
                            <span>DE</span>
                        </span>
                        <span className="auth-shell__brand-name">Digital-E</span>
                    </Link>
                    <div className="auth-shell__topbar-actions">
                        <Link className="auth-shell__back-link" to="/">
                            <ArrowLeftIcon size={16} />
                            <span>{t("auth.backToStore")}</span>
                        </Link>
                        <ColorSchemeToggle compact />
                    </div>
                </header>

                <div className="auth-shell__body">
                    <aside className="auth-shell__story" aria-label={t("auth.accountBenefits")}>
                        <div>
                            <p className="auth-shell__story-eyebrow">{t("auth.accessLayer")}</p>
                            <h1 className="auth-shell__story-title">{storyTitle}</h1>
                            <p className="auth-shell__story-description">{storyDescription}</p>
                            <ul className="auth-shell__benefits">
                                {benefits.map((benefit) => (
                                    <li key={benefit}>{benefit}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="auth-shell__signal" aria-hidden="true">
                            <div className="auth-shell__circuit">
                                <span className="auth-shell__circuit-node auth-shell__circuit-node--a" />
                                <span className="auth-shell__circuit-node auth-shell__circuit-node--b" />
                                <span className="auth-shell__circuit-node auth-shell__circuit-node--c" />
                                <span className="auth-shell__circuit-node auth-shell__circuit-node--d" />
                            </div>
                            <p className="auth-shell__signal-copy">
                                <strong>{t("auth.signalClear")}</strong>
                                {t("auth.accountReady")}
                            </p>
                        </div>
                    </aside>

                    <section className="auth-shell__form-panel" aria-labelledby={titleId}>
                        <div className="auth-shell__form-heading">
                            <p className="auth-shell__form-eyebrow">{eyebrow}</p>
                            <h2 id={titleId}>{title}</h2>
                            <p>{description}</p>
                        </div>
                        <div className="auth-shell__form-content">{children}</div>
                        <div className="auth-shell__form-footer">{footer}</div>
                    </section>
                </div>

                <p className="auth-shell__legal">
                    {t("auth.legalNotice")}
                </p>
            </div>
        </main>
    );
};

export default AuthShell;
