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
    "email_verified",
    "email_verified_at",
    "email_verification_token_hash",
    "email_verification_expires_at",
    "email_verification_sent_at",
    "password_reset_expires_at",
    "pending_email",
    "email_change_token_hash",
    "email_change_expires_at",
] as const;

export const isEmailVerified = (user: Pick<UserRow, "email_verified_at">): boolean =>
    user.email_verified_at === undefined || Boolean(user.email_verified_at);

export const toPublicUser = (user: UserRow): UserRow => {
    const publicUser: UserRow = { ...user };

    for (const field of SENSITIVE_USER_FIELDS) {
        delete publicUser[field];
    }

    // Existing rows from before the verification migration are grandfathered in.
    publicUser.email_verified = isEmailVerified(user);

    return publicUser;
};
