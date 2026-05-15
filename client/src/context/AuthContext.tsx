import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "../api/axios";
import { Role } from "../utils/interface";

type UserData = {
    id: string;
    email: string;
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role.Admin | Role.Customer;
    token: string;
    created_at: Date;
    last_login: Date;
} | null;

interface AuthContextProps {
    userData: UserData;
    loading: boolean;
    setUserData: (userData: UserData) => void;
}

const AuthContext = createContext<AuthContextProps>({
    userData: null,
    loading: true,
    setUserData() {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userData, setUserData] = useState<UserData | null>(() => {
        try {
            // Session storage gives the UI an immediate value while the server
            // confirms whether the cookie-backed session is still valid.
            const stored = sessionStorage.getItem("userData");
            return stored ? (JSON.parse(stored) as UserData) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // The server remains the source of truth for auth. Cached data is
                // replaced or cleared after this request completes.
                const response = await axios.get(`/api/users/me`, { withCredentials: true });
                if (response.status === 200) {
                    setUserData(response.data.userData);
                } else {
                    setUserData(null);
                }
            } catch {
                setUserData(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    useEffect(() => {
        try {
            if (userData) {
                sessionStorage.setItem("userData", JSON.stringify(userData));
            } else {
                sessionStorage.removeItem("userData");
            }
        } catch {
            sessionStorage.removeItem("userData");
        }
    }, [userData]);

    return <AuthContext.Provider value={{ userData, loading, setUserData }}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextProps => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
