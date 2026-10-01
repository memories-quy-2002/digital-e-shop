import React from "react";
import { preconnect } from "react-dom";
import ReactDOM from "react-dom/client";
import "./styles/tailwind.css";
import "./styles/index.scss";
import App from "./app/App";
import { API_BASE_URL } from "./lib/env";

const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;

if (apiOrigin !== window.location.origin) {
    preconnect(apiOrigin, { crossOrigin: "use-credentials" });
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
