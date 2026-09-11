import { Injectable, UnauthorizedException } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "#src/config/env.config";

export type FirebaseIdentity = {
    uid: string;
    email: string;
    emailVerified: boolean;
};

@Injectable()
export class FirebaseAdminAuthService {
    private getAuthClient() {
        if (env.firebaseAuthEmulatorHost) {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = env.firebaseAuthEmulatorHost;
        }

        const app = getApps()[0] ?? (
            env.firebaseAuthEmulatorHost
                ? initializeApp({
                    projectId: env.firebaseProjectId,
                })
                : initializeApp({
                    credential: cert({
                        projectId: env.firebaseProjectId,
                        clientEmail: env.firebaseClientEmail,
                        privateKey: env.firebasePrivateKey,
                    }),
                })
        );
        return getAuth(app);
    }

    async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
        try {
            const decoded = await this.getAuthClient().verifyIdToken(idToken, true);
            if (!decoded.email) throw new Error("Firebase token has no email");
            return {
                uid: decoded.uid,
                email: decoded.email.toLowerCase(),
                emailVerified: decoded.email_verified === true,
            };
        } catch {
            throw new UnauthorizedException({ msg: "Invalid Firebase ID token" });
        }
    }

}
