import { useRef, useState, type FormEvent } from "react";
import { useT } from "../../../hooks/useT";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { CURRENCY_CODE } from "../../../constants/currency";
import { formatMoney } from "../../../utils/currency";
import type { GuestOrderItem } from "../../orders/types";
import { AFTER_SALES_PAGINATION, AFTER_SALES_REQUEST_REASON_MAX_LENGTH, AFTER_SALES_STATUS_TRANSLATION_KEYS } from "../constants";
import { createGuestAfterSalesRequest, fetchGuestAfterSalesRequests } from "../api";
import { getStableIdempotencyKey, type StableIdempotencyKey } from "../idempotency";
import { AFTER_SALES_KIND, type AfterSalesKind, type AfterSalesRequest } from "../types";

type Props = { orderId: number; guestOrderToken: string; currency?: string | null; items: GuestOrderItem[] };

const GuestAfterSalesPanel = ({ orderId, guestOrderToken, currency, items }: Props) => {
    const t = useT();
    const [kind, setKind] = useState<AfterSalesKind>(AFTER_SALES_KIND.RETURN);
    const [reason, setReason] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [requests, setRequests] = useState<AfterSalesRequest[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const idempotencyKeyRef = useRef<StableIdempotencyKey | null>(null);

    const load = async () => {
        try {
            setMessage(null);
            setExpanded(true);
            const page = await fetchGuestAfterSalesRequests(orderId, guestOrderToken, {
                page: AFTER_SALES_PAGINATION.FIRST_PAGE,
                limit: AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE,
            });
            setRequests(page.requests);
        } catch (error) {
            setMessage(getApiErrorMessage(error, t("afterSales.loadError")));
        }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const selectedItems = Object.entries(quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([orderItemId, quantity]) => ({ orderItemId: Number(orderItemId), quantity }));

        if (!selectedItems.length || !reason.trim()) {
            setMessage(t("afterSales.guestValidationError"));
            return;
        }

        try {
            setBusy(true);
            setMessage(null);
            const payload = { orderId, guestOrderToken, kind, reason: reason.trim(), items: selectedItems };
            const idempotencyRequest = getStableIdempotencyKey(payload, idempotencyKeyRef.current);
            idempotencyKeyRef.current = idempotencyRequest;
            await createGuestAfterSalesRequest({ ...payload, idempotencyKey: idempotencyRequest.key });
            idempotencyKeyRef.current = null;
            setReason("");
            setQuantities({});
            await load();
        } catch (error) {
            setMessage(getApiErrorMessage(error, t("afterSales.submitError")));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="guest-order__after-sales" aria-label={t("afterSales.guestAriaLabel")}>
            <div className="guest-order__after-sales-header">
                <div>
                    <span className="guest-order__eyebrow">{t("afterSales.eyebrow")}</span>
                    <h3>{t("afterSales.guestHeading")}</h3>
                    <p>{t("afterSales.guestDescription")}</p>
                </div>
                <button type="button" onClick={() => void load()}>
                    {expanded ? t("afterSales.refreshRequests") : t("afterSales.viewRequests")}
                </button>
            </div>

            {expanded ? (
                <>
                    <form onSubmit={submit}>
                        <label>
                            {t("afterSales.requestType")}
                            <select value={kind} onChange={(event) => setKind(event.target.value as AfterSalesKind)}>
                                <option value={AFTER_SALES_KIND.RETURN}>{t("afterSales.returnKind")}</option>
                                <option value={AFTER_SALES_KIND.WARRANTY}>{t("afterSales.warranty")}</option>
                            </select>
                        </label>
                        <div className="guest-order__after-sales-items">
                            {items.map((item) => {
                                const itemId = Number(item.orderItemId || 0);
                                const itemCurrency = currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND;

                                return (
                                    <label key={itemId}>
                                        <span>
                                            <strong>{item.productName}</strong>
                                            <small>{formatMoney(item.totalPrice, itemCurrency)} · {t("afterSales.maxQuantity", item.quantity)}</small>
                                        </span>
                                        <input
                                            aria-label={t("afterSales.quantityLabel", item.productName)}
                                            type="number"
                                            min="0"
                                            max={item.quantity}
                                            value={quantities[itemId] || 0}
                                            onChange={(event) => setQuantities((current) => ({
                                                ...current,
                                                [itemId]: Number(event.target.value) || 0,
                                            }))}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                        <label>
                            {t("afterSales.issueLabel")}
                            <textarea
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                rows={3}
                                maxLength={AFTER_SALES_REQUEST_REASON_MAX_LENGTH}
                                placeholder={t("afterSales.issuePlaceholder")}
                            />
                        </label>
                        <button type="submit" disabled={busy}>
                            {busy ? t("afterSales.submitting") : t("afterSales.submit")}
                        </button>
                    </form>

                    <div className="guest-order__after-sales-list">
                        {requests.length ? requests.map((request) => (
                            <article key={request.id}>
                                <strong>#{request.id} · {request.kind === AFTER_SALES_KIND.RETURN ? t("afterSales.returnKind") : t("afterSales.warranty")}</strong>
                                <span>{t(`afterSales.status.${AFTER_SALES_STATUS_TRANSLATION_KEYS[request.status]}`)}</span>
                                <p>{request.reason}</p>
                            </article>
                        )) : <p>{t("afterSales.guestNoRequests")}</p>}
                    </div>
                </>
            ) : null}

            {message ? <div className="guest-order__error" role="alert">{message}</div> : null}
        </section>
    );
};

export default GuestAfterSalesPanel;
