import http from "../../lib/http";
import type { UserData } from "../../types/user";

export type LoginCredentials =
    | { email: string; password: string }
    | { idToken: string };

export type RegistrationRequest =
    | { email: string; password: string; user: { username: string } }
    | { idToken: string; user: { username: string } };

export type RegistrationResponse = {
    uid?: string;
    token?: string;
    userData?: UserData;
    email_verified?: boolean;
    verification_email_sent?: boolean;
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
    registration: RegistrationRequest | { username: string },
    legacyIdToken?: string,
): Promise<RegistrationResponse> {
    const payload: RegistrationRequest = legacyIdToken
        ? { idToken: legacyIdToken, user: registration as { username: string } }
        : registration as RegistrationRequest;
    const response = await http.post("/api/users/register", payload);
    return response.data as RegistrationResponse;
}

export async function resendVerification(email: string): Promise<void> {
    await http.post("/api/users/verification/resend", { email });
}

export async function confirmEmailVerification(token: string): Promise<RegistrationResponse> {
    const response = await http.post("/api/users/verification/confirm", { token });
    return response.data as RegistrationResponse;
}

export async function requestPasswordReset(email: string): Promise<void> {
    await http.post("/api/users/password-reset/request", { email });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<RegistrationResponse> {
    const response = await http.post("/api/users/password-reset/confirm", { token, newPassword });
    return response.data as RegistrationResponse;
}

export async function requestEmailChange(email: string): Promise<void> {
    await http.post("/api/users/email-change/request", { email });
}

export async function confirmEmailChange(token: string): Promise<RegistrationResponse> {
    const response = await http.post("/api/users/email-change/confirm", { token });
    return response.data as RegistrationResponse;
}
