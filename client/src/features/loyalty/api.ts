import http from "../../lib/http";
import type { LoyaltyOverview, LoyaltyVoucher } from "./types";

export async function fetchLoyaltyOverview(): Promise<LoyaltyOverview> {
    const response = await http.get<{ loyalty: LoyaltyOverview }>("/api/loyalty/me");
    return response.data.loyalty;
}

export async function claimLoyaltyReward(promotionId: number): Promise<{ voucher: LoyaltyVoucher; balancePoints: number }> {
    const response = await http.post<{ voucher: LoyaltyVoucher; balancePoints: number }>(`/api/loyalty/rewards/${promotionId}/claim`, {});
    return response.data;
}
