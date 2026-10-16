import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import AdminPromotionsPage from "./AdminPromotionsPage";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    fetchPromotions: vi.fn(),
    createPromotion: vi.fn(),
    updatePromotion: vi.fn(),
    deletePromotion: vi.fn(),
}));

vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../components/common/ConfirmActionModal", () => ({ default: () => null }));
vi.mock("../../../components/ui/legacy", async () => {
    const actual = await vi.importActual<typeof import("../../../components/ui/legacy")>("../../../components/ui/legacy");
    return actual;
});
vi.mock("../api", () => ({
    fetchPromotions: mocks.fetchPromotions,
    createPromotion: mocks.createPromotion,
    updatePromotion: mocks.updatePromotion,
    deletePromotion: mocks.deletePromotion,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("AdminPromotionsPage loyalty reward cost", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetchPromotions.mockResolvedValue([]);
        mocks.createPromotion.mockResolvedValue(undefined);
    });

    it("saves a positive integer point cost with the promotion", async () => {
        render(<LocaleProvider><AdminPromotionsPage /></LocaleProvider>);

        fireEvent.change(await screen.findByLabelText(/code/i), { target: { value: "MEMBER20" } });
        fireEvent.change(screen.getByLabelText(/discount %/i), { target: { value: "20" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /loyalty points cost/i }), { target: { value: "250" } });
        fireEvent.click(screen.getByRole("button", { name: "Create promotion" }));

        await waitFor(() => expect(mocks.createPromotion).toHaveBeenCalledWith(expect.objectContaining({
            discountCode: "MEMBER20",
            discountPercent: 20,
            loyaltyPointsCost: 250,
        })));
    });

    it("rejects fractional point costs before saving", async () => {
        render(<LocaleProvider><AdminPromotionsPage /></LocaleProvider>);

        fireEvent.change(await screen.findByLabelText(/code/i), { target: { value: "MEMBER20" } });
        fireEvent.change(screen.getByLabelText(/discount %/i), { target: { value: "20" } });
        const costField = screen.getByRole("spinbutton", { name: /loyalty points cost/i });
        fireEvent.change(costField, { target: { value: "2.5" } });

        expect(costField).toBeInvalid();
        expect(mocks.createPromotion).not.toHaveBeenCalled();
    });
});
