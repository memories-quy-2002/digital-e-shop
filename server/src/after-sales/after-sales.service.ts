import { Injectable, Optional } from "@nestjs/common";
import { hashGuestOrderToken } from "../orders/guest-order-token";
import { PaymentProviderService } from "../payments/payment-provider.service";
import { PAYMENT_PROVIDER, PAYMENT_STATUS, type PaymentCurrency } from "../payments/payment.types";
import { assertTransition, evaluateEligibility } from "./after-sales.policy";
import {
    AFTER_SALES_ERROR_CODE,
    AFTER_SALES_STATUS,
    type AfterSalesErrorCode,
    type AfterSalesCreateInput,
    type AfterSalesGuestCreateInput,
    type AfterSalesListPage,
    type AfterSalesListQuery,
    type AfterSalesRequest,
    type AfterSalesStatus,
    type AfterSalesStatusTransition,
    type RefundConfirmationInput,
} from "./after-sales.types";
import { AfterSalesRepository } from "./after-sales.repository";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { OrderEmailService } from "../orders/order-email.service";

const domainError = (message: string, statusCode: number, code?: AfterSalesErrorCode) => Object.assign(new Error(message), { statusCode, code });

@Injectable()
export class AfterSalesService {
    constructor(
        private readonly repository: AfterSalesRepository,
        @Optional() private readonly paymentProvider?: PaymentProviderService,
        @Optional() private readonly orderEmails?: OrderEmailService,
    ) {}

    createCustomerRequest(userId: string, input: AfterSalesCreateInput): Promise<AfterSalesRequest> {
        return this.createRequest({ userId }, input);
    }

    createGuestRequest(input: AfterSalesGuestCreateInput): Promise<AfterSalesRequest> {
        const { guestOrderToken, ...request } = input;
        return this.createRequest({ guestOrderTokenHash: hashGuestOrderToken(guestOrderToken) }, request);
    }

