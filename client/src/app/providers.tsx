import React, { ReactNode, useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import ToastProvider from "../context/ToastContext";
import { AuthProvider } from "../context/AuthContext";

type AppProvidersProps = {
    children: ReactNode;
};

type ObservabilityComponents = {
    Analytics: React.ComponentType;
    SpeedInsights: React.ComponentType;
} | null;

const Observability = () => {
    const [components, setComponents] = useState<ObservabilityComponents>(null);

    useEffect(() => {
        if (!import.meta.env.PROD) {
            return;
        }

        const browserWindow = window as Window & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const loadObservability = () => {
            Promise.all([
                import("@vercel/analytics/react"),
                import("@vercel/speed-insights/react"),
            ])
                .then(([analyticsModule, speedInsightsModule]) => {
                    setComponents({
                        Analytics: analyticsModule.Analytics,
                        SpeedInsights: speedInsightsModule.SpeedInsights,
                    });
                })
                .catch(() => {
                    setComponents(null);
                });
        };

        if (browserWindow.requestIdleCallback) {
            const idleId = browserWindow.requestIdleCallback(loadObservability, { timeout: 2000 });
            return () => browserWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = browserWindow.setTimeout(loadObservability, 1200);
        return () => browserWindow.clearTimeout(timeoutId);
    }, []);

    if (!components) {
        return null;
    }

    const { Analytics, SpeedInsights } = components;

    return (
        <>
            <SpeedInsights />
            <Analytics />
        </>
    );
};

const AppProviders = ({ children }: AppProvidersProps) => {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    {children}
                    <Observability />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
};

export default AppProviders;
