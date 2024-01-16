import React, { createContext, useEffect, useState } from "react";
import axios from "../api/axios";
import { Role, User } from "../utils/interface";

// Create the AuthContext with a specific type for its value
export const AuthContext = createContext({});

interface AuthProps {
	children: React.ReactNode;
}

const AuthProvider: React.FC<AuthProps> = ({ children }) => {
	const [user, setUser] = useState<User>({
		UID: 0,
		UName: "",
		UEmail: "",
		UPassword: "",
		URole: Role.Customer,
		ULast_login: "",
	});
	const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
		!!localStorage.getItem("user") || !!sessionStorage.getItem("user")
	);
	const [uid, setUID] = useState<string | null>(
		localStorage.getItem("user") || sessionStorage.getItem("user")
	);

	console.log(localStorage);

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const response = await axios.get(`/get/user/${uid}`);
				if (response.status === 200) {
					setUser(response.data.user);
				}
			} catch (error) {
				throw error;
			}
		};
		setIsAuthenticated(
			!!localStorage.getItem("user") || !!sessionStorage.getItem("user")
		);

		fetchUser();
	}, [uid]);

	const auth: { isAuthenticated: boolean; user: User } = {
		isAuthenticated,
		user,
	};
	console.log(user, isAuthenticated);

	return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
