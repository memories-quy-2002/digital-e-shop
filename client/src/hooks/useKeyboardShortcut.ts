import { useEffect } from "react";

type UseKeyboardShortcutOptions = {
    ignoreInputs?: boolean;
    preventDefault?: boolean;
};

const isEditableElement = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
    }
    return target.isContentEditable;
};

const matchesCombo = (event: KeyboardEvent, combo: string): boolean => {
    const tokens = combo
        .toLowerCase()
        .split("+")
        .map((token) => token.trim())
        .filter(Boolean);
    if (tokens.length === 0) {
        return false;
    }

    const requiresShift = tokens.includes("shift");
    const requiresCtrl = tokens.includes("ctrl") || tokens.includes("cmd");
    const keyToken = tokens.find(
        (token) => token !== "shift" && token !== "ctrl" && token !== "cmd",
    );
    if (!keyToken) {
        return false;
    }

    if (requiresShift !== event.shiftKey) {
        return false;
    }
    if (requiresCtrl !== (event.ctrlKey || event.metaKey)) {
        return false;
    }

    return event.key.toLowerCase() === keyToken;
};

export function useKeyboardShortcut(
    combo: string,
    callback: (event: KeyboardEvent) => void,
    options: UseKeyboardShortcutOptions = { ignoreInputs: true, preventDefault: true },
) {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (options.ignoreInputs !== false && isEditableElement(event.target)) {
                return;
            }
            if (!matchesCombo(event, combo)) {
                return;
            }
            if (options.preventDefault !== false) {
                event.preventDefault();
            }
            callback(event);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [combo, callback, options.ignoreInputs, options.preventDefault]);
}
