import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { AxiosError, AxiosResponse } from "axios";
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
                        const response: AxiosResponse = await axios.get("/api/users/session/check");
                        if (response.status === 200) {
                        }
                    }
                } catch (err: unknown) {
                    if (err instanceof AxiosError && err.response?.status === 401) {
                        addToast("Session expired", "Please login again.");
                        navigate("/login");
                    }
                }
            };
            checkSession();
            const intervalId = setInterval(checkSession, 300000);

            return () => clearInterval(intervalId);
        }, [navigate]);

        return <WrappedComponent {...props} />;
    };

    return HOC;
};

export default withSessionCheck;
