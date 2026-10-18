import { ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { TransactionContext } from "#src/database/transaction";
import { CartMergeRepository, type CartMergeResult } from "./cart-merge.repository";

export type CartMergeInput = { operationId: string; items: Array<{ productId: number; quantity: number }> };

const normalizeItems = (items: CartMergeInput["items"]) => [...items]
    .map(({ productId, quantity }) => ({ productId: Number(productId), quantity: Number(quantity) }))
    .sort((left, right) => left.productId - right.productId);

const parseResult = (value: string | CartMergeResult): CartMergeResult => {
    const result = typeof value === "string" ? JSON.parse(value) as CartMergeResult : value;
    if (!result || !Array.isArray(result.accepted) || !Array.isArray(result.rejected)) throw new Error("Stored cart merge result is invalid");
    return result;
};

const idempotencyConflict = () => Object.assign(
    new ConflictException({ code: "CART_MERGE_IDEMPOTENCY_CONFLICT", message: "This cart merge operation ID was already used with different items." }),
    { code: "CART_MERGE_IDEMPOTENCY_CONFLICT" },
);

@Injectable()
export class CartMergeService {
    constructor(private readonly repository: CartMergeRepository) {}

    async merge(userId: string, input: CartMergeInput): Promise<CartMergeResult> {
        const items = normalizeItems(input.items);
        const payloadHash = createHash("sha256").update(JSON.stringify(items)).digest("hex");
        return this.repository.withTransaction(async (tx: TransactionContext) => {
            await this.repository.lockUser(tx, userId);
            const existing = await this.repository.findOperation(tx, userId, input.operationId);
            if (existing) {
                if (existing.payloadHash !== payloadHash) throw idempotencyConflict();
                return parseResult(existing.resultJson);
            }

            await this.repository.createOperation(tx, userId, input.operationId, payloadHash);
            const cartId = await this.repository.getOrCreateCart(tx, userId);
            const result: CartMergeResult = { accepted: [], rejected: [] };
            for (const item of items) {
                const product = await this.repository.getProductAvailability(tx, item.productId);
                if (!product) {
                    result.rejected.push({ ...item, reason: "unavailable" });
                    continue;
                }
                const currentQuantity = await this.repository.getCartQuantity(tx, cartId, item.productId);
                if (product.availableStock < currentQuantity + item.quantity || currentQuantity + item.quantity > 99) {
                    result.rejected.push({ ...item, reason: "insufficient_stock" });
                    continue;
                }
                await this.repository.addItems(tx, cartId, item.productId, item.quantity);
                result.accepted.push(item);
            }
            await this.repository.completeOperation(tx, userId, input.operationId, result);
            return result;
        });
    }
}
