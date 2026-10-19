export type LoyaltyHistoryEntry = {
    id: number;
    type: string;
    pointsDelta: number;
    amountVnd: number | null;
    description: string;
    createdAt: string;
};

export type LoyaltyVoucher = {
    id: number;
    code: string;
    status: "AVAILABLE" | "RESERVED" | string;
    pointsCost: number;
    discountPercent: number;
    minOrderValue: number;
    expiresAt: string | null;
    createdAt: string;
};

export type LoyaltyReward = {
    id: number;
    description: string;
    discountPercent: number;
    minOrderValue: number;
    pointsCost: number;
    expiresAt: string | null;
    remainingUses: number | null;
};

export type LoyaltyOverview = {
    balancePoints: number;
    history: LoyaltyHistoryEntry[];
    vouchers: LoyaltyVoucher[];
    rewards: LoyaltyReward[];
};
