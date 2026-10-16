import React, { useEffect, useMemo, useRef, useState } from "react";
import { Table } from "../../../components/ui/legacy";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { fetchPromotions, createPromotion, updatePromotion, deletePromotion } from "../api";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { formatPromotionDateTimeInput, localPromotionDateTimeToIso } from "../utils/promotionDateTime";
import { useT } from "../../../hooks/useT";
import type { AdminPromotion as Promotion } from "../types";

type PromotionForm = {
    id?: number;
    discountCode: string;
    discountPercent: string;
    minOrderValue: string;
    startsAt: string;
    expiresAt: string;
    usageLimit: string;
    loyaltyPointsCost: string;
    active: boolean;
};

const emptyForm: PromotionForm = {
    discountCode: "",
    discountPercent: "",
    minOrderValue: "0",
    startsAt: "",
    expiresAt: "",
    usageLimit: "",
    loyaltyPointsCost: "",
    active: true,
};

const normalizePromotion = (promotion: Promotion): Promotion => ({
    ...promotion,
    id: Number(promotion.id),
    discount_percent: Number(promotion.discount_percent) || 0,
    active: Boolean(promotion.active),
    min_order_value: Number(promotion.min_order_value) || 0,
    loyalty_points_cost: promotion.loyalty_points_cost === null || promotion.loyalty_points_cost === undefined
        ? null
        : Number(promotion.loyalty_points_cost),
    usage_limit: promotion.usage_limit === null ? null : Number(promotion.usage_limit) || null,
    usage_count: Number(promotion.usage_count) || 0,
    remaining_uses: promotion.remaining_uses === null || promotion.remaining_uses === undefined
        ? (promotion.usage_limit === null ? null : Math.max(Number(promotion.usage_limit) - (Number(promotion.usage_count) || 0), 0))
        : Number(promotion.remaining_uses),
});

