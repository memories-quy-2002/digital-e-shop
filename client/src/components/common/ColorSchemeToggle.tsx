import React from "react";
import { useColorScheme, type ColorScheme } from "../../hooks/useColorScheme";

const nextLabel = (scheme: ColorScheme): { label: string; symbol: string } => {
    if (scheme === "light") {
        return { label: "Light", symbol: "☀" };
    }
    if (scheme === "dark") {
        return { label: "Dark", symbol: "☾" };
    }
    return { label: "System", symbol: "◐" };
};

const ColorSchemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { scheme, cycle, resolved } = useColorScheme();
    const { label, symbol } = nextLabel(scheme);

    return (
        <button
            type="button"
            className={`color-scheme-toggle${compact ? " color-scheme-toggle--compact" : ""}`}
            onClick={cycle}
            aria-label={`Color scheme: ${label}. Click to switch.`}
            title={`Color scheme: ${label}`}
            data-resolved={resolved}
        >
            <span className="color-scheme-toggle__symbol" aria-hidden="true">
                {symbol}
            </span>
            {!compact ? <span className="color-scheme-toggle__label">{label}</span> : null}
        </button>
    );
};

export default ColorSchemeToggle;
