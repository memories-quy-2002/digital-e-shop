import type { ShippingParcel } from "../types";
import { useT } from "../../../hooks/useT";
import "../../../styles/features/shipping/_shipping.scss";

const fields: Array<{ key: keyof ShippingParcel; labelKey: string; min: number; max: number }> = [
    { key: "grams", labelKey: "shipping.parcelWeight", min: 1, max: 30000 },
    { key: "lengthCm", labelKey: "shipping.parcelLength", min: 1, max: 200 },
    { key: "widthCm", labelKey: "shipping.parcelWidth", min: 1, max: 200 },
    { key: "heightCm", labelKey: "shipping.parcelHeight", min: 1, max: 200 },
];

export const validateParcel = (parcel: ShippingParcel) => fields.reduce<Record<string, string>>((errors, field) => {
    const value = parcel[field.key];
    if (!Number.isSafeInteger(value) || value < field.min || value > field.max) errors[field.key] = `Enter a whole number from ${field.min} to ${field.max}.`;
    return errors;
}, {});

export default function ParcelFields({ value, onChange, idPrefix = "parcel" }: { value: ShippingParcel; onChange: (next: ShippingParcel) => void; idPrefix?: string }) {
    const t = useT();
    const errors = validateParcel(value);
    return <fieldset className="shipping-parcel"><legend>{t("shipping.parcelDimensions")}</legend><div className="shipping-parcel__grid">{fields.map((field) => {
        const id = `${idPrefix}-parcel-${field.key}`;
        return <label key={field.key} htmlFor={id}>{t(field.labelKey)}<input id={id} type="number" min={field.min} max={field.max} step="1" value={value[field.key] || ""} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `${id}-error` : undefined} onChange={(event) => onChange({ ...value, [field.key]: Number(event.target.value) })} />{errors[field.key] ? <small id={`${id}-error`} role="alert">{t("shipping.parcelRangeError")}</small> : null}</label>;
    })}</div></fieldset>;
}
