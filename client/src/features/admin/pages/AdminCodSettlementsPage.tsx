import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import PrivateEvidenceUpload from "../components/PrivateEvidenceUpload";
import { useLocale } from "../../../context/LocaleContext";
import { getAdminRequestError } from "../utils/adminRequestError";
import { confirmCodRemittance, fetchCodSettlements } from "../operations.api";
import type { CodSettlement, FinancialEvidence } from "../operations.types";
import "../../../styles/features/admin/_operations.scss";

const copy = {
    en: { title: "COD settlements", subtitle: "Compare cash collected by delivery staff with store remittance and record bank transfers with private evidence.", collection: "Collected by delivery staff", remittance: "Remitted to store", deliveryFee: "Delivery fee", expected: "Expected COD", mismatch: "Mismatch", matched: "Matched", pending: "Pending", sandbox: "Sandbox record", reference: "Transfer reference", date: "Transfer date", amount: "Remitted amount (VND)", evidence: "Transfer evidence", submit: "Record remittance", submitting: "Recording…", retry: "Retry", empty: "No COD settlements", emptyDescription: "Settlements appear after a COD delivery is collected.", loadError: "Unable to load COD settlements", next: "Next settlements", noEvidence: "Upload transfer evidence before recording remittance.", feePending: "The delivery fee is not available yet. Refresh the settlement before recording remittance.", saved: "Remittance recorded." },
    vi: { title: "Đối soát COD", subtitle: "Đối chiếu tiền nhân viên giao hàng thu được với khoản nộp về cửa hàng và lưu chứng từ chuyển khoản riêng tư.", collection: "Nhân viên đã thu", remittance: "Đã nộp về cửa hàng", deliveryFee: "Phí giao hàng", expected: "COD dự kiến", mismatch: "Chênh lệch", matched: "Khớp", pending: "Đang chờ", sandbox: "Bản ghi sandbox", reference: "Mã tham chiếu chuyển khoản", date: "Ngày chuyển khoản", amount: "Số tiền nộp về (VND)", evidence: "Chứng từ chuyển khoản", submit: "Ghi nhận chuyển khoản", submitting: "Đang ghi nhận…", retry: "Thử lại", empty: "Chưa có đối soát COD", emptyDescription: "Đối soát xuất hiện sau khi nhân viên thu COD khi giao hàng.", loadError: "Không thể tải đối soát COD", next: "Đối soát tiếp theo", noEvidence: "Tải chứng từ trước khi ghi nhận chuyển khoản.", feePending: "Chưa có phí giao hàng cho đối soát này. Hãy tải lại trước khi ghi nhận chuyển khoản.", saved: "Đã ghi nhận chuyển khoản." },
} as const;

const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
const stateText = (status: string, strings: { matched: string; mismatch: string; pending: string }) => status === "MATCHED" ? strings.matched : status === "MISMATCH" ? strings.mismatch : strings.pending;

type Draft = { remittedVnd: string; transferReference: string; transferDate: string; evidence: FinancialEvidence | null };
const blankDraft = (): Draft => ({ remittedVnd: "", transferReference: "", transferDate: "", evidence: null });

