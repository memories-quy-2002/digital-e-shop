import { Injectable, Optional } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import { withTransaction } from "../database/transaction";
import { OrdersRepository } from "./orders.repository";
import { NestOrderTimelineService } from "./orders.timeline.service";
import { NestInventoryService } from "../inventory/inventory.service";
import { ProductAlertsService } from "../product-alerts/product-alerts.service";
import { getProductAlertTransitions } from "../product-alerts/product-alerts.policy";
import { createCheckoutError } from "./orders.errors";

@Injectable()
export class NestOrdersCancellationService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly orderTimelineService: NestOrderTimelineService,
        private readonly inventoryService: NestInventoryService,
        @Optional() private readonly productAlertsService?: ProductAlertsService,
    ) {}

    async cancelOrder(orderId: number, actorId: string, admin = false, reason?: string): Promise<{ userId: string | null; changed: boolean }> {
        return withTransaction(async (tx) => {
            const order = await this.ordersRepository.getOrderLifecycleForUpdate(tx, orderId);
            if (!order) throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
            if (!admin && String(order.user_id) !== String(actorId)) throw createCheckoutError("You cannot cancel this order", HTTP_STATUS.FORBIDDEN);
            if (Number(order.status) === ORDER_STATUS.CANCELED) return { userId: order.user_id, changed: false };
            if (Number(order.status) !== ORDER_STATUS.PENDING) throw createCheckoutError("Only pending orders can be canceled", HTTP_STATUS.CONFLICT);
            if (!order.inventory_restored_at) {
                const items = await this.ordersRepository.getOrderItemsForUpdate(tx, orderId);
                const lockedProducts = await this.ordersRepository.getRestockProductsForUpdate(
                    tx,
                    items.map((item) => item.product_id),
                );
                const productsById = new Map(lockedProducts.map((product) => [product.id, product]));
                const currentStockById = new Map(lockedProducts.map((product) => [product.id, Number(product.stock)]));
                const movements: InventoryMovementInput[] = [];
                for (const item of items) {
                    const product = productsById.get(item.product_id);
                    if (!product) throw createCheckoutError("Product for this order no longer exists", HTTP_STATUS.CONFLICT);
                    const stockBefore = currentStockById.get(item.product_id)!;
                    const quantity = Number(item.quantity) || 0;
                    const stockUpdate = await this.ordersRepository.incrementProductStockInTransaction(tx, item.product_id, quantity);
                    if (stockUpdate.affectedRows !== 1) {
                        throw createCheckoutError("Product stock could not be restored", HTTP_STATUS.CONFLICT);
                    }
                    const stockAfter = stockBefore + quantity;
                    currentStockById.set(item.product_id, stockAfter);
                    if (this.productAlertsService) {
                        const transitions = getProductAlertTransitions(
                            {
                                productId: item.product_id,
                                price: Number(product.price),
                                salePrice: product.sale_price === null || product.sale_price === undefined ? null : Number(product.sale_price),
                                stock: stockBefore,
                            },
                            {
                                productId: item.product_id,
                                price: Number(product.price),
                                salePrice: product.sale_price === null || product.sale_price === undefined ? null : Number(product.sale_price),
                                stock: stockAfter,
                            },
                        );
                        if (transitions.length > 0) {
                            await this.productAlertsService.recordTransitionsInTransaction(tx, transitions);
                        }
                    }
                    movements.push({ productId: item.product_id, orderId, movementType: "restock_cancelled_order", quantityChange: quantity,
                        stockBefore, stockAfter,
                        note: `Stock restored for canceled order #${orderId}`, actorId });
                }
                if (movements.length > 0) await this.inventoryService.createMovementsInTransaction(tx, movements);
            }
            await this.ordersRepository.cancelOrderInTransaction(tx, orderId, reason || null);
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId, status: ORDER_STATUS.CANCELED, note: reason ? `Order canceled: ${reason}` : "Order was canceled.", actorId,
            });
            return { userId: order.user_id, changed: true };
        });
    }
}
