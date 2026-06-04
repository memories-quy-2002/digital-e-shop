import type { UserRow } from "#src/modules/users/users.types";

export type SocialAuthProfile = {
    provider: "google";
    providerId: string;
    email: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
};

export type JwtPayload = {
    id: string;
    email: string;
    role: string;
};

export type SessionRow = {
    id: number;
    session_start?: string | Date | null;
    [key: string]: unknown;
};

export type AuthSessionPayload = {
    user: UserRow;
    token: string;
    sessionId: number;
    refreshToken?: string | null;
};

