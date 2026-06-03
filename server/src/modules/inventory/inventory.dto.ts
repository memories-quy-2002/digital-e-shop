export type InventoryMovementInput = {
    productId: number;
    orderId?: number | null;
    movementType: string;
    quantityChange: number;
    stockBefore?: number | null;
    stockAfter?: number | null;
    note?: string | null;
    actorId?: string | number | null;
};
