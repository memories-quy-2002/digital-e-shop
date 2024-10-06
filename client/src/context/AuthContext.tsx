import { onAuthStateChanged } from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "../api/axios";
import { auth } from "../services/firebase";

// Tạo context cho user
interface AuthContextProps {
    uid: string | null;
    userData: any;
    loading: boolean;
}

const AuthContext = createContext<AuthContextProps>({
    uid: null,
    userData: null,
    loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [uid, setUid] = useState<string | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUid(user.uid);
                try {
                    const response = await axios.get(`/api/users/${user.uid}`);
                    if (response.status === 200) {
                        setUserData(response.data.userData);
                        // Navigate to Home page only after userData is set
                    }
                } catch (err) {
                    console.error("Error fetching user data", err);
                    setUserData(null); // Set userData to null if error
                } finally {
                    setLoading(false); // Set loading to false regardless of success/error
                }
            } else {
                setUid(null);
                setUserData(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    return <AuthContext.Provider value={{ uid, userData, loading }}>{children}</AuthContext.Provider>;
};

// Custom hook để sử dụng AuthContext trong các component khác
export const useAuth = () => useContext(AuthContext);
