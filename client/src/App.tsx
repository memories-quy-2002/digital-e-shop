import "./App.scss";
import { BrowserRouter } from "react-router-dom";
import ToastProvider from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/next";
import AppRoutes from "./routes/AppRoutes";

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <AppRoutes />
                    <SpeedInsights />
                    <Analytics />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
