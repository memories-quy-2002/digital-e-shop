export type StableIdempotencyKey = {
    fingerprint: string;
    key: string;
};

export function getStableIdempotencyKey(
    payload: unknown,
    previous: StableIdempotencyKey | null,
): StableIdempotencyKey {
    const fingerprint = JSON.stringify(payload) ?? "undefined";
    if (previous?.fingerprint === fingerprint) return previous;

    return {
        fingerprint,
        key: globalThis.crypto?.randomUUID?.() || `after-sales-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
}
