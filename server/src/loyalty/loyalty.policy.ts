export const MAX_LOYALTY_POINTS = 2_147_483_647;

const assertSafeNonNegativeInteger = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
};

export function calculateEarnedPoints(eligibleMerchandiseVnd: number): number {
    assertSafeNonNegativeInteger(eligibleMerchandiseVnd, "Eligible merchandise value");
    return Math.floor(eligibleMerchandiseVnd / 1_000);
}

export function calculatePointsDiscount(
    merchandiseSubtotalVnd: number,
    promotionDiscountVnd: number,
    requestedPoints: number,
): number {
    assertSafeNonNegativeInteger(merchandiseSubtotalVnd, "Merchandise subtotal");
    assertSafeNonNegativeInteger(promotionDiscountVnd, "Promotion discount");
    assertSafeNonNegativeInteger(requestedPoints, "Requested points");
    if (requestedPoints > MAX_LOYALTY_POINTS) throw new RangeError("Requested points exceed the supported balance");
    if (promotionDiscountVnd > merchandiseSubtotalVnd) throw new RangeError("Promotion discount cannot exceed merchandise subtotal");
    return Math.min(requestedPoints, merchandiseSubtotalVnd - promotionDiscountVnd);
}
