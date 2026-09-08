import { Injectable, UnauthorizedException } from "@nestjs/common";
import { FirebaseAdminAuthService, type FirebaseIdentity } from "../src/auth/firebase-admin.service";

const TEST_TOKEN_PREFIX = "test-firebase:";

@Injectable()
export class TestFirebaseAdminAuthService extends FirebaseAdminAuthService {
    async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
        if (!idToken.startsWith(TEST_TOKEN_PREFIX)) {
            throw new UnauthorizedException({ msg: "Invalid Firebase ID token" });
        }

        const uid = idToken.slice(TEST_TOKEN_PREFIX.length).trim();
        if (!uid || uid.includes(":")) {
            throw new UnauthorizedException({ msg: "Invalid Firebase ID token" });
        }

        return {
            uid,
            email: `${uid}@test.digital-e.local`,
        };
    }
}
