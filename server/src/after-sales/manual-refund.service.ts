import { Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { EvidenceService } from "../operations/evidence.service";
import { EmailService } from "../transactional-email/email.service";
import type { EmailBusinessEvent } from "../transactional-email/email.types";
import { z } from "zod";
import { allocateRefundUnits, type RefundableUnit } from "./refund-allocation";
import {
    ManualRefundRepository, type ManualRefundRequest, type RefundableAllocation,
} from "./manual-refund.repository";

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const manualRefundInputSchema = z.object({
    idempotencyKey: z.string().trim().min(8).max(191),
    transferReference: z.string().trim().min(1).max(191),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }, "transferDate must be a real calendar date"),
    reviewedReason: z.string().trim().min(1).max(500),
    evidenceId: positiveInteger,
    currency: z.literal("VND"),
}).strict();
export type ManualRefundInput = z.infer<typeof manualRefundInputSchema>;

const refundError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const refundStates = new Set(["RECEIVED", "REFUND_PENDING"]);
const paymentStates = new Set(["paid", "partially_refunded"]);

const snapshotDiscount = (value: unknown, fallback: number): number => {
    if (!value || typeof value !== "object") return fallback;
    const amount = (value as Record<string, unknown>).merchandiseDiscount;
    return amount === undefined ? fallback : Number(amount);
};

@Injectable()
export class ManualRefundService {
    constructor(
        private readonly repository: ManualRefundRepository = new ManualRefundRepository(),
        private readonly evidence: EvidenceService,
        @Optional() private readonly emails?: EmailService,
    ) {}

    async confirm(requestId: number, actorId: string, input: ManualRefundInput): Promise<ManualRefundRequest> {
        if (!Number.isSafeInteger(requestId) || requestId < 1 || !actorId) throw refundError("A valid request and admin actor are required.", HTTP_STATUS.BAD_REQUEST);
        const evidence = await this.evidence.readForAdmin(input.evidenceId, actorId);
        try {
            return await this.repository.withTransaction(async (tx) => {
                const context = await this.repository.getContextForUpdate(tx, requestId);
                if (!context) throw refundError("After-sales request not found.", HTTP_STATUS.NOT_FOUND);
                const existing = await this.repository.findOperationByKey(tx, input.idempotencyKey);
                if (existing) {
                    const replay = existing.requestId === requestId && existing.actorId === actorId
                        && existing.transferReference === input.transferReference && existing.transferDate === input.transferDate
                        && existing.reviewedReason === input.reviewedReason && existing.evidenceId === evidence.id && existing.currency === input.currency;
                    if (!replay) throw refundError("Idempotency key already identifies a different refund operation.", HTTP_STATUS.CONFLICT);
                    return context.request;
                }
                if (await this.repository.findOperationByReference(tx, input.transferReference)) {
                    throw refundError("Transfer reference has already been used.", HTTP_STATUS.CONFLICT);
                }
                if (!refundStates.has(context.request.status)) throw refundError("Only received or refund-pending requests can be manually refunded.", HTTP_STATUS.CONFLICT);
                if (!context.payment) throw refundError("No payment ledger exists for this order.", HTTP_STATUS.CONFLICT);
                if (!paymentStates.has(context.payment.status) || context.payment.simulated === true || context.payment.simulated === 1 || !context.payment.paidAt) {
                    throw refundError("Refunds require an actually paid, non-simulated payment ledger.", HTTP_STATUS.CONFLICT);
                }
                if (context.order.currency !== "VND" || context.payment.currency !== "VND" || input.currency !== "VND") {
                    throw refundError("Manual refunds are supported only for VND payments.", HTTP_STATUS.CONFLICT);
                }
                const discount = snapshotDiscount(context.order.pricingSnapshot, context.order.discount);
                if (!Number.isSafeInteger(discount) || discount < 0) throw refundError("Order discount snapshot is invalid.", HTTP_STATUS.CONFLICT);
                const allocated: RefundableUnit[] = allocateRefundUnits(context.items.map((item) => ({
                    orderItemId: item.orderItemId, quantity: item.quantity, unitPrice: item.unitPrice,
                })), discount);
                const alreadyRefunded = new Set(context.refundedUnits.map((unit) => `${unit.orderItemId}:${unit.unitIndex}`));
                const targetQuantities = new Map(context.items.filter((item) => item.requestedQuantity > 0).map((item) => [item.orderItemId, item.requestedQuantity]));
                const used = new Map<number, number>();
                const units: RefundableAllocation[] = [];
                for (const unit of allocated) {
                    if (!targetQuantities.has(unit.orderItemId) || alreadyRefunded.has(`${unit.orderItemId}:${unit.unitIndex}`)) continue;
                    const selected = used.get(unit.orderItemId) || 0;
                    if (selected >= (targetQuantities.get(unit.orderItemId) || 0)) continue;
                    units.push(unit);
                    used.set(unit.orderItemId, selected + 1);
                }
                for (const [itemId, requestedQuantity] of targetQuantities) {
                    if ((used.get(itemId) || 0) !== requestedQuantity) throw refundError("One or more requested item units have already been refunded.", HTTP_STATUS.CONFLICT);
                }
                const amountVnd = units.reduce((sum, unit) => sum + unit.netVnd, 0);
                if (!Number.isSafeInteger(amountVnd) || amountVnd < 1) throw refundError("Refund amount must be a positive safe integer VND amount.", HTTP_STATUS.CONFLICT);
                if (amountVnd > context.payment.amount - context.payment.refundedAmount) throw refundError("Refund exceeds the remaining actually paid balance.", HTTP_STATUS.CONFLICT);
                const operation = { ...input, requestId, orderPaymentId: context.payment.id, actorId, amountVnd };
                await this.repository.insertOperation(tx, operation, units);
                const result = await this.repository.completeRefund(tx, {
                    ...input, amountVnd, requestId, orderId: context.request.orderId, requestReason: context.request.reason || "",
                    paymentId: context.payment.id, actorId, fromStatus: context.request.status,
                });
                if (this.emails && context.order.contactEmail) {
                    const event: EmailBusinessEvent = {
                        type: "refund_confirmation",
                        eventKey: `refund-${requestId}-${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32)}`,
                        recipient: context.order.contactEmail,
                        locale: context.order.contactLocale || "en",
                        snapshot: {
                            orderNumber: String(context.order.id),
                            customerName: context.order.contactName || "Customer",
                            refundAmount: amountVnd,
                            currency: "VND",
                        },
                    };
                    await this.emails.enqueue(tx, event);
                }
                return result;
            });
        } catch (error) {
            if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw refundError("Refund idempotency key or transfer reference has already been used.", HTTP_STATUS.CONFLICT);
            throw error;
        }
    }
}
