import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import Layout from "../../../components/layout/Layout";
import CustomerAccountShell from "../../users/components/CustomerAccountShell";
import { useToast } from "../../../context/ToastContext";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { claimLoyaltyReward, fetchLoyaltyOverview } from "../api";
import type { LoyaltyOverview, LoyaltyReward, LoyaltyVoucher } from "../types";
import "../../../styles/features/users/_loyalty-page.scss";

const formatDate = (value: string | null, locale: string) => value
    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" }).format(new Date(value))
    : null;

const CustomerLoyaltyPage = () => {
    const t = useT();
    const { locale } = useLocale();
    const { addToast } = useToast();
    const [overview, setOverview] = useState<LoyaltyOverview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [claimingRewardId, setClaimingRewardId] = useState<number | null>(null);
    const [claimedVoucher, setClaimedVoucher] = useState<LoyaltyVoucher | null>(null);

    const loadOverview = useCallback(async () => {
        setIsLoading(true);
        setLoadError(false);
        try {
            setOverview(await fetchLoyaltyOverview());
        } catch {
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void loadOverview(); }, [loadOverview]);

    const handleClaim = async (reward: LoyaltyReward) => {
        setClaimingRewardId(reward.id);
        setClaimedVoucher(null);
        try {
            const result = await claimLoyaltyReward(reward.id);
            setOverview((current) => current ? {
                ...current,
                balancePoints: result.balancePoints,
                vouchers: [result.voucher, ...current.vouchers.filter((voucher) => voucher.id !== result.voucher.id)],
                rewards: current.rewards.map((item) => item.id === reward.id && item.remainingUses !== null
                    ? { ...item, remainingUses: Math.max(item.remainingUses - 1, 0) }
                    : item),
            } : current);
            setClaimedVoucher(result.voucher);
            addToast(t("loyalty.title"), t("loyalty.claimSuccess"));
        } catch (error) {
            addToast(t("loyalty.title"), getApiErrorMessage(error, t("loyalty.claimError")));
        } finally {
            setClaimingRewardId(null);
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>{t("loyalty.metaTitle")}</title>
                <meta name="description" content={t("loyalty.metaDescription")} />
            </Helmet>
            <div className="loyalty-page">
                <CustomerAccountShell
                    eyebrow={t("loyalty.eyebrow")}
                    title={t("loyalty.title")}
                    description={t("loyalty.description")}
                />

                {isLoading ? (
                    <div className="loyalty-page__status" role="status" aria-live="polite">{t("loyalty.loading")}</div>
                ) : loadError ? (
                    <div className="loyalty-page__status loyalty-page__status--error" role="alert">
                        <p>{t("loyalty.loadError")}</p>
                        <button type="button" onClick={() => void loadOverview()}>{t("loyalty.retry")}</button>
                    </div>
                ) : overview ? (
                    <>
                        <section className="loyalty-page__balance" aria-labelledby="loyalty-balance-heading">
                            <div>
                                <span>{t("loyalty.currentBalance")}</span>
                                <h2 id="loyalty-balance-heading">{t("loyalty.points", overview.balancePoints)}</h2>
                                <p>{t("loyalty.earningRule")}</p>
                            </div>
                            <div className="loyalty-page__conversion" aria-label={t("loyalty.redemptionRule")}>
                                <strong>{t("loyalty.pointValue")}</strong>
                                <span>{t("loyalty.redemptionRule")}</span>
                            </div>
                        </section>

                        {claimedVoucher ? (
                            <p className="loyalty-page__success" role="status" aria-live="polite">
                                {t("loyalty.claimedCode", claimedVoucher.code)}
                            </p>
                        ) : null}

                        <section className="loyalty-page__section" aria-labelledby="loyalty-rewards-heading">
                            <header>
                                <div>
                                    <h2 id="loyalty-rewards-heading">{t("loyalty.rewardsTitle")}</h2>
                                    <p>{t("loyalty.rewardsDescription")}</p>
                                </div>
                            </header>
                            {overview.rewards.length === 0 ? (
                                <p className="loyalty-page__empty">{t("loyalty.rewardsEmpty")}</p>
                            ) : (
                                <div className="loyalty-page__reward-grid">
                                    {overview.rewards.map((reward) => {
                                        const isUnavailable = reward.remainingUses !== null && reward.remainingUses <= 0;
                                        const isClaiming = claimingRewardId === reward.id;
                                        return (
                                            <article className="loyalty-page__reward" key={reward.id}>
                                                <span className="loyalty-page__reward-value">{reward.discountPercent}%</span>
                                                <h3>{reward.description}</h3>
                                                <p>{t("loyalty.minimumOrder", formatCurrency(reward.minOrderValue))}</p>
                                                {reward.expiresAt ? <p>{t("loyalty.expires", formatDate(reward.expiresAt, locale))}</p> : null}
                                                {reward.remainingUses !== null ? <p>{t("loyalty.remainingUses", reward.remainingUses)}</p> : null}
                                                <button
                                                    type="button"
                                                    onClick={() => void handleClaim(reward)}
                                                    disabled={isLoading || isClaiming || isUnavailable || overview.balancePoints < reward.pointsCost}
                                                >
                                                    {isClaiming ? t("loyalty.claiming") : t("loyalty.claimFor", reward.pointsCost)}
                                                </button>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section className="loyalty-page__section" aria-labelledby="loyalty-vouchers-heading">
                            <header><h2 id="loyalty-vouchers-heading">{t("loyalty.vouchersTitle")}</h2></header>
                            {overview.vouchers.length === 0 ? (
                                <p className="loyalty-page__empty">{t("loyalty.vouchersEmpty")}</p>
                            ) : (
                                <ul className="loyalty-page__voucher-list">
                                    {overview.vouchers.map((voucher) => (
                                        <li key={voucher.id}>
                                            <strong>{voucher.code}</strong>
                                            <span>{t("loyalty.voucherDescription", voucher.discountPercent, voucher.pointsCost)}</span>
                                            <span>{voucher.status === "RESERVED" ? t("loyalty.voucherReserved") : t("loyalty.voucherAvailable")}</span>
                                            {voucher.expiresAt ? <span>{t("loyalty.expires", formatDate(voucher.expiresAt, locale))}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="loyalty-page__section" aria-labelledby="loyalty-history-heading">
                            <header><h2 id="loyalty-history-heading">{t("loyalty.historyTitle")}</h2></header>
                            {overview.history.length === 0 ? (
                                <p className="loyalty-page__empty">{t("loyalty.historyEmpty")}</p>
                            ) : (
                                <ul className="loyalty-page__history-list">
                                    {overview.history.map((entry) => (
                                        <li key={entry.id}>
                                            <div><strong>{entry.description}</strong><span>{formatDate(entry.createdAt, locale)}</span></div>
                                            <strong className={entry.pointsDelta >= 0 ? "is-earned" : "is-spent"}>
                                                {entry.pointsDelta > 0 ? "+" : ""}{t("loyalty.points", entry.pointsDelta)}
                                            </strong>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </>
                ) : null}
            </div>
        </Layout>
    );
};

export default CustomerLoyaltyPage;
