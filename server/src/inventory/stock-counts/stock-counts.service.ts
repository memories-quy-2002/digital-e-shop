import { Injectable } from "@nestjs/common";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { getProductAlertTransitions } from "../../product-alerts/product-alerts.policy";
import { ProductAlertsService } from "../../product-alerts/product-alerts.service";
import { NestInventoryService } from "../inventory.service";
import type { InventoryMovementInput } from "../inventory.dto";
import { StockCountsRepository } from "./stock-counts.repository";
import type { CountActionInput, CreateStockCountInput, StockCount, StockCountQuery, UpdateCountInput } from "./stock-counts.types";
import { assertCountComplete, assertDiscrepancyReasons, evaluateStockCount } from "./stock-counts.policy";

type CountAction = "submit" | "reopen" | "approve" | "cancel";
const isValidStatus = (value: unknown): string => String(value || "");

@Injectable()
export class StockCountsService {
    constructor(
        private readonly repository: StockCountsRepository,
        private readonly productAlerts: ProductAlertsService,
        private readonly inventory: NestInventoryService,
    ) {}

    list(query: StockCountQuery) { return this.repository.list(query); }

    async get(id: number): Promise<StockCount> {
        const count = await this.repository.get(id);
        if (!count) throw new AppError("Stock count not found.", HTTP_STATUS.NOT_FOUND);
        return count;
    }

