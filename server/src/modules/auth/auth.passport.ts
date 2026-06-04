import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "#src/config/env.config";
import { defaultServerOrigin } from "#src/config/cors.config";
import type { SocialAuthProfile } from "./auth.types";

type OAuthDone = (err: Error | null, user?: SocialAuthProfile) => void;

const normalizeDisplayName = (profile: {
    displayName?: string;
    name?: { givenName?: string; familyName?: string };
}) => {
    if (profile.displayName?.trim()) {
        return profile.displayName.trim();
    }

    return [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(" ").trim() || undefined;
};

const getPrimaryEmail = (profile: { emails?: Array<{ value?: string }> }) =>
    profile.emails?.find((entry) => entry?.value?.trim())?.value?.trim().toLowerCase() || "";

if (env.googleClientId && env.googleClientSecret) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: env.googleClientId,
                clientSecret: env.googleClientSecret,
                callbackURL: env.googleCallbackUrl || `${defaultServerOrigin}/api/users/auth/google/callback`,
            },
            async (
                _accessToken: string,
                _refreshToken: string,
                profile: {
                    id: string;
                    displayName?: string;
                    emails?: Array<{ value?: string }>;
                    name?: { givenName?: string; familyName?: string };
                    photos?: Array<{ value?: string }>;
                },
                done: OAuthDone,
            ) => {
                const email = getPrimaryEmail(profile);
                if (!email) {
                    return done(new Error("Google account must provide an email address"));
                }

                return done(null, {
                    provider: "google",
                    providerId: profile.id,
                    email,
                    displayName: normalizeDisplayName(profile),
                    firstName: profile.name?.givenName || null,
                    lastName: profile.name?.familyName || null,
                    avatarUrl: profile.photos?.[0]?.value || null,
                });
            },
        ),
    );
}

export default passport;

