import React, { useEffect, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { useT } from "../../hooks/useT";
import type { Locale } from "../../i18n";

const options: { value: Locale; short: string; long: string }[] = [
    { value: "en", short: "EN", long: "English" },
    { value: "vi", short: "VI", long: "Tiếng Việt" },
];

const LanguageDropdown: React.FC<{ align?: "left" | "right" }> = ({ align = "right" }) => {
    const { locale, setLocale } = useLocale();
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

    const current = options.find((o) => o.value === locale) ?? options[0];

    return (
        <div className="de-dropdown" ref={ref}>
            <button
                type="button"
                className="de-dropdown__trigger de-dropdown__trigger--lang"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`${t("language.en")} / ${t("language.vi")}`}
                title={current.long}
            >
                <span className="de-dropdown__label">{current.short}</span>
                <span className="de-dropdown__chevron" aria-hidden="true">
                    ▾
                </span>
            </button>
            {open ? (
                <div className={`de-dropdown__menu de-dropdown__menu--${align}`} role="listbox">
                    {options.map((option) => {
                        const label = t(option.value === "en" ? "language.en" : "language.vi");
                        const isActive = locale === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={`de-dropdown__item${isActive ? " is-active" : ""}`}
                                onClick={() => {
                                    setLocale(option.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="de-dropdown__item__flag" aria-hidden="true">
                                    {option.short}
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

export default LanguageDropdown;