const AdminCodSettlementsPage = () => {
    const { locale } = useLocale();
    const strings = copy[locale];
    const [settlements, setSettlements] = useState<CodSettlement[]>([]);
    const [nextAfterId, setNextAfterId] = useState<number | null>(null);
    const [cursor, setCursor] = useState<number | undefined>();
    const [drafts, setDrafts] = useState<Record<number, Draft>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [busyId, setBusyId] = useState<number | null>(null);
    const [actionError, setActionError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async (afterId?: number) => {
        setLoading(true);
        setLoadError("");
        try {
            const page = await fetchCodSettlements({ limit: 20, afterId });
            setSettlements(page.settlements);
            setNextAfterId(page.nextAfterId);
        } catch (error) {
            setLoadError(getAdminRequestError(error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(cursor); }, [cursor, load]);

    const updateDraft = (id: number, update: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || blankDraft()), ...update } }));
    const recordRemittance = async (settlement: CodSettlement) => {
        const draft = drafts[settlement.orderId] || blankDraft();
        const remittedVnd = Number(draft.remittedVnd);
        if (busyId !== null || settlement.actualCarrierFeeVnd == null || !Number.isSafeInteger(remittedVnd) || remittedVnd < 0 || !draft.transferReference.trim() || !draft.transferDate || !draft.evidence) return;
        setBusyId(settlement.orderId);
        setActionError("");
        setNotice("");
        try {
            await confirmCodRemittance(settlement.orderId, { remittedVnd, transferReference: draft.transferReference.trim(), transferDate: draft.transferDate, evidenceId: draft.evidence.id });
            updateDraft(settlement.orderId, blankDraft());
            setNotice(strings.saved);
            await load(cursor);
        } catch (error) {
            setActionError(getAdminRequestError(error).message);
        } finally {
            setBusyId(null);
        }
    };

    return <AdminLayout>
        <Helmet><title>{strings.title} | Digital-E</title></Helmet>
        <main className="admin__page admin__page--operations">
            <header className="admin__page__header"><div><span className="admin__page__eyebrow">Payments</span><h1 className="admin__page__title">{strings.title}</h1><p className="admin__page__subtitle">{strings.subtitle}</p></div><button type="button" className="admin__button admin__button--ghost" onClick={() => void load(cursor)}>{strings.retry}</button></header>
            {loadError ? <AdminStatusPanel variant="error" title={strings.loadError} description={loadError} onRetry={() => void load(cursor)} retryLabel={strings.retry} /> : null}
            {loading && !settlements.length ? <AdminStatusPanel variant="loading" title={strings.title} description={strings.submitting} /> : null}
            {actionError ? <p className="operations__alert" role="alert">{actionError}</p> : null}
            {notice ? <p className="operations__notice" role="status" aria-live="polite">{notice}</p> : null}
            {!loading && !loadError && settlements.length === 0 ? <AdminStatusPanel variant="empty" title={strings.empty} description={strings.emptyDescription} /> : null}
            <section className="operations__settlements" aria-label={strings.title}>
                {settlements.map((settlement) => {
                    const draft = drafts[settlement.orderId] || blankDraft();
                    const parsedAmount = Number(draft.remittedVnd);
                    const actualDeliveryFee = settlement.actualCarrierFeeVnd;
                    const canSubmit = actualDeliveryFee != null && Number.isSafeInteger(parsedAmount) && parsedAmount >= 0 && Boolean(draft.transferReference.trim()) && Boolean(draft.transferDate) && Boolean(draft.evidence) && busyId === null;
                    return <article className="admin__card operations__settlement" key={settlement.id}>
                        <header className="operations__settlement-head"><div><span className="admin__page__eyebrow">COD · {settlement.currency}</span><h2>Order #{settlement.orderId}</h2></div><span className={`admin__pill admin__pill--${settlement.status.toLowerCase()}`}>{stateText(settlement.status, strings)}</span></header>
                        {settlement.sandbox ? <p className="operations__sandbox" role="note">{strings.sandbox}</p> : null}
                        <dl className="operations__money-grid"><div><dt>{strings.expected}</dt><dd>{money(settlement.expectedCodVnd)}</dd></div><div><dt>{strings.collection}</dt><dd>{money(settlement.collectedVnd)}</dd></div><div><dt>{strings.deliveryFee}</dt><dd>{actualDeliveryFee == null ? "—" : money(actualDeliveryFee)}</dd></div><div><dt>{strings.remittance}</dt><dd>{money(settlement.remittedVnd)}</dd></div></dl>
                        {actualDeliveryFee == null ? <p className="operations__alert" role="status">{strings.feePending}</p> : null}
                        {settlement.status === "MISMATCH" && actualDeliveryFee != null ? <p className="operations__alert" role="status">{strings.mismatch}: {money(settlement.collectedVnd - actualDeliveryFee - settlement.remittedVnd)}</p> : null}
                        <form className="operations__form" onSubmit={(event) => { event.preventDefault(); void recordRemittance(settlement); }}>
                            <label>{strings.reference}<input name={`transferReference-${settlement.orderId}`} autoComplete="off" value={draft.transferReference} onChange={(event) => updateDraft(settlement.orderId, { transferReference: event.target.value })} required maxLength={191} /></label>
                            <label>{strings.date}<input name={`transferDate-${settlement.orderId}`} type="date" value={draft.transferDate} onChange={(event) => updateDraft(settlement.orderId, { transferDate: event.target.value })} required /></label>
                            <label>{strings.amount}<input name={`remittedVnd-${settlement.orderId}`} type="number" inputMode="numeric" step="1" min="0" value={draft.remittedVnd} onChange={(event) => updateDraft(settlement.orderId, { remittedVnd: event.target.value })} required /></label>
                            <PrivateEvidenceUpload label={strings.evidence} evidence={draft.evidence} onChange={(evidence) => updateDraft(settlement.orderId, { evidence })} />
                            {!draft.evidence ? <span className="operations__field-hint">{strings.noEvidence}</span> : null}
                            <button type="submit" className="admin__button admin__button--primary" disabled={!canSubmit}>{busyId === settlement.orderId ? strings.submitting : strings.submit}</button>
                        </form>
                    </article>;
                })}
            </section>
            {nextAfterId ? <nav className="operations__pagination" aria-label={strings.title}><button type="button" className="admin__button admin__button--ghost" onClick={() => setCursor(nextAfterId)} disabled={loading}>{strings.next}</button></nav> : null}
        </main>
    </AdminLayout>;
};

export default AdminCodSettlementsPage;
