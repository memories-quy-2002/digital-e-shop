import type { UserRow } from "./users.types";

const SENSITIVE_USER_FIELDS = [
    "password",
    "password_hash",
    "token",
    "refresh_token",
    "refresh_token_hash",
    "reset_token",
    "reset_token_hash",
    "password_reset_token",
    "password_reset_token_hash",
] as const;

export const toPublicUser = (user: UserRow): UserRow => {
    const publicUser: UserRow = { ...user };

    for (const field of SENSITIVE_USER_FIELDS) {
        delete publicUser[field];
    }

    return publicUser;
};
