import React, { createContext, useState, useEffect, useContext } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import axios from "../api/axios";

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
        const auth = getAuth();

        // Theo dõi sự thay đổi trạng thái người dùng
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUid(user.uid);
                try {
                    const response = await axios.get(`/api/users/${user.uid}`);
                    if (response.status === 200) {
                        setUserData(response.data.userData);
                    }
                } catch (err) {
                    console.error("Error fetching user data", err);
                }
            } else {
                setUid(null);
                setUserData(null);
            }
            setLoading(false);
        });

        // Hủy đăng ký khi component unmount
        return () => unsubscribe();
    }, []);

    return <AuthContext.Provider value={{ uid, userData, loading }}>{children}</AuthContext.Provider>;
};

// Custom hook để sử dụng AuthContext trong các component khác
export const useAuth = () => useContext(AuthContext);