const AdminPromotionsPage = () => {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [form, setForm] = useState<PromotionForm>(emptyForm);
    const [searchTerm, setSearchTerm] = useState("");
    const [previewCartValue, setPreviewCartValue] = useState("100000");
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDeactivatePromotion, setPendingDeactivatePromotion] = useState<Promotion | null>(null);
    const [isDeactivating, setIsDeactivating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const hasLoadedRef = useRef(false);
    const { addToast } = useToast();
    const t = useT();

    const loadPromotions = React.useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const data = await fetchPromotions();
                setPromotions((data || []).map(normalizePromotion));
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch (error) {
            setLoadError(getAdminRequestError(error));
            if (hasLoadedRef.current) addToast("Promotions", "Refresh failed. Showing the latest saved promotions.");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadPromotions(); }, [loadPromotions]);

    const filteredPromotions = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return promotions;
        return promotions.filter((promotion) => promotion.discount_code.toLowerCase().includes(term));
    }, [promotions, searchTerm]);

    const promotionStats = useMemo(
        () => ({
            total: promotions.length,
            active: promotions.filter((promotion) => promotion.active).length,
            scheduled: promotions.filter((promotion) => promotion.starts_at && new Date(promotion.starts_at) > new Date()).length,
        }),
        [promotions],
    );

    const preview = useMemo(() => {
        const cartValue = Math.max(Number(previewCartValue) || 0, 0);
        const minimum = Math.max(Number(form.minOrderValue) || 0, 0);
        const percent = Math.min(Math.max(Number(form.discountPercent) || 0, 0), 90);
        const eligible = cartValue >= minimum && percent > 0;
        const discount = eligible ? Math.round(cartValue * percent / 100) : 0;
        return { cartValue, discount, payable: Math.max(cartValue - discount, 0), eligible };
    }, [form.discountPercent, form.minOrderValue, previewCartValue]);

    const handleEdit = (promotion: Promotion) => {
        setForm({
            id: promotion.id,
            discountCode: promotion.discount_code,
            discountPercent: String(promotion.discount_percent),
            minOrderValue: String(promotion.min_order_value),
            startsAt: formatPromotionDateTimeInput(promotion.starts_at),
            expiresAt: formatPromotionDateTimeInput(promotion.expires_at),
            usageLimit: promotion.usage_limit === null ? "" : String(promotion.usage_limit),
            loyaltyPointsCost: promotion.loyalty_points_cost == null ? "" : String(promotion.loyalty_points_cost),
            active: promotion.active,
        });
    };

    const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const discountPercent = Number(form.discountPercent);
        const minOrderValue = Number(form.minOrderValue || 0);
        const usageLimit = form.usageLimit === "" ? null : Number(form.usageLimit);
        const loyaltyPointsCost = form.loyaltyPointsCost === "" ? null : Number(form.loyaltyPointsCost);

        if (!form.discountCode.trim() || !Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 90) {
            addToast("Promotions", "Enter a code and a discount between 1% and 90%.");
            return;
        }
        if (!Number.isFinite(minOrderValue) || minOrderValue < 0 || (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1))) {
            addToast("Promotions", "Check the minimum order and usage limit values.");
            return;
        }
        if (loyaltyPointsCost !== null && (!Number.isSafeInteger(loyaltyPointsCost) || loyaltyPointsCost < 1)) {
            addToast("Promotions", "Loyalty points cost must be a positive whole number.");
            return;
        }

        const payload = {
            discountCode: form.discountCode,
            discountPercent,
            minOrderValue,
            startsAt: form.startsAt ? localPromotionDateTimeToIso(form.startsAt) : null,
            expiresAt: form.expiresAt ? localPromotionDateTimeToIso(form.expiresAt) : null,
            usageLimit,
            loyaltyPointsCost,
            active: form.active,
        };

        try {
            setIsSaving(true);
            if (form.id) {
                await updatePromotion(form.id, payload);
                addToast("Promotions", "Promotion updated successfully.");
            } else {
                await createPromotion(payload);
                addToast("Promotions", "Promotion created successfully.");
            }
            setForm(emptyForm);
            const data = await fetchPromotions();
            setPromotions((data || []).map(normalizePromotion));
        } catch (err: unknown) {
            addToast("Promotions", getApiErrorMessage(err, "Unable to save promotion."));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!pendingDeactivatePromotion) {
            return;
        }
        try {
            setIsDeactivating(true);
            await deletePromotion(pendingDeactivatePromotion.id);
            addToast("Promotions", `${pendingDeactivatePromotion.discount_code} has been deactivated.`);
            setPendingDeactivatePromotion(null);
            const data = await fetchPromotions();
            setPromotions((data || []).map(normalizePromotion));
        } catch {
            addToast("Promotions", "Unable to deactivate promotion.");
        } finally {
            setIsDeactivating(false);
        }
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Promotions | Digital-E</title>
                <meta name="description" content="Manage discount codes and promotion rules." />
            </Helmet>
            <main className="admin__page admin__page--promotions">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Growth</span>
                        <h1 className="admin__page__title">Promotions</h1>
                        <p className="admin__page__subtitle">
                            Create discount codes, schedule campaigns, and control minimum order rules.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadPromotions}>Refresh</button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total promotions</span>
                        <strong>{promotionStats.total}</strong>
                        <p>All discount rules</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Active</span>
                        <strong>{promotionStats.active}</strong>
                        <p>Available at checkout</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Scheduled</span>
                        <strong>{promotionStats.scheduled}</strong>
                        <p>Starts in the future</p>
                    </div>
                </section>

                <section className="admin__card admin__card--promotion-editor">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>{form.id ? "Edit promotion" : "Create promotion"}</h3>
                            <span>Codes are normalized to uppercase for checkout.</span>
                        </div>
                        {form.id ? <span className="admin__pill admin__pill--info">Editing promotion</span> : null}
                    </div>
                    <form className="admin__promotion-form" onSubmit={handleSubmit}>
                        <div className="admin__promotion-form__fields">
                            <label htmlFor="promotion-code">
                                <span>Code <span className="admin__field-required" aria-hidden="true">*</span></span>
                            <input
                                id="promotion-code"
                                name="discountCode"
                                type="text"
                                value={form.discountCode}
                                onChange={(event) => setForm((current) => ({ ...current, discountCode: event.target.value }))}
                                placeholder="e.g. SPRING20…"
                                required
                                autoComplete="off"
                                spellCheck={false}
                            />
                            </label>
                            <label htmlFor="promotion-discount">
                                <span>Discount % <span className="admin__field-required" aria-hidden="true">*</span></span>
                            <input
                                id="promotion-discount"
                                name="discountPercent"
                                type="number"
                                min="1"
                                max="90"
                                step="1"
                                inputMode="numeric"
                                value={form.discountPercent}
                                onChange={(event) => setForm((current) => ({ ...current, discountPercent: event.target.value }))}
                                required
                            />
                            </label>
                            <label htmlFor="promotion-minimum">
                                <span>Minimum order</span>
                            <input
                                id="promotion-minimum"
                                name="minOrderValue"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={form.minOrderValue}
                                onChange={(event) => setForm((current) => ({ ...current, minOrderValue: event.target.value }))}
                            />
                            </label>
                            <label htmlFor="promotion-usage">
                                <span>Usage limit</span>
                            <input
                                id="promotion-usage"
                                name="usageLimit"
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                value={form.usageLimit}
                                onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))}
                                placeholder="Optional…"
                            />
                            </label>
                            <label htmlFor="promotion-loyalty-points">
                                <span>{t("adminPromotions.loyaltyPointsCost")}</span>
                                <input
                                    id="promotion-loyalty-points"
                                    name="loyaltyPointsCost"
                                    type="number"
                                    min="1"
                                    max="2147483647"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.loyaltyPointsCost}
                                    onChange={(event) => setForm((current) => ({ ...current, loyaltyPointsCost: event.target.value }))}
                                    aria-describedby="promotion-loyalty-points-help"
                                />
                                <small id="promotion-loyalty-points-help">{t("adminPromotions.loyaltyPointsHelp")}</small>
                            </label>
                            <label htmlFor="promotion-starts">
                                <span>Starts at</span>
                            <input
                                id="promotion-starts"
                                name="startsAt"
                                type="datetime-local"
                                value={form.startsAt}
                                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                            />
                            </label>
                            <label htmlFor="promotion-expires">
                                <span>Expires at</span>
                            <input
                                id="promotion-expires"
                                name="expiresAt"
                                type="datetime-local"
                                value={form.expiresAt}
                                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                            />
                            </label>
                        </div>
                        <div className="admin__promotion-preview">
                            <h4>Cart-value preview</h4>
                            <label htmlFor="promotion-preview-cart">Sample cart value</label>
                            <input
                                id="promotion-preview-cart"
                                type="number"
                                min="0"
                                step="1"
                                value={previewCartValue}
                                onChange={(event) => setPreviewCartValue(event.target.value)}
                            />
                            <p>{preview.eligible
                                ? `Discount ${formatCurrency(preview.discount)} · customer pays ${formatCurrency(preview.payable)}.`
                                : `Cart must reach ${formatCurrency(Number(form.minOrderValue) || 0)} to qualify.`}</p>
                        </div>
                        <div className="admin__promotion-form__footer">
                            <label className="admin__promotion-form__toggle" htmlFor="promotion-active">
                                <input
                                    id="promotion-active"
                                    name="active"
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                                />
                                <span>Active at checkout</span>
                            </label>
                            <div className="admin__form-grid__actions">
                            <button type="submit" className="admin__button admin__button--primary" disabled={isSaving}>
                                {isSaving ? "Saving…" : form.id ? "Save promotion" : "Create promotion"}
                            </button>
                            <button type="button" className="admin__button admin__button--ghost" onClick={() => setForm(emptyForm)}>
                                Reset
                            </button>
                            </div>
                        </div>
                    </form>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Promotion list</h3>
                            <span>{filteredPromotions.length} matching rules</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <label className="admin__sr-only" htmlFor="promotion-search">
                                    Search promotions
                                </label>
                                <input
                                    type="search"
                                    id="promotion-search"
                                    name="promotion-search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Search promotion code…"
                                />
                                <button type="button" className="admin__button admin__button--ghost" onClick={() => setSearchTerm("")}>
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        {loadError && !hasLoaded ? <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={loadPromotions} /> : null}
                        {isLoading && !hasLoaded ? <AdminStatusPanel variant="loading" title="Loading promotions" description="Fetching the latest discount rules." /> : null}
                        {loadError && hasLoaded ? <AdminStatusPanel variant="error" title="Refresh failed" description={loadError.message} onRetry={loadPromotions} retryLabel="Retry refresh" /> : null}
                        {!isLoading && !loadError && hasLoaded && filteredPromotions.length === 0 ? <AdminStatusPanel variant="empty" title="No promotions found" description="No promotion codes match the current search." /> : null}
                        {(!loadError || hasLoaded) && !(isLoading && !hasLoaded) && filteredPromotions.length > 0 ? <>
                        <AdminTableScrollHint label="Promotion list">
                        <Table responsive={false} hover borderless className="admin__table admin__table--promotions">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Discount</th>
                                    <th>{t("adminPromotions.loyaltyPointsCost")}</th>
                                    <th>Minimum</th>
                                    <th>Schedule</th>
                                    <th>Usage</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPromotions.map((promotion) => (
                                    <tr key={promotion.id}>
                                        <td width="180px">
                                            <strong>{promotion.discount_code}</strong>
                                        </td>
                                        <td width="120px">{promotion.discount_percent}%</td>
                                        <td width="170px">{promotion.loyalty_points_cost ? t("adminPromotions.loyaltyPointsReward", promotion.loyalty_points_cost) : t("adminPromotions.noLoyaltyCost")}</td>
                                        <td width="140px">{formatCurrency(promotion.min_order_value)}</td>
                                        <td width="260px">
                                            <div className="admin__table__stack">
                                                <span>{promotion.starts_at ? new Date(promotion.starts_at).toLocaleString() : "Starts now"}</span>
                                                <span>{promotion.expires_at ? new Date(promotion.expires_at).toLocaleString() : "No expiry"}</span>
                                            </div>
                                        </td>
                                        <td width="130px">
                                            {promotion.usage_count || 0} used{promotion.usage_limit === null ? "" : ` / ${promotion.usage_limit}`}
                                            {promotion.remaining_uses === null ? null : <small>{promotion.remaining_uses} remaining</small>}
                                        </td>
                                        <td width="120px">
                                            <span className={promotion.active ? "admin__pill admin__pill--success" : "admin__pill admin__pill--muted"}>
                                                {promotion.active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td width="180px">
                                            <div className="admin__table__actions">
                                                <button type="button" className="admin__button admin__button--ghost" onClick={() => handleEdit(promotion)}>
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="admin__button admin__button--danger"
                                                    onClick={() => setPendingDeactivatePromotion(promotion)}
                                                >
                                                    Deactivate
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint>
                        </> : null}
                    </div>
                </section>
                <ConfirmActionModal
                    show={pendingDeactivatePromotion !== null}
                    title="Deactivate promotion"
                    message={`Deactivate "${pendingDeactivatePromotion?.discount_code || "this promotion"}"? Customers will no longer be able to use it at checkout.`}
                    confirmLabel="Deactivate"
                    confirmVariant="warning"
                    isConfirming={isDeactivating}
                    onCancel={() => setPendingDeactivatePromotion(null)}
                    onConfirm={handleDeactivate}
                />
            </main>
        </AdminLayout>
    );
};

export default AdminPromotionsPage;

