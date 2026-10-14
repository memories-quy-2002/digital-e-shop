export type RefundAllocationInput = {
    orderItemId: number;
    quantity: number;
    unitPrice: number;
};

export type RefundableUnit = { orderItemId: number; unitIndex: number; netVnd: number };

type WeightedUnit = { orderItemId: number; unitIndex: number; grossVnd: bigint; discount: bigint; remainder: bigint };

const assertSafeVnd = (value: number, label: string): bigint => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer VND amount`);
    return BigInt(value);
};

/** Allocate a merchandise discount proportionally with largest remainders.
 * Ties are stable by orderItemId then zero-based unitIndex.
 */
export function allocateRefundUnits(items: RefundAllocationInput[], merchandiseDiscount: number): RefundableUnit[] {
    const discountVnd = assertSafeVnd(merchandiseDiscount, "merchandiseDiscount");
    const units: WeightedUnit[] = [];
    for (const item of items) {
        if (!Number.isSafeInteger(item.orderItemId) || item.orderItemId < 1
            || !Number.isSafeInteger(item.quantity) || item.quantity < 0) {
            throw new RangeError("Refund item identifiers and quantities must be non-negative safe integers");
        }
        const gross = assertSafeVnd(item.unitPrice, "unitPrice");
        for (let unitIndex = 0; unitIndex < item.quantity; unitIndex += 1) {
            units.push({ orderItemId: item.orderItemId, unitIndex, grossVnd: gross, discount: 0n, remainder: 0n });
        }
    }
    units.sort((a, b) => a.orderItemId - b.orderItemId || a.unitIndex - b.unitIndex);
    const subtotal = units.reduce((sum, unit) => sum + unit.grossVnd, 0n);
    if (discountVnd > subtotal) throw new RangeError("Merchandise discount cannot exceed the item subtotal");
    if (subtotal === 0n && discountVnd > 0n) throw new RangeError("Merchandise discount cannot be allocated to zero-value items");

    let allocated = 0n;
    for (const unit of units) {
        const numerator = discountVnd * unit.grossVnd;
        unit.discount = subtotal === 0n ? 0n : numerator / subtotal;
        unit.remainder = subtotal === 0n ? 0n : numerator % subtotal;
        allocated += unit.discount;
    }
    const remainderOrder = [...units].sort((a, b) => a.remainder === b.remainder
        ? b.orderItemId - a.orderItemId || b.unitIndex - a.unitIndex
        : a.remainder > b.remainder ? -1 : 1);
    let centsLeft = discountVnd - allocated;
    for (let index = 0; centsLeft > 0n; index += 1, centsLeft -= 1n) {
        const unit = remainderOrder[index];
        if (!unit) throw new RangeError("Discount allocation could not be balanced");
        unit.discount += 1n;
    }

    return units.map((unit) => {
        const net = unit.grossVnd - unit.discount;
        if (net > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Refund unit exceeds the safe integer range");
        return { orderItemId: unit.orderItemId, unitIndex: unit.unitIndex, netVnd: Number(net) };
    });
}
