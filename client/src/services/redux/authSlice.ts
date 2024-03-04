import { createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
	name: "auth",
	initialState: {
		userId: "",
		userData: null,
	},
	reducers: {
		setUserId: (state, action: { payload: string }) => {
			state.userId = action.payload;
		},
		setUserData: (state, action: { payload: any }) => {
			state.userData = action.payload;
		},
	},
});

export const { setUserId, setUserData } = authSlice.actions;

export default authSlice;
