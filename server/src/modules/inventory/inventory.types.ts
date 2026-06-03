import type { InventoryMovementInput } from "./inventory.dto";

export type InventoryMovementRow = {
    id: number;
    product_id: number;
    product_name?: string | null;
    order_id?: number | null;
    movement_type: string;
    quantity_change: number;
    stock_before?: number | null;
    stock_after?: number | null;
    note?: string | null;
    actor_id?: string | number | null;
    created_at?: string | null;
};

export type { InventoryMovementInput };
