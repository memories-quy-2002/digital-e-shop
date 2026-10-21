import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { getProductAlertTransitions } from "../product-alerts/product-alerts.policy";
import { ProductAlertsService } from "../product-alerts/product-alerts.service";
import type { ProductSnapshot } from "../product-alerts/product-alerts.types";
import { NestInventoryService } from "../inventory/inventory.service";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import { PurchaseReceiptsRepository, type ReceiptStockRow } from "./purchase-receipts.repository";
import type { PostReceiptInput } from "./purchase-receipts.types";
import { receiptPayloadHashInput, validateReceiptLines } from "./receipt.policy";

const hashPayload = (input: PostReceiptInput) => createHash("sha256").update(JSON.stringify(receiptPayloadHashInput(input))).digest("hex");
const isActivePurchaseOrder = (status: string) => status === "ORDERED" || status === "PARTIALLY_RECEIVED";

@Injectable()
export class PurchaseReceiptsService {
    constructor(
        private readonly repository: PurchaseReceiptsRepository,
        private readonly productAlerts: ProductAlertsService,
        private readonly inventory: NestInventoryService,
    ) {}

    async list(orderId: number, query: { page: number; limit: number }) {
        if (!await this.repository.existsOrder(orderId)) throw new AppError("Purchase order not found.", HTTP_STATUS.NOT_FOUND);
        return this.repository.list(orderId, query.page, query.limit);
    }

    async post(actorId: string, orderId: number, input: PostReceiptInput) {
        if (!actorId) throw new AppError("A verified admin actor is required.", HTTP_STATUS.BAD_REQUEST);
        const expectedHash = hashPayload(input);
        const receiptId = await this.repository.withTransaction(async (tx) => {
            // The PO row serializes receipt posts for the document, including idempotency retries.
            const order = await this.repository.lockPurchaseOrder(tx, orderId);
            if (!order) throw new AppError("Purchase order not found.", HTTP_STATUS.NOT_FOUND);
            const replay = await this.repository.findByIdempotencyKey(tx, orderId, input.idempotencyKey);
            if (replay) {
                if (replay.payloadHash !== expectedHash) throw new AppError("Idempotency key already identifies a different receipt payload.", HTTP_STATUS.CONFLICT, "IDEMPOTENCY_KEY_CONFLICT");
                return replay.receipt.id;
            }
            if (!isActivePurchaseOrder(order.status)) throw new AppError("Only open confirmed purchase orders can receive goods.", HTTP_STATUS.CONFLICT, "INVALID_PURCHASE_ORDER_STATE");
            const availableLines = order.lines.map((line) => ({
                purchaseOrderItemId: line.id, productId: line.productId, sku: line.sku, productName: line.productName,
                orderedQuantity: line.orderedQuantity, acceptedQuantity: line.acceptedQuantity, plannedUnitCostVnd: line.plannedUnitCostVnd,
            }));
            const receiptLines = validateReceiptLines(input.lines, availableLines);
            const acceptedByProduct = new Map<number, number>();
            for (const line of receiptLines) acceptedByProduct.set(line.productId, (acceptedByProduct.get(line.productId) || 0) + line.acceptedQuantity);
            const stockRows = await this.repository.getStockRowsForUpdate(tx, [...acceptedByProduct.keys()]);
            const stockById = new Map(stockRows.map((row) => [row.productId, row]));
            if (stockRows.length !== acceptedByProduct.size || stockRows.some((row) => row.stock < 0)) {
                throw new AppError("A purchase order product is no longer active.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
            }
            const totalCost = receiptLines.reduce((sum, line) => sum + line.unitCostVnd * line.acceptedQuantity, 0);
            if (!Number.isSafeInteger(totalCost)) throw new AppError("Receipt cost exceeds the safe VND range.", HTTP_STATUS.BAD_REQUEST);
            const id = await this.repository.createReceipt(tx, { orderId, key: input.idempotencyKey, payloadHash: expectedHash, actorId, note: input.note, totalCost });
            const createdLines = await this.repository.createReceiptLines(tx, id, receiptLines);
            const transitions = [] as ReturnType<typeof getProductAlertTransitions>;
            const movements: InventoryMovementInput[] = [];
            for (const { lineId, input: line } of createdLines) {
                const accepted = line.acceptedQuantity;
                if (!accepted) continue;
                const stock = stockById.get(line.productId) as ReceiptStockRow;
                const nextStock = await this.repository.addStock(tx, stock, accepted);
                movements.push({
                    productId: line.productId,
                    movementType: "purchase_receipt",
                    quantityChange: accepted,
                    stockBefore: stock.stock,
                    stockAfter: nextStock,
                    note: `Purchase receipt #${id}`,
                    actorId,
                    purchaseReceiptLineId: lineId,
                });
                const after: ProductSnapshot = { productId: stock.productId, price: stock.price, salePrice: stock.salePrice, stock: nextStock };
                transitions.push(...getProductAlertTransitions(stock, after));
                await tx.query("UPDATE purchase_order_items SET accepted_quantity = accepted_quantity + ? WHERE id = ? AND purchase_order_id = ?", [accepted, line.purchaseOrderItemId, orderId]);
            }
            if (movements.length) await this.inventory.createMovementsInTransaction(tx, movements);
            if (transitions.length) await this.productAlerts.recordTransitionsInTransaction(tx, transitions);
            await this.repository.updateOrderProgress(tx, orderId, order.version);
            await this.repository.audit(tx, actorId, id, orderId, {
                totalAcceptedCostVnd: totalCost,
                acceptedLines: createdLines.filter(({ input: line }) => line.acceptedQuantity > 0).length,
                acceptedQuantity: receiptLines.reduce((sum, line) => sum + line.acceptedQuantity, 0),
            });
            return id;
        });
        const receipt = await this.repository.getReceipt(receiptId);
        if (!receipt) throw new AppError("Receipt could not be loaded after posting.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return receipt;
    }
}
