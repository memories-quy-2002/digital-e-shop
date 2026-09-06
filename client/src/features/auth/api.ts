import http from "../../lib/http";
import type { UserData } from "../../types/user";

export async function loginUser(
    idToken: string,
    rememberMe: boolean,
): Promise<UserData> {
    const response = await http.post("/api/users/login", { idToken, rememberMe });
    return response.data.userData;
}

export async function registerUser(
    user: { username: string },
    idToken: string,
): Promise<void> {
    await http.post("/api/users/register", { idToken, user });
}
