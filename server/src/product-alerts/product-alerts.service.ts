import { BadRequestException, Injectable } from "@nestjs/common";
import type { TransactionContext } from "#src/database/transaction";
import type { ProductAlertUpdateInput } from "./product-alerts.dto";
import { ProductAlertsRepository } from "./product-alerts.repository";
import type { ProductAlertPreference, ProductAlertTransition } from "./product-alerts.types";

const assertProductId = (productId: number): void => {
    if (!Number.isInteger(productId) || productId <= 0) {
        throw new BadRequestException({ msg: "Product id must be a positive integer" });
    }
};

@Injectable()
export class ProductAlertsService {
    constructor(private readonly productAlertsRepository: ProductAlertsRepository) {}

    getForUser(uid: string): Promise<ProductAlertPreference[]> {
        return this.productAlertsRepository.listByUser(uid);
    }

    async getForProduct(uid: string, productId: number): Promise<ProductAlertPreference> {
        assertProductId(productId);
        return (await this.productAlertsRepository.findByUserAndProduct(uid, productId)) || {
            productId,
            priceDropEnabled: false,
            backInStockEnabled: false,
        };
    }

    async updateForUser(
        uid: string,
        productId: number,
        input: ProductAlertUpdateInput,
    ): Promise<ProductAlertPreference> {
        assertProductId(productId);
        return this.productAlertsRepository.savePreference(uid, productId, input);
    }

    recordTransitionsInTransaction(
        tx: TransactionContext,
        transitions: ProductAlertTransition[],
    ): Promise<void> {
        return this.productAlertsRepository.recordTransitionsInTransaction(tx, transitions);
    }
}
