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
        const app = getApps()[0] ?? initializeApp({
            credential: cert({
                projectId: env.firebaseProjectId,
                clientEmail: env.firebaseClientEmail,
                privateKey: env.firebasePrivateKey,
            }),
        });
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

    async generatePasswordResetLink(email: string): Promise<string> {
        return this.getAuthClient().generatePasswordResetLink(email, {
            url: `${env.clientUrl || "http://localhost:5173"}/reset-password`,
            handleCodeInApp: true,
        });
    }

    async updateEmail(uid: string, email: string): Promise<void> {
        await this.getAuthClient().updateUser(uid, { email, emailVerified: true });
    }
}
