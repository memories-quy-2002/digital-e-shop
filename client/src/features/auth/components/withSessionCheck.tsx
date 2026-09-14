import React, { useEffect, useEffectEvent } from "react";
import { AxiosError } from "axios";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import http from "../../../lib/http";
import { getFirebaseAuth } from "../../../services/firebase";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import LoadingScreen from "../../../components/common/LoadingScreen";
import { buildLoginRedirectPath } from "../authRedirect";

const withSessionCheck = (WrappedComponent: React.ComponentType) => {
    const HOC: React.FC = (props) => {
        const navigate = useNavigate();
        const location = useLocation();
        const { addToast } = useToast();
        const { userData, loading, setUserData } = useAuth();
        const checkSession = useEffectEvent(async () => {
            try {
                const auth = await getFirebaseAuth();
                if (auth.currentUser) {
                    await http.get("/api/users/session/check");
                }
            } catch (err: unknown) {
                if (err instanceof AxiosError && err.response?.status === 401) {
                    setUserData(null);
                    addToast("Session expired", "Please login again.");
                    navigate(buildLoginRedirectPath(location), { replace: true });
                }
            }
        });

        useEffect(() => {
            if (loading || !userData) return;

            void checkSession();
            const intervalId = setInterval(checkSession, 300000);
            return () => clearInterval(intervalId);
        }, [checkSession, loading, userData]);

        if (loading) {
            return <LoadingScreen variant="page" />;
        }

        if (!userData) {
            return <Navigate to={buildLoginRedirectPath(location)} replace />;
        }

        return <WrappedComponent {...props} />;
    };

    return HOC;
};

export default withSessionCheck;
