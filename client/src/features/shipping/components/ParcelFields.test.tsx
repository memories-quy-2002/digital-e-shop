// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParcelFields, { validateParcel } from "./ParcelFields";

vi.mock("../../../hooks/useT", () => ({ useT: () => (key: string) => ({
    "shipping.parcelDimensions": "Parcel dimensions",
    "shipping.parcelWeight": "Parcel weight (g)",
    "shipping.parcelLength": "Length (cm)",
    "shipping.parcelWidth": "Width (cm)",
    "shipping.parcelHeight": "Height (cm)",
    "shipping.parcelRangeError": "Enter a valid whole number within the allowed range.",
}[key] || key) }));

describe("ParcelFields", () => {
    it("validates positive bounded whole-number package metadata", () => {
        expect(validateParcel({ grams: 0, lengthCm: 10, widthCm: 10, heightCm: 10 })).toHaveProperty("grams");
        expect(validateParcel({ grams: 100, lengthCm: 10.5, widthCm: 10, heightCm: 10 })).toHaveProperty("lengthCm");
    });

    it("exposes labeled controls and reports controlled edits", () => {
        const onChange = vi.fn();
        render(<ParcelFields value={{ grams: 100, lengthCm: 10, widthCm: 10, heightCm: 10 }} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Parcel weight (g)"), { target: { value: "250" } });
        expect(onChange).toHaveBeenCalledWith({ grams: 250, lengthCm: 10, widthCm: 10, heightCm: 10 });
    });

    it("announces invalid dimensions accessibly", () => {
        render(<ParcelFields value={{ grams: 0, lengthCm: 10, widthCm: 10, heightCm: 10 }} onChange={vi.fn()} />);

        expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid whole number within the allowed range.");
        expect(screen.getByRole("spinbutton", { name: /Parcel weight \(g\)/ })).toHaveAttribute("aria-invalid", "true");
    });
});
