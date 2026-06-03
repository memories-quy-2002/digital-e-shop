import { API_BASE_URL } from "../../../lib/env";
import { Role } from "../../../utils/interface";

export type SocialProvider = "google";
export type SocialAuthIntent = "login" | "signup";

const SOCIAL_AUTH_BASE_PATHS: Record<SocialProvider, string> = {
    google: "/api/users/auth/google",
};

export const startSocialAuth = (provider: SocialProvider, role: Role, intent: SocialAuthIntent) => {
    const url = new URL(SOCIAL_AUTH_BASE_PATHS[provider], API_BASE_URL);
    url.searchParams.set("role", role);
    url.searchParams.set("intent", intent);
    window.location.assign(url.toString());
};

export const getSocialAuthMessage = (code: string | null) => {
    switch (code) {
        case "admin-only-local":
            return "Admin accounts must use email login.";
        case "account-suspended":
            return "This account is suspended.";
        case "email-exists":
            return "An account already exists with this email. Use email login to continue.";
        case "google-unavailable":
            return "Google login is not configured right now.";
        case "failed":
            return "Unable to complete social login.";
        default:
            return "";
    }
};
