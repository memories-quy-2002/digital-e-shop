import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { GuestOrderAccessRecoveryService } from "./guest-order-access-recovery.service";
import {
    guestOrderAccessRecoveryRequestSchema,
    guestOrderAccessRecoveryVerifySchema,
    type GuestOrderAccessRecoveryRequest,
    type GuestOrderAccessRecoveryVerify,
} from "./guest-order-access-recovery.validator";

const genericMessage = "If the order details match, a verification code will be sent to the guest order email.";

@Controller("orders/guest/access-recovery")
export class GuestOrderAccessRecoveryController {
    constructor(private readonly service: GuestOrderAccessRecoveryService) {}

    @Post("request")
    @HttpCode(HTTP_STATUS.OK)
    async request(@Body(new ZodValidationPipe(guestOrderAccessRecoveryRequestSchema)) body: GuestOrderAccessRecoveryRequest) {
        try { await this.service.request(body); } catch { /* Keep the response independent of order and email validity. */ }
        return { message: genericMessage, msg: genericMessage };
    }

    @Post("verify")
    @HttpCode(HTTP_STATUS.OK)
    async verify(@Body(new ZodValidationPipe(guestOrderAccessRecoveryVerifySchema)) body: GuestOrderAccessRecoveryVerify) {
        try {
            const result = await this.service.verify(body);
            if (!result) return { verified: false, message: "The code could not be verified. Request a new code and try again." };
            return { verified: true, guestOrderToken: result.guestOrderToken, message: "Guest order access restored." };
        } catch {
            return { verified: false, message: "The code could not be verified. Request a new code and try again." };
        }
    }
}