    async create(actorId: string, input: CreateStockCountInput): Promise<StockCount> {
        if (!actorId) throw new AppError("A verified admin actor is required.", HTTP_STATUS.BAD_REQUEST);
        const id = await this.repository.withTransaction(async (tx) => {
            const products = await this.repository.lockProducts(tx, input.productIds);
            if (products.length !== input.productIds.length || products.some((product) => !product.active)) {
                throw new AppError("Every stock count product must be active.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
            }
            return this.repository.create(tx, actorId, input.note, products);
        });
        return this.get(id);
    }

    async update(actorId: string, id: number, input: UpdateCountInput): Promise<StockCount> {
        await this.repository.withTransaction(async (tx) => {
            const header = await this.repository.lockHeader(tx, id);
            if (!header) throw new AppError("Stock count not found.", HTTP_STATUS.NOT_FOUND);
            if (isValidStatus(header.status) !== "DRAFT") throw new AppError("Only draft stock counts can be edited.", HTTP_STATUS.CONFLICT, "INVALID_STOCK_COUNT_STATE");
            if (Number(header.version) !== input.version) throw new AppError("Stock count changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            const lines = await this.repository.lockItems(tx, id);
            const changed = input.observations.map((observation) => {
                const current = lines.find((line) => line.id === observation.itemId);
                if (!current) throw new AppError("One or more count lines do not belong to this session.", HTTP_STATUS.BAD_REQUEST);
                return { ...current, countedQuantity: observation.countedQuantity, reason: observation.reason || null };
            });
            assertDiscrepancyReasons(changed);
            await this.repository.saveObservations(tx, id, input.observations);
            const result = await tx.query<{ affectedRows?: number }>("UPDATE stock_counts SET version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [id, input.version]);
            if (result.affectedRows !== 1) throw new AppError("Stock count changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            await this.repository.audit(tx, actorId, "stock_count.observations_saved", id, null, { observationCount: input.observations.length });
        });
        return this.get(id);
    }

    async transition(actorId: string, id: number, action: CountAction, input: CountActionInput): Promise<StockCount> {
        if (action === "reopen" && (!input.itemIds?.length || !input.reason?.trim())) throw new AppError("Choose count lines and provide a recount reason.", HTTP_STATUS.BAD_REQUEST);
        if (action === "cancel" && !input.reason?.trim()) throw new AppError("A cancellation reason is required.", HTTP_STATUS.BAD_REQUEST);

        await this.repository.withTransaction(async (tx) => {
            const header = await this.repository.lockHeader(tx, id);
            if (!header) throw new AppError("Stock count not found.", HTTP_STATUS.NOT_FOUND);
            const status = isValidStatus(header.status);
            if (action === "approve" && status === "APPROVED") return; // Idempotent retry after a lost response.
            if (action === "cancel" && status === "CANCELED") return;
            if (Number(header.version) !== input.version) throw new AppError("Stock count changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            const items = await this.repository.lockItems(tx, id);

            if (action === "submit") {
                if (status !== "DRAFT") throw new AppError("Only draft stock counts can be submitted.", HTTP_STATUS.CONFLICT, "INVALID_STOCK_COUNT_STATE");
                assertCountComplete(items);
                assertDiscrepancyReasons(items);
                await tx.query("UPDATE stock_counts SET status = 'SUBMITTED', submitted_by_id = ?, submitted_at = UTC_TIMESTAMP(3), version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [actorId, id, input.version]);
                await this.repository.audit(tx, actorId, "stock_count.submitted", id, null, { itemCount: items.length });
                return;
            }

            if (action === "cancel") {
                if (status !== "DRAFT" && status !== "SUBMITTED") throw new AppError("Only draft or submitted stock counts can be canceled.", HTTP_STATUS.CONFLICT, "INVALID_STOCK_COUNT_STATE");
                await tx.query("UPDATE stock_counts SET status = 'CANCELED', canceled_by_id = ?, canceled_reason = ?, canceled_at = UTC_TIMESTAMP(3), version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [actorId, input.reason, id, input.version]);
                await this.repository.audit(tx, actorId, "stock_count.canceled", id, input.reason || null, { status: { before: status, after: "CANCELED" } });
                return;
            }

            if (action === "reopen") {
                if (status !== "SUBMITTED") throw new AppError("Only submitted stock counts can be reopened for recount.", HTTP_STATUS.CONFLICT, "INVALID_STOCK_COUNT_STATE");
                const selected = [...new Set(input.itemIds || [])].sort((a, b) => a - b);
                const selectedLines = items.filter((item) => selected.includes(item.id));
                if (selectedLines.length !== selected.length) throw new AppError("One or more selected lines do not belong to this count.", HTTP_STATUS.BAD_REQUEST);
                const products = await this.repository.lockProducts(tx, selectedLines.map((item) => item.productId));
                if (products.length !== selectedLines.length || products.some((product) => !product.active)) throw new AppError("An inactive product cannot be recounted.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
                await this.repository.reopenItems(tx, id, items, products, selected, actorId, input.reason || "");
                await tx.query("UPDATE stock_counts SET status = 'DRAFT', submitted_by_id = NULL, submitted_at = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [id, input.version]);
                return;
            }

            if (action !== "approve") return;
            if (status !== "SUBMITTED") throw new AppError("Only submitted stock counts can be approved.", HTTP_STATUS.CONFLICT, "INVALID_STOCK_COUNT_STATE");
            assertCountComplete(items);
            assertDiscrepancyReasons(items);
            const products = await this.repository.lockProducts(tx, items.map((item) => item.productId));
            const productById = new Map(products.map((product) => [product.productId, product]));
            const reservations = await this.repository.activeReservations(tx, items.map((item) => item.productId));
            const current = items.map((item) => {
                const product = productById.get(item.productId);
                return {
                    ...item,
                    currentStock: product?.stock ?? -1,
                    currentRevision: product?.stockRevision ?? "0",
                    activeReservedQuantity: reservations.get(item.productId) || 0,
                    active: Boolean(product?.active),
                };
            });
            const conflicts = evaluateStockCount(current);
            if (conflicts.length) throw new AppError("Stock changed or active reservations exceed one or more counted quantities. Recount the affected products.", HTTP_STATUS.CONFLICT, "STOCK_COUNT_CONFLICT", { items: conflicts });

            const transitions = [] as ReturnType<typeof getProductAlertTransitions>;
            const movements: InventoryMovementInput[] = [];
            for (const item of items) {
                const product = productById.get(item.productId);
                if (!product || item.countedQuantity === null) throw new AppError("Stock count product could not be loaded.", HTTP_STATUS.CONFLICT, "STOCK_COUNT_CONFLICT");
                await this.repository.writeCountedStock(tx, item, product);
                if (item.countedQuantity !== product.stock) {
                    movements.push({
                        productId: item.productId,
                        movementType: "stock_count",
                        quantityChange: item.countedQuantity - product.stock,
                        stockBefore: product.stock,
                        stockAfter: item.countedQuantity,
                        note: `Stock count #${id}`,
                        actorId,
                        stockCountItemId: item.id,
                    });
                    transitions.push(...getProductAlertTransitions(product, { productId: product.productId, price: product.price, salePrice: product.salePrice, stock: item.countedQuantity }));
                }
            }
            if (movements.length) await this.inventory.createMovementsInTransaction(tx, movements);
            if (transitions.length) await this.productAlerts.recordTransitionsInTransaction(tx, transitions);
            const update = await tx.query<{ affectedRows?: number }>("UPDATE stock_counts SET status = 'APPROVED', approved_by_id = ?, approved_at = UTC_TIMESTAMP(3), version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?", [actorId, id, input.version]);
            if (update.affectedRows !== 1) throw new AppError("Stock count changed during approval.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            await this.repository.audit(tx, actorId, "stock_count.approved", id, null, { differences: items.filter((item) => item.countedQuantity !== item.baselineStock).map((item) => ({ itemId: item.id, productId: item.productId, before: item.baselineStock, after: item.countedQuantity })) });
        });
        return this.get(id);
    }
}
