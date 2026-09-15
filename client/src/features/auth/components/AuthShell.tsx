import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "../../../components/common/Icons";
import ColorSchemeToggle from "../../../components/common/ColorSchemeToggle";

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
    const benefits = mode === "login"
        ? [
            "Faster checkout with saved details",
            "Track every order in real time",
            "Curated parts for serious builds",
        ]
        : [
            "Keep your parts list in one place",
            "Move from idea to checkout faster",
            "Get more from every build",
        ];

    return (
        <main className={`auth-page auth-page--${mode}`}>
            <div className="auth-shell">
                <header className="auth-shell__topbar">
                    <Link className="auth-shell__brand" to="/" aria-label="Digital-E storefront home">
                        <span className="auth-shell__brand-mark" aria-hidden="true">
                            <span>DE</span>
                        </span>
                        <span className="auth-shell__brand-name">Digital-E</span>
                    </Link>
                    <div className="auth-shell__topbar-actions">
                        <Link className="auth-shell__back-link" to="/">
                            <ArrowLeftIcon size={16} />
                            <span>Back to store</span>
                        </Link>
                        <ColorSchemeToggle compact />
                    </div>
                </header>

                <div className="auth-shell__body">
                    <aside className="auth-shell__story" aria-label="Digital-E account benefits">
                        <div>
                            <p className="auth-shell__story-eyebrow">Digital-E / access layer</p>
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
                                <strong>Signal: clear</strong>
                                account system ready for your next move
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
                    By continuing, you agree to Digital-E&apos;s terms of service and privacy policy.
                </p>
            </div>
        </main>
    );
};

export default AuthShell;
