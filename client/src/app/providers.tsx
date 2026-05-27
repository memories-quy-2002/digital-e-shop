import React, { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import ToastProvider from "../context/ToastContext";
import { AuthProvider } from "../context/AuthContext";

type AppProvidersProps = {
    children: ReactNode;
};

const AppProviders = ({ children }: AppProvidersProps) => {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    {children}
                    <SpeedInsights />
                    <Analytics />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
};

export default AppProviders;
