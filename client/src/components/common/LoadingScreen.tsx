import React from "react";

const LoadingScreen = () => {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "60vh",
                fontSize: "1.1rem",
                fontWeight: 600,
            }}
        >
            Loading...
        </div>
    );
};

export default LoadingScreen;
