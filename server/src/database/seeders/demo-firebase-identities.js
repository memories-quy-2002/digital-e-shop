const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const DEMO_SEED_FIREBASE_APP_NAME = "digital-e-demo-seed";

const createProductionFirebaseAuth = (environment = process.env) => {
    if (environment.FIREBASE_AUTH_EMULATOR_HOST) {
        throw new Error("Production demo seeding cannot use the Firebase Auth Emulator");
    }

    const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
    const missing = required.filter((key) => !environment[key]?.trim());
    if (missing.length > 0) {
        throw new Error(`Production demo seeding requires Firebase Admin credentials: ${missing.join(", ")}`);
    }

    const existingApp = getApps().find((app) => app.name === DEMO_SEED_FIREBASE_APP_NAME);
    const app = existingApp || initializeApp(
        {
            projectId: environment.FIREBASE_PROJECT_ID,
            credential: cert({
                projectId: environment.FIREBASE_PROJECT_ID,
                clientEmail: environment.FIREBASE_CLIENT_EMAIL,
                privateKey: environment.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            }),
        },
        DEMO_SEED_FIREBASE_APP_NAME,
    );

    return getAuth(app);
};

/**
 * Resolve production demo accounts to their existing Firebase identities.
 * In local development, the committed IDs match the Auth Emulator fixtures.
 */
const resolveDemoSeedPlan = async (plan, environment = process.env) => {
    if (environment.NODE_ENV !== "production") {
        return {
            ...plan,
            users: plan.users.map((user) => ({
                ...user,
                authProvider: "firebase",
                providerUserId: user.id,
            })),
        };
    }

    const auth = createProductionFirebaseAuth(environment);
    const users = await Promise.all(plan.users.map(async (user) => {
        let firebaseUser;
        try {
            firebaseUser = await auth.getUserByEmail(user.email);
        } catch (error) {
            if (error?.code === "auth/user-not-found") {
                throw new Error(
                    `Firebase demo account is missing: ${user.email}. Create it before running the production database seed.`,
                    { cause: error },
                );
            }
            throw error;
        }

        if (firebaseUser.disabled) {
            throw new Error(`Firebase demo account is disabled: ${user.email}`);
        }
        if (firebaseUser.email?.toLowerCase() !== user.email.toLowerCase()) {
            throw new Error(`Firebase returned an unexpected email for demo account ${user.email}`);
        }
        if (!firebaseUser.providerData.some((provider) => provider.providerId === "password")) {
            throw new Error(`Firebase demo account is not configured for email/password sign-in: ${user.email}`);
        }

        return {
            ...user,
            id: firebaseUser.uid,
            emailVerified: firebaseUser.emailVerified,
            authProvider: "firebase",
            providerUserId: firebaseUser.uid,
        };
    }));

    const userIds = users.map((user) => user.id);
    if (new Set(userIds).size !== userIds.length) {
        throw new Error("Firebase demo accounts resolved to duplicate UIDs");
    }

    return { ...plan, users };
};

module.exports = { resolveDemoSeedPlan };
