import { Injectable } from "@nestjs/common";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { PurchaseOrdersRepository } from "./purchase-orders.repository";
import type { CreatePurchaseOrderInput, DocumentActionInput, UpdatePurchaseOrderInput } from "./purchase-orders.types";

@Injectable()
export class PurchaseOrdersService {
    constructor(private readonly repository: PurchaseOrdersRepository) {}

    list(query: { page: number; limit: number; search: string; status: string; supplierId?: number }) {
        return this.repository.list(query.page, query.limit, query.search, query.status, query.supplierId);
    }

    async get(id: number) {
        const order = await this.repository.getDetail(id);
        if (!order) throw new AppError("Purchase order not found.", HTTP_STATUS.NOT_FOUND);
        return order;
    }

    async create(actorId: string, input: CreatePurchaseOrderInput) {
        if (!actorId) throw new AppError("A verified admin actor is required.", HTTP_STATUS.BAD_REQUEST);
        return this.repository.create(actorId, input);
    }

    async updateDraft(actorId: string, id: number, input: UpdatePurchaseOrderInput) {
        return this.repository.updateDraft(actorId, id, input);
    }

    transition(actorId: string, id: number, action: "confirm" | "cancel" | "close", input: DocumentActionInput) {
        if ((action === "cancel" || action === "close") && !input.reason?.trim()) {
            throw new AppError("A reason is required for this action.", HTTP_STATUS.BAD_REQUEST);
        }
        return this.repository.transition(actorId, id, action, input);
    }
}
