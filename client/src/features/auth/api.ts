import http from "../../lib/http";
import type { UserData } from "../../types/user";

export type LoginCredentials = { idToken: string };

export type RegistrationRequest = { idToken: string; user: { username: string } };

export type RegistrationResponse = {
    uid?: string;
    token?: string;
    userData?: UserData;
    email_verified?: boolean;
    msg?: string;
};

export async function loginUser(
    credentials: LoginCredentials,
    rememberMe: boolean,
): Promise<UserData> {
    const response = await http.post("/api/users/login", { ...credentials, rememberMe });
    return response.data.userData;
}

export async function registerUser(
    registration: RegistrationRequest,
): Promise<RegistrationResponse> {
    const response = await http.post("/api/users/register", registration);
    return response.data as RegistrationResponse;
}
