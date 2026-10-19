import { Injectable, Optional } from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";
import { EmailService } from "../transactional-email/email.service";
import type { TransactionContext } from "#src/database/transaction";
import { generateGuestOrderToken, hashGuestOrderToken } from "./guest-order-token";
import {
    GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS,
    GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH,
    GUEST_ORDER_ACCESS_RECOVERY_REQUESTS_PER_HOUR,
    hashGuestOrderAccessRecoveryEmail,
    hashGuestOrderAccessRecoveryCode,
    matchesGuestOrderAccessRecoveryCode,
    normalizeGuestRecoveryEmail,
} from "./guest-order-access-recovery.policy";
import { GuestOrderAccessRecoveryRepository } from "./guest-order-access-recovery.repository";

const parseLocale = (value: string | object | null): "en" | "vi" => {
    try {
        const snapshot = typeof value === "string" ? JSON.parse(value) : value;
        return (snapshot as { locale?: unknown } | null)?.locale === "vi" ? "vi" : "en";
    } catch {
        return "en";
    }
};

export type GuestRecoveryRequestInput = { orderId: string | number; email: string };
export type GuestRecoveryVerifyInput = GuestRecoveryRequestInput & { code: string };

@Injectable()
export class GuestOrderAccessRecoveryService {
    constructor(
        private readonly repository: GuestOrderAccessRecoveryRepository,
        @Optional() private readonly emails?: EmailService,
    ) {}

    async request(input: GuestRecoveryRequestInput): Promise<void> {
        if (!this.emails) return;
        const email = normalizeGuestRecoveryEmail(input.email);
        const emailHash = hashGuestOrderAccessRecoveryEmail(email);
        const challengeId = randomUUID();
        const code = randomInt(0, 10 ** GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH).toString().padStart(GUEST_ORDER_ACCESS_RECOVERY_OTP_LENGTH, "0");

        await this.repository.withTransaction(async (tx: TransactionContext) => {
            const order = await this.repository.findOrderForRequest(tx, input.orderId);
            if (!order || normalizeGuestRecoveryEmail(order.guest_email) !== email) return;

            const latest = await this.repository.findLatestChallenge(tx, order.id, emailHash);
            if (latest && new Date(latest.resend_after).getTime() > Date.now()) return;
            if (await this.repository.countRecentChallenges(tx, order.id, emailHash) >= GUEST_ORDER_ACCESS_RECOVERY_REQUESTS_PER_HOUR) return;

            await this.repository.invalidateChallenges(tx, order.id, emailHash);
            await this.repository.insertChallenge(tx, {
                id: challengeId,
                orderId: order.id,
                emailHash,
                otpHash: hashGuestOrderAccessRecoveryCode(challengeId, code),
            });
            await this.emails!.enqueue(tx, {
                eventKey: `guest-order-access-recovery:${challengeId}`,
                type: "guest_order_access_recovery",
                recipient: order.guest_email,
                locale: parseLocale(order.contact_snapshot),
                snapshot: { customerName: order.guest_name || "Customer", orderId: order.id, code, expiresMinutes: 10 },
            });
        });
    }

    async verify(input: GuestRecoveryVerifyInput): Promise<{ guestOrderToken: string } | null> {
        const email = normalizeGuestRecoveryEmail(input.email);
        const emailHash = hashGuestOrderAccessRecoveryEmail(email);
        const guestOrderToken = generateGuestOrderToken();
        const result = await this.repository.withTransaction(async (tx: TransactionContext) => {
            const challenge = await this.repository.findChallengeForVerification(tx, input.orderId, emailHash);
            if (!challenge || normalizeGuestRecoveryEmail(challenge.guest_email) !== email) return false;
            if (Number(challenge.attempt_count) >= GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS) return false;
            if (!matchesGuestOrderAccessRecoveryCode(challenge.id, input.code, challenge.otp_hash)) {
                await this.repository.recordFailedAttempt(tx, challenge.id, GUEST_ORDER_ACCESS_RECOVERY_MAX_ATTEMPTS);
                return false;
            }

            const rotated = await this.repository.rotateOrderToken(tx, {
                orderId: challenge.order_id,
                email,
                tokenHash: hashGuestOrderToken(guestOrderToken),
            });
            if (!rotated) return false;
            await this.repository.markChallengeUsed(tx, challenge.id);
            return true;
        });
        return result ? { guestOrderToken } : null;
    }
}
