import React, { useEffect, useEffectEvent } from "react";
import { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import http from "../../../lib/http";
import { getFirebaseAuth } from "../../../services/firebase";
import { useToast } from "../../../context/ToastContext";

const withSessionCheck = (WrappedComponent: React.ComponentType) => {
    const HOC: React.FC = (props) => {
        const navigate = useNavigate();
        const { addToast } = useToast();
        const checkSession = useEffectEvent(async () => {
            try {
                const auth = await getFirebaseAuth();
                if (auth.currentUser) {
                    await http.get("/api/users/session/check");
                }
            } catch (err: unknown) {
                if (err instanceof AxiosError && err.response?.status === 401) {
                    addToast("Session expired", "Please login again.");
                    navigate("/login");
                }
            }
        });

        useEffect(() => {
            checkSession();
            const intervalId = setInterval(checkSession, 300000);
            return () => clearInterval(intervalId);
        }, [checkSession]);

        return <WrappedComponent {...props} />;
    };

    return HOC;
};

export default withSessionCheck;
