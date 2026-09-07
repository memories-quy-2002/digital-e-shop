import http from "../../lib/http";
import type { UserData } from "../../types/user";

export type LoginCredentials =
    | { email: string; password: string }
    | { idToken: string };

export async function loginUser(
    credentials: LoginCredentials,
    rememberMe: boolean,
): Promise<UserData> {
    const response = await http.post("/api/users/login", { ...credentials, rememberMe });
    return response.data.userData;
}

export async function registerUser(
    user: { username: string },
    idToken: string,
): Promise<void> {
    await http.post("/api/users/register", { idToken, user });
}
