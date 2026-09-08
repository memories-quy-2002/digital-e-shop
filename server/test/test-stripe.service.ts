import { Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { StripeService } from "../src/stripe/stripe.service";

@Injectable()
export class TestStripeService extends StripeService {
    private sessionSequence = 0;

    readonly expiredSessionIds: string[] = [];

    override createCheckoutSession(
        params: Stripe.Checkout.SessionCreateParams,
    ): Promise<Stripe.Checkout.Session> {
        this.sessionSequence += 1;
        const id = `cs_test_${String(this.sessionSequence).padStart(6, "0")}`;

        return Promise.resolve({
            id,
            object: "checkout.session",
            mode: "payment",
            status: "open",
            url: `https://checkout.stripe.test/${id}`,
            ...params,
        } as Stripe.Checkout.Session);
    }

    override expireCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
        this.expiredSessionIds.push(sessionId);

        return Promise.resolve({
            id: sessionId,
            object: "checkout.session",
            status: "expired",
        } as Stripe.Checkout.Session);
    }

    override constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
        void signature;
        return JSON.parse(payload.toString("utf8")) as Stripe.Event;
    }
}
