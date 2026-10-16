import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { addItemsToCustomerCart, syncGuestCart } from "./api";
import { readGuestCart, replaceGuestCart, type GuestCartStorageItem } from "./guestCartStorage";

export type GuestCartMergeStatus = "idle" | "loading" | "complete" | "partial" | "error";

export type CartMergeResult = {
    accepted: GuestCartStorageItem[];
    rejected: GuestCartStorageItem[];
    complete: boolean;
};

export type CartSourceSnapshot = {
    source: string;
    uid: string | null;
    generation: number;
};

type Options = {
    sourceRef: MutableRefObject<CartSourceSnapshot>;
    isCurrentSource: (candidate: CartSourceSnapshot) => boolean;
    setMergeStatus: Dispatch<SetStateAction<GuestCartMergeStatus>>;
    setGuestItems: Dispatch<SetStateAction<GuestCartStorageItem[]>>;
    setError: Dispatch<SetStateAction<string | null>>;
    fetchCart: () => Promise<boolean>;
};

export function useGuestCartMerge({
    sourceRef,
    isCurrentSource,
    setMergeStatus,
    setGuestItems,
    setError,
    fetchCart,
}: Options) {
    const mergePromiseRef = useRef<{ generation: number; promise: Promise<CartMergeResult> } | null>(null);

    return useCallback(async (): Promise<CartMergeResult> => {
        const expectedSource = sourceRef.current;
        const currentMerge = mergePromiseRef.current;
        if (currentMerge?.generation === expectedSource.generation) return currentMerge.promise;

        const pendingItems = readGuestCart();
        if (!expectedSource.uid || pendingItems.length === 0) {
            return { accepted: [], rejected: pendingItems, complete: pendingItems.length === 0 };
        }

        const runMerge = async (): Promise<CartMergeResult> => {
            const accepted: GuestCartStorageItem[] = [];
            const rejected: GuestCartStorageItem[] = [];
            try {
                if (!isCurrentSource(expectedSource)) return { accepted, rejected: pendingItems, complete: false };
                setMergeStatus("loading");
                for (const item of pendingItems) {
                    if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                    try {
                        await addItemsToCustomerCart(expectedSource.uid as string, [{ ...item, stock: item.quantity }]);
                        if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                        accepted.push(item);
                    } catch {
                        if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                        rejected.push(item);
                    }
                }

                if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                const remainingItems = readGuestCart().filter((currentItem) =>
                    !accepted.some((acceptedItem) =>
                        acceptedItem.productId === currentItem.productId && acceptedItem.quantity === currentItem.quantity,
                    ),
                );
                replaceGuestCart(remainingItems);
                setGuestItems(remainingItems);
                try {
                    await syncGuestCart(remainingItems);
                } catch {
                    // Keep rejected guest items locally when server persistence is unavailable.
                }

                if (rejected.length === 0) {
                    setMergeStatus("complete");
                    setError(null);
                } else {
                    setMergeStatus("partial");
                }
                await fetchCart();
                if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                if (rejected.length > 0) setError("Some guest cart items could not be merged. Retry to continue.");
                return { accepted, rejected, complete: rejected.length === 0 };
            } catch {
                if (isCurrentSource(expectedSource)) {
                    setMergeStatus("error");
                    setError("Unable to merge guest cart right now.");
                }
                return { accepted, rejected, complete: false };
            }
        };

        const promise = runMerge();
        mergePromiseRef.current = { generation: expectedSource.generation, promise };
        void promise.finally(() => {
            if (mergePromiseRef.current?.promise === promise) mergePromiseRef.current = null;
        });
        return promise;
    }, [fetchCart, isCurrentSource, setError, setGuestItems, setMergeStatus, sourceRef]);
}
