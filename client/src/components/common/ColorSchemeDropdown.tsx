import React, { useEffect, useRef, useState } from "react";
import { useColorScheme, type ColorScheme } from "../../hooks/useColorScheme";
import { useT } from "../../hooks/useT";

const options: { value: ColorScheme; symbol: string }[] = [
    { value: "light", symbol: "☀" },
    { value: "dark", symbol: "☾" },
    { value: "system", symbol: "◐" },
];

const labelKey: Record<ColorScheme, "colorScheme.light" | "colorScheme.dark" | "colorScheme.system"> = {
    light: "colorScheme.light",
    dark: "colorScheme.dark",
    system: "colorScheme.system",
};

const ColorSchemeDropdown: React.FC<{ align?: "left" | "right" }> = ({ align = "right" }) => {
    const { scheme, resolved, setScheme } = useColorScheme();
    const t = useT();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onPointerDown = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const current = options.find((o) => o.value === scheme) ?? options[2];
    const currentLabel = t(labelKey[scheme]);

    return (
        <div className="de-dropdown" ref={ref}>
            <button
                type="button"
                className="de-dropdown__trigger"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t("colorScheme.system")}
                data-resolved={resolved}
                title={currentLabel}
            >
                <span className="de-dropdown__symbol" aria-hidden="true">
                    {current.symbol}
                </span>
                <span className="de-dropdown__label">{currentLabel}</span>
                <span className="de-dropdown__chevron" aria-hidden="true">
                    ▾
                </span>
            </button>
            {open ? (
                <div className={`de-dropdown__menu de-dropdown__menu--${align}`} role="listbox">
                    {options.map((option) => {
                        const label = t(labelKey[option.value]);
                        const isActive = scheme === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={`de-dropdown__item${isActive ? " is-active" : ""}`}
                                onClick={() => {
                                    setScheme(option.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="de-dropdown__item__symbol" aria-hidden="true">
                                    {option.symbol}
                                </span>
                                <span className="de-dropdown__item__label">{label}</span>
                                {isActive ? (
                                    <span className="de-dropdown__item__check" aria-hidden="true">
                                        ✓
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};

export default ColorSchemeDropdown;
