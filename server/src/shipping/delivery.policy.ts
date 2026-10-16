export type DeliveryFeeBands = {
    fee5To20Vnd: number;
    feeOver20Vnd: number;
};

export function calculateDeliveryFee(distanceMeters: number, bands: DeliveryFeeBands): number {
    if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0) {
        throw new RangeError("Delivery distance must be a non-negative whole number of meters");
    }

    const { fee5To20Vnd, feeOver20Vnd } = bands;
    if (!Number.isSafeInteger(fee5To20Vnd) || fee5To20Vnd < 0
        || !Number.isSafeInteger(feeOver20Vnd) || feeOver20Vnd < 0
        || feeOver20Vnd <= fee5To20Vnd) {
        throw new RangeError("Delivery fee bands must be whole VND amounts and the over-20km fee must exceed the 5-20km fee");
    }

    if (distanceMeters < 5000) return 0;
    if (distanceMeters <= 20000) return fee5To20Vnd;
    return feeOver20Vnd;
}
