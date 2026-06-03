import React from "react";
import "../../styles/components/_loading-screen.scss";

type LoadingScreenProps = {
    variant?: "inline" | "page";
};

const LoadingScreen = ({ variant = "inline" }: LoadingScreenProps) => {
    if (variant === "page") {
        return (
            <div className="loading-screen loading-screen--page" aria-hidden="true">
                <div className="loading-screen__page">
                    <div className="loading-screen__hero">
                        <div className="loading-screen__hero-line loading-screen__hero-line--eyebrow" />
                        <div className="loading-screen__hero-line loading-screen__hero-line--title" />
                        <div className="loading-screen__hero-line loading-screen__hero-line--body" />
                    </div>
                    <div className="loading-screen__cards">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="loading-screen__card" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="loading-screen" aria-hidden="true">
            <div className="loading-screen__track">
                <div className="loading-screen__indicator" />
            </div>
        </div>
    );
};

export default LoadingScreen;
