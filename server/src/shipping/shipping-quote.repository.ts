import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { CartItemRow } from "../cart/cart.types";
import { estimateParcel } from "./shipping-quote.policy";
import type { ShippingParcel } from "./shipping.types";

export type QuoteRow = {
    id: string; fingerprint: string; pricing: string | object; address: string | object;
    parcel: string | object; service_type_id: number; provider: string;
    expires_at: Date; consumed_at: Date | null;
};
@Injectable()
export class ShippingQuoteRepository {
    async parcelForCart(tx: TransactionContext, cart: CartItemRow[]) {
        const ids = [...new Set(cart.map((item) => Number(item.product_id)))].sort((a, b) => a - b);
        if (!ids.length) return estimateParcel([]);
        const products = await tx.query<Array<{ id: number; parcel_grams: number; parcel_length_cm: number; parcel_width_cm: number; parcel_height_cm: number }>>(
            `SELECT id, parcel_grams, parcel_length_cm, parcel_width_cm, parcel_height_cm FROM products WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids,
        );
        return estimateParcel(cart.map((item) => {
            const product = products.find((row) => row.id === Number(item.product_id));
            return { quantity: Number(item.quantity), grams: product?.parcel_grams ?? null, lengthCm: product?.parcel_length_cm ?? 0, widthCm: product?.parcel_width_cm ?? 0, heightCm: product?.parcel_height_cm ?? 0 };
        }));
    }
    async findForUpdate(tx: TransactionContext, id: string) {
        const [row] = await tx.query<QuoteRow[]>("SELECT * FROM delivery_quotes WHERE id = ? FOR UPDATE", [id]);
        return row || null;
    }
    saveQuote(tx: TransactionContext, input: { id: string; fingerprint: string; ownerHash: string; provider: string; serviceTypeId: number; address: object; parcel: ShippingParcel; pricing: object; expectedDeliveryAt: Date | null; expiresAt: Date }) {
        return tx.query(
            `INSERT INTO delivery_quotes (id, fingerprint, owner_hash, provider, service_type_id, address, parcel, pricing, expected_delivery_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.id, input.fingerprint, input.ownerHash, input.provider, input.serviceTypeId, JSON.stringify(input.address), JSON.stringify(input.parcel), JSON.stringify(input.pricing), input.expectedDeliveryAt, input.expiresAt],
        );
    }
    consume(tx: TransactionContext, id: string) {
        return tx.query("UPDATE delivery_quotes SET consumed_at = UTC_TIMESTAMP(3) WHERE id = ?", [id]);
    }
    updateParcel(tx: TransactionContext, productId: number, parcel: ShippingParcel) {
        return tx.query<{ affectedRows: number }>("UPDATE products SET parcel_grams = ?, parcel_length_cm = ?, parcel_width_cm = ?, parcel_height_cm = ? WHERE id = ?", [parcel.grams, parcel.lengthCm, parcel.widthCm, parcel.heightCm, productId]);
    }
}
