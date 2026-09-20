import { Injectable } from "@nestjs/common";
import { hashGuestOrderToken } from "../orders/guest-order-token";
import { assertTransition, evaluateEligibility } from "./after-sales.policy";
import type {
    AfterSalesCreateInput,
    AfterSalesGuestCreateInput,
    AfterSalesListPage,
    AfterSalesListQuery,
    AfterSalesRequest,
    AfterSalesStatus,
    AfterSalesStatusTransition,
    RefundConfirmationInput,
} from "./after-sales.types";
import type { AfterSalesRepositoryPort } from "./after-sales.repository";

const domainError = (message: string, statusCode: number, code?: string) => Object.assign(new Error(message), { statusCode, code });

@Injectable()
export class AfterSalesService {
    constructor(private readonly repository: AfterSalesRepositoryPort) {}

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
                const sameIdentity = existing.orderId === input.orderId &&
                    (identity.userId
                        ? existing.userId === identity.userId
                        : existing.userId === null && existing.guestOrderTokenHash === identity.guestOrderTokenHash);
                if (sameIdentity) return existing;
                throw domainError("An after-sales request with this idempotency key already exists.", 409, "IDEMPOTENCY_CONFLICT");
            }

            const order = await this.repository.findOrderForIdentity(tx, {
                orderId: input.orderId,
                ...(identity.userId ? { userId: identity.userId } : { guestOrderTokenHash: identity.guestOrderTokenHash }),
            });
            if (!order) throw domainError("Order not found or does not belong to this access context.", 404, "ORDER_NOT_FOUND");

            const itemIds = input.items.map((item) => item.orderItemId);
            if (new Set(itemIds).size !== itemIds.length) throw domainError("Each order item may appear only once in a request.", 409, "DUPLICATE_ITEM");
            const items = await this.repository.findOrderItemsForUpdate(tx, input.orderId, itemIds);
            if (items.length !== itemIds.length) throw domainError("One or more selected order items do not belong to this order.", 409, "ITEM_NOT_IN_ORDER");

            const activeQuantities = await this.repository.getActiveRequestedQuantities(tx, itemIds);
            for (const requested of input.items) {
                const source = items.find((item) => item.id === requested.orderItemId);
                if (!source) throw domainError("One or more selected order items do not belong to this order.", 409, "ITEM_NOT_IN_ORDER");
                const eligibility = evaluateEligibility({ kind: input.kind, orderStatus: order.orderStatus, deliveredAt: order.deliveredAt, warrantyMonths: source.warrantyMonths });
                if (!eligibility.eligible) throw domainError(eligibility.message || "The selected item is not eligible for after-sales processing.", 409, eligibility.code);
                const alreadyRequested = activeQuantities.get(source.id) || 0;
                if (requested.quantity + alreadyRequested > source.quantity) {
                    throw domainError("The requested quantity is no longer available for after-sales processing.", 409, "QUANTITY_UNAVAILABLE");
                }
            }

            return this.repository.insertRequest(tx, identity, input, items);
        });
    }

    listCustomerRequests(userId: string, query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.repository.listCustomerRequests(userId, query);
    }

    listGuestRequests(orderId: number, guestOrderToken: string, query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.repository.listGuestRequests(orderId, hashGuestOrderToken(guestOrderToken), query);
    }

    listAdminRequests(query: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.repository.listAdminRequests(query);
    }

    async getCustomerRequest(userId: string, id: number): Promise<AfterSalesRequest> {
        const request = await this.repository.getCustomerRequest(userId, id);
        if (!request) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
        return request;
    }

    async getGuestRequest(orderId: number, guestOrderToken: string, id: number): Promise<AfterSalesRequest> {
        const request = await this.repository.getGuestRequest(orderId, hashGuestOrderToken(guestOrderToken), id);
        if (!request) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
        return request;
    }

    async getAdminRequest(id: number): Promise<AfterSalesRequest> {
        const request = await this.repository.getAdminRequest(id);
        if (!request) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
        return request;
    }

    async transitionRequest(id: number, actorId: string, transition: AfterSalesStatusTransition): Promise<AfterSalesRequest> {
        return this.repository.withTransaction(async (tx) => {
            const current = await this.repository.getAdminRequestForUpdate(tx, id);
            if (!current) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
            assertTransition(current.status as AfterSalesStatus, transition.status);
            const updated = await this.repository.transitionRequest(tx, id, transition, actorId);
            if (!updated) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
            return updated;
        });
    }

    async confirmRefund(id: number, actorId: string, input: RefundConfirmationInput): Promise<AfterSalesRequest> {
        return this.repository.withTransaction(async (tx) => {
            const current = await this.repository.getAdminRequestForUpdate(tx, id);
            if (!current) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
            if (current.status === "REFUNDED") {
                if (current.refundReference === input.refundReference) return current;
                throw domainError("This after-sales request has already been refunded.", 409, "REFUND_ALREADY_CONFIRMED");
            }
            if (current.status !== "REFUND_PENDING" && current.status !== "RECEIVED") {
                throw domainError("Only received or refund-pending requests can be refunded.", 409, "REFUND_NOT_READY");
            }
            const updated = await this.repository.confirmRefund(tx, id, input, actorId);
            if (!updated) throw domainError("After-sales request not found.", 404, "REQUEST_NOT_FOUND");
            return updated;
        });
    }
}
