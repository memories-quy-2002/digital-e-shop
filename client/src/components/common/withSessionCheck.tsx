import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { AxiosError } from "axios";
import { auth } from "../../services/firebase";
import { useToast } from "../../context/ToastContext";

const withSessionCheck = (WrappedComponent: React.ComponentType) => {
    const HOC: React.FC = (props) => {
        const navigate = useNavigate();
        const { addToast } = useToast();
        useEffect(() => {
            const checkSession = async () => {
                try {
                    if (auth.currentUser) {
                        // Keep protected pages aligned with the backend session,
                        // not only the local Firebase user state.
                        await axios.get("/api/users/session/check");
                    }
                } catch (err: unknown) {
                    if (err instanceof AxiosError && err.response?.status === 401) {
                        addToast("Session expired", "Please login again.");
                        navigate("/login");
                    }
                }
            };
            checkSession();
            // Re-check periodically so expired sessions are handled before the
            // user submits a protected action.
            const intervalId = setInterval(checkSession, 300000);

            return () => clearInterval(intervalId);
        }, [navigate]);

        return <WrappedComponent {...props} />;
    };

    return HOC;
};

export default withSessionCheck;
