import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { mergeGuestCartIntoCustomer, syncGuestCart } from "./api";
import { clearCartMergeOperation, getOrCreateCartMergeOperation } from "./cartMergeStorage";
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

const subtractAccepted = (current: GuestCartStorageItem[], accepted: GuestCartStorageItem[]) => {
    const acceptedById = new Map(accepted.map(({ productId, quantity }) => [productId, quantity]));
    return current.flatMap((item) => {
        const remaining = Math.max(0, item.quantity - (acceptedById.get(item.productId) || 0));
        acceptedById.delete(item.productId);
        return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    });
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

        const currentItems = readGuestCart();
        if (!expectedSource.uid || currentItems.length === 0) {
            return { accepted: [], rejected: currentItems, complete: currentItems.length === 0 };
        }

        const operation = getOrCreateCartMergeOperation(currentItems);
        const runMerge = async (): Promise<CartMergeResult> => {
            try {
                if (!isCurrentSource(expectedSource)) return { accepted: [], rejected: currentItems, complete: false };
                setMergeStatus("loading");
                const response = await mergeGuestCartIntoCustomer(expectedSource.uid as string, operation.operationId, operation.items);
                if (!isCurrentSource(expectedSource)) return { accepted: [], rejected: currentItems, complete: false };

                const accepted = response.accepted.map(({ productId, quantity }) => ({ productId, quantity }));
                const remainingItems = subtractAccepted(readGuestCart(), accepted);
                replaceGuestCart(remainingItems);
                setGuestItems(remainingItems);
                clearCartMergeOperation();
                try {
                    await syncGuestCart(remainingItems);
                } catch {
                    // Preserve rejected guest items locally when server persistence is unavailable.
                }

                if (remainingItems.length === 0) {
                    setMergeStatus("complete");
                    setError(null);
                } else {
                    setMergeStatus("partial");
                }
                await fetchCart();
                if (!isCurrentSource(expectedSource)) return { accepted, rejected: remainingItems, complete: false };
                if (remainingItems.length > 0) setError("Some guest cart items could not be merged. Retry to continue.");
                return { accepted, rejected: remainingItems, complete: remainingItems.length === 0 };
            } catch {
                if (isCurrentSource(expectedSource)) {
                    setMergeStatus("error");
                    setError("Unable to merge guest cart right now.");
                }
                // Keep both the local cart and immutable operation snapshot so a retry is idempotent.
                return { accepted: [], rejected: readGuestCart(), complete: false };
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
