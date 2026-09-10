import type { UserRow } from "../users/users.types";

export type JwtPayload = {
    id: string;
    email: string;
    role: string;
    sid: number;
};

export type SessionRow = {
    id: number;
    user_id?: string;
    session_start?: string | Date | null;
    session_end?: string | Date | null;
    refresh_token_hash?: string | null;
    refresh_expires_at?: string | Date | null;
    revoked_at?: string | Date | null;
    last_used_at?: string | Date | null;
    [key: string]: unknown;
};

export type AuthSessionPayload = {
    user: UserRow;
    token: string;
    sessionId: number;
    refreshToken?: string | null;
    rememberMe?: boolean;
    verificationEmailSent?: boolean;
};
