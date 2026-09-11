const path = require("node:path");

require("dotenv").config({
    path: process.env.DIGITAL_E_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const LOCAL_FIREBASE_PROJECT_ID = "demo-digital-e-local";
const LOCAL_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const DEMO_PASSWORD = "DemoPass123!";
const DEMO_FIREBASE_USERS = [
    { uid: "demo-digital-e-admin", email: "demo.admin@digital-e.local", displayName: "Minh Nguyen" },
    { uid: "demo-digital-e-alice", email: "demo.alice@digital-e.local", displayName: "Ngoc Anh Nguyen" },
    { uid: "demo-digital-e-bob", email: "demo.bob@digital-e.local", displayName: "Quang Huy Tran" },
    { uid: "demo-digital-e-carol", email: "demo.carol@digital-e.local", displayName: "Thu Ha Pham" },
];

const assertLocalFirebaseEmulatorEnvironment = (environment = process.env) => {
    if (environment.NODE_ENV === "production") {
        throw new Error("Firebase Auth Emulator seeding is not allowed when NODE_ENV=production");
    }
    if (environment.FIREBASE_AUTH_EMULATOR_HOST !== LOCAL_FIREBASE_AUTH_EMULATOR_HOST) {
        throw new Error("Set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 before seeding emulator users");
    }
    if (environment.FIREBASE_PROJECT_ID !== LOCAL_FIREBASE_PROJECT_ID) {
        throw new Error("Set FIREBASE_PROJECT_ID=demo-digital-e-local before seeding emulator users");
    }
};

const getLocalAuth = () => {
    const app = getApps()[0] || initializeApp({
        projectId: LOCAL_FIREBASE_PROJECT_ID,
    });
    return getAuth(app);
};

const seedFirebaseEmulatorUsers = async () => {
    assertLocalFirebaseEmulatorEnvironment();

    const users = DEMO_FIREBASE_USERS;
    if (users.length !== 4) {
        throw new Error("The Firebase emulator seeder requires exactly four known demo users");
    }

    const auth = getLocalAuth();
    for (const user of users) {
        const userRecord = {
            uid: user.uid,
            email: user.email,
            password: DEMO_PASSWORD,
            emailVerified: false,
            displayName: user.displayName,
        };

        try {
            await auth.updateUser(user.uid, userRecord);
        } catch (error) {
            if (error?.code !== "auth/user-not-found") {
                throw error;
            }
            await auth.createUser(userRecord);
        }
    }

    console.log("Seeded four Firebase Auth Emulator demo users");
};

if (require.main === module) {
    seedFirebaseEmulatorUsers().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    LOCAL_FIREBASE_AUTH_EMULATOR_HOST,
    LOCAL_FIREBASE_PROJECT_ID,
    DEMO_FIREBASE_USERS,
    assertLocalFirebaseEmulatorEnvironment,
    seedFirebaseEmulatorUsers,
};
