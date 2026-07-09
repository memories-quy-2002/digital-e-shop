import http from "../../lib/http";
import type { UserData } from "../../types/user";
import { Role } from "../../types/user";

export async function loginUser(
    uid: string,
    role: Role,
    rememberMe: boolean,
): Promise<UserData> {
    const response = await http.post("/api/users/login", { uid, role, rememberMe });
    return response.data.userData;
}

export async function registerUser(
    user: { username: string; email: string; password: string; role: Role },
    uid: string,
): Promise<void> {
    await http.post("/api/users/register", { user, uid });
}