    private createRequest(identity: { userId?: string; guestOrderTokenHash?: string }, input: AfterSalesCreateInput): Promise<AfterSalesRequest> {
        return this.repository.withTransaction(async (tx) => {
            const existing = await this.repository.findByIdempotencyKey(tx, input.idempotencyKey);
            if (existing) {
                const sameOwner = identity.userId
                    ? existing.userId === identity.userId
                    : existing.userId === null && existing.guestOrderTokenHash === identity.guestOrderTokenHash;
                let sameOrder = existing.orderId === input.orderId;
                if (!sameOrder && typeof input.orderId === "string") {
                    const referencedOrder = await this.repository.findOrderForIdentity(tx, {
                        orderId: input.orderId,
                        ...(identity.userId ? { userId: identity.userId } : { guestOrderTokenHash: identity.guestOrderTokenHash }),
                    });
                    sameOrder = referencedOrder?.id === existing.orderId;
                }
                const sameIdentity = sameOwner && sameOrder;
                if (sameIdentity) return existing;
                throw domainError("An after-sales request with this idempotency key already exists.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.IDEMPOTENCY_CONFLICT);
            }

            const order = await this.repository.findOrderForIdentity(tx, {
                orderId: input.orderId,
                ...(identity.userId ? { userId: identity.userId } : { guestOrderTokenHash: identity.guestOrderTokenHash }),
            });
            if (!order) throw domainError("Order not found or does not belong to this access context.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.ORDER_NOT_FOUND);
            const internalInput = { ...input, orderId: Number(order.id) };

            const itemIds = internalInput.items.map((item) => item.orderItemId);
            if (new Set(itemIds).size !== itemIds.length) throw domainError("Each order item may appear only once in a request.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.DUPLICATE_ITEM);
            const items = await this.repository.findOrderItemsForUpdate(tx, internalInput.orderId, itemIds);
            if (items.length !== itemIds.length) throw domainError("One or more selected order items do not belong to this order.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.ITEM_NOT_IN_ORDER);

            const activeQuantities = await this.repository.getActiveRequestedQuantities(tx, itemIds);
            for (const requested of internalInput.items) {
                const source = items.find((item) => item.id === requested.orderItemId);
                if (!source) throw domainError("One or more selected order items do not belong to this order.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.ITEM_NOT_IN_ORDER);
                const eligibility = evaluateEligibility({ kind: input.kind, orderStatus: order.orderStatus, deliveredAt: order.deliveredAt, warrantyMonths: source.warrantyMonths });
                if (!eligibility.eligible) throw domainError(eligibility.message || "The selected item is not eligible for after-sales processing.", HTTP_STATUS.CONFLICT, eligibility.code);
                const alreadyRequested = activeQuantities.get(source.id) || 0;
                if (requested.quantity + alreadyRequested > source.quantity) {
                    throw domainError("The requested quantity is no longer available for after-sales processing.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.QUANTITY_UNAVAILABLE);
                }
            }

            return this.repository.insertRequest(tx, identity, internalInput, items);
        });
    }

    listCustomerRequests(userId: string, query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.repository.listCustomerRequests(userId, query);
    }

    async listGuestRequests(orderId: string | number, guestOrderToken: string, query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        const guestOrderTokenHash = hashGuestOrderToken(guestOrderToken);
        return this.repository.withTransaction(async (tx) => {
            const order = await this.repository.findOrderForIdentity(tx, { orderId, guestOrderTokenHash });
            if (!order) throw domainError("Order not found or does not belong to this access context.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.ORDER_NOT_FOUND);
            return this.repository.listGuestRequests(Number(order.id), guestOrderTokenHash, query);
        });
    }

    listAdminRequests(query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.repository.listAdminRequests(query);
    }

    async getCustomerRequest(userId: string, id: string | number): Promise<AfterSalesRequest> {
        const request = await this.repository.getCustomerRequest(userId, id);
        if (!request) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
        return request;
    }

    async getGuestRequest(orderId: string | number, guestOrderToken: string, id: string | number): Promise<AfterSalesRequest> {
        const guestOrderTokenHash = hashGuestOrderToken(guestOrderToken);
        const order = await this.repository.withTransaction((tx) => this.repository.findOrderForIdentity(tx, { orderId, guestOrderTokenHash }));
        const request = order?.id == null ? null : await this.repository.getGuestRequest(Number(order.id), guestOrderTokenHash, id);
        if (!request) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
        return request;
    }

    async getAdminRequest(id: string | number): Promise<AfterSalesRequest> {
        const request = await this.repository.getAdminRequest(id);
        if (!request) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
        return request;
    }

    async transitionRequest(id: string | number, actorId: string, transition: AfterSalesStatusTransition): Promise<AfterSalesRequest> {
        const updated = await this.repository.withTransaction(async (tx) => {
            const current = await this.repository.getAdminRequestForUpdate(tx, id);
            if (!current) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
            assertTransition(current.status as AfterSalesStatus, transition.status);
            const updated = await this.repository.transitionRequest(tx, current.id, transition, actorId);
            if (!updated) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
            if (this.orderEmails && ["APPROVED", "REJECTED"].includes(transition.status)) await this.orderEmails.emit(tx, updated.orderId, "decision", { key: `after-sales:${current.id}:${transition.status}`, decision: transition.status === "APPROVED" ? "approved" : "rejected" });
            return updated;
        });
        return (await this.repository.getAdminRequest(id)) || updated;
    }

    async confirmRefund(id: string | number, actorId: string, input: RefundConfirmationInput): Promise<AfterSalesRequest> {
        const updated = await this.repository.withTransaction(async (tx) => {
            const context = await this.repository.getRefundContextForUpdate(tx, id);
            if (!context) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
            const current = context.request;
            if (current.status === AFTER_SALES_STATUS.REFUNDED) {
                if (current.refundReference === input.refundReference) return current;
                throw domainError("This after-sales request has already been refunded.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.REFUND_ALREADY_CONFIRMED);
            }
            if (current.status !== AFTER_SALES_STATUS.REFUND_PENDING && current.status !== AFTER_SALES_STATUS.RECEIVED) {
                throw domainError("Only received or refund-pending requests can be refunded.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.REFUND_NOT_READY);
            }
            if (!context.payment) throw domainError("No payment ledger exists for this order.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.PAYMENT_LEDGER_NOT_FOUND);
            const payment = context.payment;
            const refundableBalance = payment.amount - payment.refundedAmount;
            if (context.requestedAmount <= 0) throw domainError("The request has no refundable item value.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.REFUND_AMOUNT_INVALID);
            if (context.requestedAmount > refundableBalance) throw domainError("The requested refund exceeds the remaining payment balance.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.REFUND_AMOUNT_EXCEEDS_BALANCE);
            const currency = payment.currency.toUpperCase();
            if (input.currency.toUpperCase() !== currency) throw domainError("Refund currency must match the payment currency.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.REFUND_CURRENCY_MISMATCH);
            const isRefundable = payment.status === PAYMENT_STATUS.PAID || payment.status === PAYMENT_STATUS.PARTIALLY_REFUNDED;
            if (!isRefundable) throw domainError("The payment is not refundable in its current state.", HTTP_STATUS.CONFLICT, AFTER_SALES_ERROR_CODE.PAYMENT_NOT_REFUNDABLE);
            if (!this.paymentProvider) throw domainError("Refund provider is unavailable.", HTTP_STATUS.SERVICE_UNAVAILABLE, AFTER_SALES_ERROR_CODE.REFUND_PROVIDER_UNAVAILABLE);
            let providerResult;
            try {
                providerResult = await this.paymentProvider.refundPayment({
                    provider: payment.provider as typeof PAYMENT_PROVIDER[keyof typeof PAYMENT_PROVIDER],
                    orderId: payment.orderId,
                    paymentId: payment.providerPaymentId || payment.providerReference || String(payment.id),
                    amount: context.requestedAmount,
                    currency: currency as PaymentCurrency,
                    idempotencyKey: input.idempotencyKey,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "Refund provider failed";
                throw domainError(message, message.includes("not configured") ? HTTP_STATUS.SERVICE_UNAVAILABLE : HTTP_STATUS.BAD_GATEWAY, message.includes("not configured") ? AFTER_SALES_ERROR_CODE.REFUND_PROVIDER_UNAVAILABLE : AFTER_SALES_ERROR_CODE.REFUND_PROVIDER_FAILED);
            }
            if (providerResult.status !== PAYMENT_STATUS.REFUNDED) throw domainError("The payment provider did not confirm the refund.", HTTP_STATUS.BAD_GATEWAY, AFTER_SALES_ERROR_CODE.REFUND_PROVIDER_REJECTED);
            const updated = await this.repository.confirmRefund(tx, current.id, input, actorId, payment.id, context.requestedAmount, providerResult);
            if (!updated) throw domainError("After-sales request not found.", HTTP_STATUS.NOT_FOUND, AFTER_SALES_ERROR_CODE.REQUEST_NOT_FOUND);
            return updated;
        });
        return (await this.repository.getAdminRequest(id)) || updated;
    }
}
