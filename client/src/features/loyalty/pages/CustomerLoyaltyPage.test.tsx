import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import CustomerLoyaltyPage from "./CustomerLoyaltyPage";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    fetchLoyaltyOverview: vi.fn(),
    claimLoyaltyReward: vi.fn(),
}));

vi.mock("../../../components/layout/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../users/components/CustomerAccountShell", () => ({
    default: ({ title, description }: { title: string; description: string }) => <header><h1>{title}</h1><p>{description}</p></header>,
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("../api", () => ({
    fetchLoyaltyOverview: mocks.fetchLoyaltyOverview,
    claimLoyaltyReward: mocks.claimLoyaltyReward,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("CustomerLoyaltyPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetchLoyaltyOverview.mockResolvedValue({
            balancePoints: 500,
            history: [],
            vouchers: [],
            rewards: [{
                id: 7,
                description: "Member voucher",
                discountPercent: 15,
                minOrderValue: 100_000,
                pointsCost: 250,
                expiresAt: null,
                remainingUses: 1,
            }],
        });
        mocks.claimLoyaltyReward.mockResolvedValue({
            balancePoints: 250,
            voucher: {
                id: 31,
                code: "LOY-0123456789ABCDEF0123",
                status: "AVAILABLE",
                pointsCost: 250,
                discountPercent: 15,
                minOrderValue: 100_000,
                expiresAt: null,
                createdAt: "2026-10-16T00:00:00.000Z",
            },
        });
    });

    it("updates the balance, issues the personal code, and exhausts a one-use reward", async () => {
        render(<LocaleProvider><CustomerLoyaltyPage /></LocaleProvider>);

        fireEvent.click(await screen.findByRole("button", { name: "Claim for 250 points" }));

        expect(await screen.findAllByText(/LOY-0123456789ABCDEF0123/)).toHaveLength(2);
        expect(await screen.findByText("250 points")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole("button", { name: "Claim for 250 points" })).toBeDisabled());
        expect(mocks.claimLoyaltyReward).toHaveBeenCalledWith(7);
    });

    it("keeps a long voucher code available as a readable token", async () => {
        const code = "LOYALTY-VOUCHER-CODE-0123456789-ABCDEFGHIJKLMNOP";
        mocks.fetchLoyaltyOverview.mockResolvedValueOnce({
            balancePoints: 500,
            history: [],
            vouchers: [{
                id: 31,
                code,
                status: "AVAILABLE",
                pointsCost: 250,
                discountPercent: 15,
                minOrderValue: 100_000,
                expiresAt: null,
                createdAt: "2026-10-16T00:00:00.000Z",
            }],
            rewards: [],
        });

        render(<LocaleProvider><CustomerLoyaltyPage /></LocaleProvider>);

        expect(await screen.findByText(code)).toHaveAttribute("translate", "no");
    });
});
