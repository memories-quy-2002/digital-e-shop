import React, { createContext, useState, useEffect } from "react";
import { Role } from "../utils/interface";
import axios from "../api/axios";

interface UserDataContext {
	userData: any;
	loading: boolean;
	fetchUserData: (userId: string) => Promise<void>;
}

interface UserProps {
	children: React.ReactNode;
}

export const UserContext = createContext<UserDataContext>({
	userData: null,
	loading: false,
	fetchUserData: async () => {},
});

const UserDataProvider: React.FC<UserProps> = ({ children }) => {
	const [userData, setUserData] = useState<UserDataContext["userData"]>(null);
	const [loading, setLoading] = useState(false);

	const fetchUserData = async (userId: string) => {
		setLoading(true);
		if (userId) {
			try {
				const response = await axios.get(`/get/user/${userId}/`);
				if (response.status === 200) {
					setUserData(response.data.userData);
				}
				setLoading(false);
			} catch (err) {
				console.log(err);
			}
		} else return;
	};

	return (
		<UserContext.Provider value={{ userData, loading, fetchUserData }}>
			{children}
		</UserContext.Provider>
	);
};

export default UserDataProvider;
