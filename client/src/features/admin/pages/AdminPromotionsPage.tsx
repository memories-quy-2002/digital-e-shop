import React, { useEffect, useMemo, useState } from "react";
import { Table } from "react-bootstrap";
import axios from "../../../api/axios";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet";
import { useToast } from "../../../context/ToastContext";

type Promotion = {
    id: number;
    discount_code: string;
    discount_percent: number;
    active: boolean;
    min_order_value: number;
    starts_at: string | null;
    expires_at: string | null;
    usage_limit: number | null;
};

type PromotionForm = {
    id?: number;
    discountCode: string;
    discountPercent: string;
    minOrderValue: string;
    startsAt: string;
    expiresAt: string;
    usageLimit: string;
    active: boolean;
};

const emptyForm: PromotionForm = {
    discountCode: "",
    discountPercent: "",
    minOrderValue: "0",
    startsAt: "",
    expiresAt: "",
    usageLimit: "",
    active: true,
};

const normalizePromotion = (promotion: Promotion): Promotion => ({
    ...promotion,
    id: Number(promotion.id),
    discount_percent: Number(promotion.discount_percent) || 0,
    active: Boolean(promotion.active),
    min_order_value: Number(promotion.min_order_value) || 0,
    usage_limit: promotion.usage_limit === null ? null : Number(promotion.usage_limit) || null,
});

const formatDateInput = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 16);
};

const AdminPromotionsPage = () => {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [form, setForm] = useState<PromotionForm>(emptyForm);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    const fetchPromotions = async () => {
        try {
            const response = await axios.get("/api/promotions");
            if (response.status === 200) {
                setPromotions((response.data.promotions || []).map(normalizePromotion));
            }
        } catch {
            addToast("Promotions", "Unable to load promotions.");
        }
    };

    useEffect(() => {
        fetchPromotions();
    }, []);

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

    const handleEdit = (promotion: Promotion) => {
        setForm({
            id: promotion.id,
            discountCode: promotion.discount_code,
            discountPercent: String(promotion.discount_percent),
            minOrderValue: String(promotion.min_order_value),
            startsAt: formatDateInput(promotion.starts_at),
            expiresAt: formatDateInput(promotion.expires_at),
            usageLimit: promotion.usage_limit === null ? "" : String(promotion.usage_limit),
            active: promotion.active,
        });
    };

    const handleSubmit = async () => {
        const payload = {
            discountCode: form.discountCode,
            discountPercent: Number(form.discountPercent),
            minOrderValue: Number(form.minOrderValue || 0),
            startsAt: form.startsAt || null,
            expiresAt: form.expiresAt || null,
            usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
            active: form.active,
        };

        try {
            setIsSaving(true);
            if (form.id) {
                await axios.put(`/api/promotions/${form.id}`, payload);
                addToast("Promotions", "Promotion updated successfully.");
            } else {
                await axios.post("/api/promotions", payload);
                addToast("Promotions", "Promotion created successfully.");
            }
            setForm(emptyForm);
            fetchPromotions();
        } catch (err: any) {
            addToast("Promotions", err?.response?.data?.msg || "Unable to save promotion.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeactivate = async (promotion: Promotion) => {
        try {
            await axios.delete(`/api/promotions/${promotion.id}`);
            addToast("Promotions", `${promotion.discount_code} has been deactivated.`);
            fetchPromotions();
        } catch {
            addToast("Promotions", "Unable to deactivate promotion.");
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
                        <h2 className="admin__page__title">Promotions</h2>
                        <p className="admin__page__subtitle">
                            Create discount codes, schedule campaigns, and control minimum order rules.
                        </p>
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

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>{form.id ? "Edit promotion" : "Create promotion"}</h3>
                            <span>Codes are normalized to uppercase for checkout.</span>
                        </div>
                    </div>
                    <div className="admin__form-grid">
                        <label>
                            Code
                            <input
                                value={form.discountCode}
                                onChange={(event) => setForm((current) => ({ ...current, discountCode: event.target.value }))}
                                placeholder="SPRING20"
                            />
                        </label>
                        <label>
                            Discount %
                            <input
                                type="number"
                                min="1"
                                max="90"
                                value={form.discountPercent}
                                onChange={(event) => setForm((current) => ({ ...current, discountPercent: event.target.value }))}
                            />
                        </label>
                        <label>
                            Minimum order
                            <input
                                type="number"
                                min="0"
                                value={form.minOrderValue}
                                onChange={(event) => setForm((current) => ({ ...current, minOrderValue: event.target.value }))}
                            />
                        </label>
                        <label>
                            Usage limit
                            <input
                                type="number"
                                min="1"
                                value={form.usageLimit}
                                onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))}
                                placeholder="Optional"
                            />
                        </label>
                        <label>
                            Starts at
                            <input
                                type="datetime-local"
                                value={form.startsAt}
                                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                            />
                        </label>
                        <label>
                            Expires at
                            <input
                                type="datetime-local"
                                value={form.expiresAt}
                                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                            />
                        </label>
                        <label className="admin__form-grid__check">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                            />
                            Active
                        </label>
                        <div className="admin__form-grid__actions">
                            <button type="button" className="admin__button admin__button--primary" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving ? "Saving..." : form.id ? "Save promotion" : "Create promotion"}
                            </button>
                            <button type="button" className="admin__button admin__button--ghost" onClick={() => setForm(emptyForm)}>
                                Reset
                            </button>
                        </div>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Promotion list</h3>
                            <span>{filteredPromotions.length} matching rules</span>
                        </div>
                        <div className="admin__filters">
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search promotion code"
                            />
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Discount</th>
                                    <th>Minimum</th>
                                    <th>Schedule</th>
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
                                        <td width="140px">${promotion.min_order_value.toFixed(2)}</td>
                                        <td width="260px">
                                            <div className="admin__table__stack">
                                                <span>{promotion.starts_at ? new Date(promotion.starts_at).toLocaleString() : "Starts now"}</span>
                                                <span>{promotion.expires_at ? new Date(promotion.expires_at).toLocaleString() : "No expiry"}</span>
                                            </div>
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
                                                <button type="button" className="admin__button admin__button--danger" onClick={() => handleDeactivate(promotion)}>
                                                    Deactivate
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminPromotionsPage;

