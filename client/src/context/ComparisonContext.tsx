import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

const STORAGE_KEY = "digital-e:comparison:v1";
const MAX_COMPARISON_ITEMS = 4;

export type ComparisonAddResult =
    | "added"
    | "already-selected"
    | "limit-reached"
    | "category-mismatch";

export type ComparisonContextValue = {
    selectedIds: number[];
    canCompare: boolean;
    isSelected: (productId: number) => boolean;
    add: (productId: number, category?: string) => ComparisonAddResult;
    remove: (productId: number) => void;
    toggle: (productId: number, category?: string) => ComparisonAddResult | "removed";
    clear: () => void;
    replace: (productIds: number[]) => void;
};

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

const sanitizeIds = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(value.filter((id): id is number =>
        typeof id === "number" && Number.isInteger(id) && id > 0,
    ))).slice(0, MAX_COMPARISON_ITEMS);
};

const normalizeCategory = (category?: string) => category?.trim().toLocaleLowerCase() || "";

export const ComparisonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [storedIds, setStoredIds] = useLocalStorage<unknown>(STORAGE_KEY, []);
    const selectedIds = useMemo(() => sanitizeIds(storedIds), [storedIds]);
    const categories = useRef(new Map<number, string>());

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const raw = window.localStorage.getItem(STORAGE_KEY);
        let parsed: unknown = [];
        let parsedSuccessfully = true;
        try {
            parsed = raw === null ? [] : JSON.parse(raw);
        } catch {
            parsed = [];
            parsedSuccessfully = false;
        }

        const isAlreadySanitized = parsedSuccessfully && Array.isArray(parsed) && parsed.length === selectedIds.length &&
            parsed.every((id, index) => id === selectedIds[index]);
        if (isAlreadySanitized) return;

        setStoredIds(selectedIds);
    }, [selectedIds, setStoredIds]);

    const isSelected = useCallback((productId: number) => selectedIds.includes(productId), [selectedIds]);

    const add = useCallback((productId: number, category?: string): ComparisonAddResult => {
        if (!Number.isInteger(productId) || productId <= 0) {
            return "limit-reached";
        }

        if (selectedIds.includes(productId)) {
            if (category) categories.current.set(productId, normalizeCategory(category));
            return "already-selected";
        }

        const normalizedCategory = normalizeCategory(category);
        const knownCategories = Array.from(categories.current.values()).filter(Boolean);
        if (normalizedCategory && knownCategories.some((known) => known !== normalizedCategory)) {
            return "category-mismatch";
        }

        if (selectedIds.length >= MAX_COMPARISON_ITEMS) {
            return "limit-reached";
        }

        categories.current.set(productId, normalizedCategory);
        setStoredIds([...selectedIds, productId]);
        return "added";
    }, [selectedIds, setStoredIds]);

    const remove = useCallback((productId: number) => {
        categories.current.delete(productId);
        setStoredIds(selectedIds.filter((id) => id !== productId));
    }, [selectedIds, setStoredIds]);

    const toggle = useCallback((productId: number, category?: string) => {
        if (selectedIds.includes(productId)) {
            remove(productId);
            return "removed" as const;
        }
        return add(productId, category);
    }, [add, remove, selectedIds]);

    const clear = useCallback(() => {
        categories.current.clear();
        setStoredIds([]);
    }, [setStoredIds]);

    const replace = useCallback((productIds: number[]) => {
        categories.current.clear();
        setStoredIds(sanitizeIds(productIds));
    }, [setStoredIds]);

    const value = useMemo<ComparisonContextValue>(() => ({
        selectedIds,
        canCompare: selectedIds.length >= 2,
        isSelected,
        add,
        remove,
        toggle,
        clear,
        replace,
    }), [add, clear, isSelected, remove, replace, selectedIds, toggle]);

    return <ComparisonContext.Provider value={value}>{children}</ComparisonContext.Provider>;
};

export const useComparison = (): ComparisonContextValue => {
    const context = useContext(ComparisonContext);
    if (!context) {
        throw new Error("useComparison must be used within a ComparisonProvider");
    }
    return context;
};
