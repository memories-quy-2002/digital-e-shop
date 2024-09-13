import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { AxiosResponse } from "axios";
import { getAuth } from "firebase/auth";

const withSessionCheck = (WrappedComponent: React.ComponentType) => {
    const auth = getAuth();
    const HOC: React.FC = (props) => {
        const navigate = useNavigate();
        useEffect(() => {
            const checkSession = async () => {
                try {
                    if (auth.currentUser) {
                        const response: AxiosResponse = await axios.get("/api/session/check");
                        if (response.status === 200) {
                            console.log(response.data.sessionActive);
                        }
                    }
                } catch (error: any) {
                    if (error.response.status === 401) {
                        console.error(error.response.data.msg);
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
