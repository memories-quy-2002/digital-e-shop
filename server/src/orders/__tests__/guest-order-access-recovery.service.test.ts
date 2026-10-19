import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { GuestOrderAccessRecoveryController } from "../guest-order-access-recovery.controller";
import { GuestOrderAccessRecoveryRepository } from "../guest-order-access-recovery.repository";
import { GuestOrderAccessRecoveryService } from "../guest-order-access-recovery.service";
import { hashGuestOrderToken } from "../guest-order-token";

const order = {
    id: 42,
    guest_email: "buyer@example.test",
    guest_name: "Buyer",
    contact_snapshot: { locale: "vi" },
};

describe("guest order access recovery", () => {
    it("resolves its repository through Nest dependency injection", async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [GuestOrderAccessRecoveryRepository, GuestOrderAccessRecoveryService],
        }).compile();

        expect(moduleRef.get(GuestOrderAccessRecoveryService)).toBeInstanceOf(GuestOrderAccessRecoveryService);
        await moduleRef.close();
    });

    let challenge: { id: string; order_id: number; email_hash: string; otp_hash: string; attempt_count: number; guest_email: string } | null;
    let tx: object;
    let repository: Record<string, ReturnType<typeof vi.fn>>;
    let emails: { enqueue: ReturnType<typeof vi.fn> };
    let service: GuestOrderAccessRecoveryService;

    beforeEach(() => {
        challenge = null;
        tx = {};
        repository = {
            withTransaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx)),
            findOrderForRequest: vi.fn().mockResolvedValue(order),
            findLatestChallenge: vi.fn().mockResolvedValue(null),
            countRecentChallenges: vi.fn().mockResolvedValue(0),
            invalidateChallenges: vi.fn().mockResolvedValue(undefined),
            insertChallenge: vi.fn(async (_tx, value) => { challenge = {
                id: value.id,
                order_id: value.orderId,
                email_hash: value.emailHash,
                otp_hash: value.otpHash,
                attempt_count: 0,
                guest_email: order.guest_email,
            }; }),
            findChallengeForVerification: vi.fn(async () => challenge),
            recordFailedAttempt: vi.fn(async () => { if (challenge) challenge.attempt_count += 1; }),
            rotateOrderToken: vi.fn().mockResolvedValue(true),
            markChallengeUsed: vi.fn(async () => { challenge = null; }),
        };
        emails = { enqueue: vi.fn().mockResolvedValue(1) };
        service = new GuestOrderAccessRecoveryService(repository as never, emails as never);
    });

    it("sends an OTP only to a matching guest order email and stores only a digest", async () => {
        await service.request({ orderId: 42, email: "BUYER@example.test" });

        expect(repository.insertChallenge).toHaveBeenCalledWith(tx, expect.objectContaining({
            orderId: 42,
            emailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            otpHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }));
        const emailEvent = emails.enqueue.mock.calls[0][1];
        expect(emailEvent).toMatchObject({ type: "guest_order_access_recovery", recipient: order.guest_email, locale: "vi" });
        expect(emailEvent.snapshot.code).toMatch(/^\d{6}$/);
        expect(emailEvent.eventKey).not.toContain(emailEvent.snapshot.code);
        expect(JSON.stringify(challenge)).not.toContain(emailEvent.snapshot.code);

        repository.findOrderForRequest.mockResolvedValueOnce(null);
        await service.request({ orderId: 999, email: "buyer@example.test" });
        expect(emails.enqueue).toHaveBeenCalledTimes(1);
    });

    it("keeps resend and hourly limits on the server", async () => {
        repository.findLatestChallenge.mockResolvedValueOnce({ resend_after: new Date(Date.now() + 60_000) });
        await service.request({ orderId: 42, email: order.guest_email });
        expect(repository.insertChallenge).not.toHaveBeenCalled();

        repository.findLatestChallenge.mockResolvedValueOnce(null);
        repository.countRecentChallenges.mockResolvedValueOnce(3);
        await service.request({ orderId: 42, email: order.guest_email });
        expect(repository.insertChallenge).not.toHaveBeenCalled();
    });

    it("rotates the order and after-sales capability in one transaction and returns it once", async () => {
        await service.request({ orderId: 42, email: order.guest_email });
        const code = emails.enqueue.mock.calls[0][1].snapshot.code as string;
        const challengeId = challenge!.id;

        const result = await service.verify({ orderId: 42, email: order.guest_email, code });

        expect(result?.guestOrderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(repository.rotateOrderToken).toHaveBeenCalledWith(tx, {
            orderId: 42,
            email: order.guest_email,
            tokenHash: hashGuestOrderToken(result!.guestOrderToken),
        });
        expect(repository.markChallengeUsed).toHaveBeenCalledWith(tx, challengeId);
        expect(await service.verify({ orderId: 42, email: order.guest_email, code })).toBeNull();
    });

    it("counts wrong codes and refuses further verification after five attempts", async () => {
        await service.request({ orderId: 42, email: order.guest_email });
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await expect(service.verify({ orderId: 42, email: order.guest_email, code: "999999" })).resolves.toBeNull();
        }
        expect(repository.recordFailedAttempt).toHaveBeenCalledTimes(5);
        await expect(service.verify({ orderId: 42, email: order.guest_email, code: "999999" })).resolves.toBeNull();
        expect(repository.recordFailedAttempt).toHaveBeenCalledTimes(5);
    });

    it("keeps challenges and token rotation bound to the numeric order when using a public reference", async () => {
        const publicId = "0199fbb1-1234-7123-8123-123456789abc";
        await service.request({ orderId: publicId, email: order.guest_email });
        expect(repository.findOrderForRequest).toHaveBeenCalledWith(tx, publicId);
        expect(repository.insertChallenge).toHaveBeenCalledWith(tx, expect.objectContaining({ orderId: 42 }));
        const code = emails.enqueue.mock.calls[0][1].snapshot.code as string;
        await service.verify({ orderId: publicId, email: order.guest_email, code });
        expect(repository.findChallengeForVerification).toHaveBeenCalledWith(tx, publicId, expect.any(String));
        expect(repository.rotateOrderToken).toHaveBeenCalledWith(tx, expect.objectContaining({ orderId: 42 }));
    });

    it("returns the same request response for an unknown order", async () => {
        const controller = new GuestOrderAccessRecoveryController(service);
        repository.findOrderForRequest.mockResolvedValue(null);
        const response = await controller.request({ orderId: 42, email: "nobody@example.test" });

        expect(response).toEqual({
            message: "If the order details match, a verification code will be sent to the guest order email.",
            msg: "If the order details match, a verification code will be sent to the guest order email.",
        });
    });
});
