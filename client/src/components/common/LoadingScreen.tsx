import React from "react";

const LoadingScreen = () => {
    return (
        <div
            style={{
                minHeight: "12px",
                padding: "0 1rem",
            }}
            aria-hidden="true"
        >
            <div
                style={{
                    width: "100%",
                    height: "3px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    background: "rgba(148, 163, 184, 0.16)",
                }}
            >
                <div
                    style={{
                        width: "35%",
                        height: "100%",
                        borderRadius: "999px",
                        background: "linear-gradient(90deg, #0b5fff 0%, #38bdf8 100%)",
                        animation: "loading-screen-slide 1s ease-in-out infinite alternate",
                    }}
                />
            </div>
            <style>
                {`
                    @keyframes loading-screen-slide {
                        from { transform: translateX(0); }
                        to { transform: translateX(180%); }
                    }
                `}
            </style>
        </div>
    );
};

export default LoadingScreen;
