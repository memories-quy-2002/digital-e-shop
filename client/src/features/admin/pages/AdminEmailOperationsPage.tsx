import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import { useLocale } from "../../../context/LocaleContext";
import { useAdminCopy } from "../../../hooks/useAdminCopy";
import { getAdminRequestError } from "../utils/adminRequestError";
import { fetchEmailOperations, retryEmail, runOperations } from "../operations.api";
import type { EmailOperation, TaskRunnerSummary } from "../operations.types";
import "../../../styles/features/admin/_operations.scss";

const copy = {
    en: { title: "Email operations", subtitle: "Inspect bounded delivery attempts and recover failed or uncertain messages.", recipient: "Masked recipient", event: "Event", state: "Delivery state", updated: "Updated", accepted: "Accepted by provider", delivered: "Delivered", sandbox: "Sandbox delivery", failed: "Failed", review: "Review required", queued: "Queued", sending: "Sending", bounced: "Bounced", unknown: "The provider may already have delivered this email. Resending can send a duplicate.", acknowledge: "I understand the first delivery may have completed.", confirm: "Confirm resend", cancel: "Cancel", retry: "Retry email", batch: "Runner batch size", run: "Run operations", running: "Running…", next: "Next messages", previous: "Previous messages", empty: "No email operations", emptyDescription: "Transactional email attempts will appear here.", loadError: "Unable to load email operations", success: "Runner finished", runEmpty: "No due operations were found.", runSummary: (summary: TaskRunnerSummary) => `Claimed ${summary.claimed}; succeeded ${summary.succeeded}; retried ${summary.retried}; failed ${summary.failed}; review ${summary.reviewRequired}.`, resendQueued: "A new email attempt was queued.", safeReason: "Safe failure code", error: "Unable to complete this email operation. Refresh the list and try again." },
    vi: { title: "Vận hành email", subtitle: "Theo dõi các lượt gửi có giới hạn và xử lý email lỗi hoặc chưa rõ kết quả.", recipient: "Người nhận đã ẩn", event: "Sự kiện", state: "Trạng thái gửi", updated: "Cập nhật", accepted: "Nhà cung cấp đã nhận", delivered: "Đã gửi đến", sandbox: "Lượt gửi sandbox", failed: "Thất bại", review: "Cần rà soát", queued: "Đang chờ", sending: "Đang gửi", bounced: "Bị trả lại", unknown: "Nhà cung cấp có thể đã gửi email này. Gửi lại có thể tạo email trùng.", acknowledge: "Tôi hiểu lượt gửi đầu có thể đã hoàn tất.", confirm: "Xác nhận gửi lại", cancel: "Huỷ", retry: "Gửi lại email", batch: "Số lượt xử lý", run: "Chạy vận hành", running: "Đang chạy…", next: "Email tiếp theo", previous: "Email trước", empty: "Chưa có hoạt động email", emptyDescription: "Các lượt gửi email giao dịch sẽ xuất hiện tại đây.", loadError: "Không thể tải hoạt động email", success: "Đã hoàn tất xử lý", runEmpty: "Không có tác vụ nào đến hạn để xử lý.", runSummary: (summary: TaskRunnerSummary) => `Đã nhận ${summary.claimed}; thành công ${summary.succeeded}; thử lại ${summary.retried}; lỗi ${summary.failed}; cần rà soát ${summary.reviewRequired}.`, resendQueued: "Đã đưa lượt gửi email mới vào hàng đợi.", safeReason: "Mã lỗi an toàn", error: "Không thể hoàn tất thao tác email. Hãy tải lại danh sách và thử lại." },
} as const;

const statusLabels = (strings: { accepted: string; delivered: string; sandbox: string; failed: string; review: string; queued: string; sending: string; bounced: string }): Record<string, string> => ({
    ACCEPTED: strings.accepted, DELIVERED: strings.delivered, SANDBOX: strings.sandbox, FAILED: strings.failed,
    REVIEW_REQUIRED: strings.review, QUEUED: strings.queued, SENDING: strings.sending, BOUNCED: strings.bounced,
});
const statusClass = (state: string) => state.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const dateLabel = (value: string, locale: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const MAX_LIMIT = 100;

const AdminEmailOperationsPage = () => {
    const { locale } = useLocale();
    const tx = useAdminCopy();
    const strings = copy[locale];
    const labels = statusLabels(strings);
    const [messages, setMessages] = useState<EmailOperation[]>([]);
    const [nextAfterId, setNextAfterId] = useState<number | null>(null);
    const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
    const [pageIndex, setPageIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [notice, setNotice] = useState("");
    const [runnerLimit, setRunnerLimit] = useState("20");
    const [runnerBusy, setRunnerBusy] = useState(false);
    const [summary, setSummary] = useState<TaskRunnerSummary | null>(null);
    const [pendingRetry, setPendingRetry] = useState<EmailOperation | null>(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [retryBusy, setRetryBusy] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const load = useCallback(async (afterId?: number) => {
        setLoading(true);
        setLoadError("");
        try {
            const page = await fetchEmailOperations({ limit: 25, afterId });
            setMessages(page.messages);
            setNextAfterId(page.nextAfterId);
        } catch (error) {
            setLoadError(getAdminRequestError(error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(cursors[pageIndex]); }, [cursors, load, pageIndex]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (pendingRetry && dialog && !dialog.open) {
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
        }
        if (!pendingRetry && dialog?.open) {
            if (typeof dialog.close === "function") dialog.close();
            else dialog.removeAttribute("open");
        }
    }, [pendingRetry]);

    const openRetry = (message: EmailOperation) => {
        setPendingRetry(message);
        setAcknowledged(false);
        setActionError("");
    };
    const requiresAcknowledgement = pendingRetry ? ["ACCEPTED", "REVIEW_REQUIRED"].includes(pendingRetry.state.toUpperCase()) : false;
    const confirmRetry = async () => {
        if (!pendingRetry || retryBusy || (requiresAcknowledgement && !acknowledged)) return;
        setRetryBusy(true);
        setActionError("");
        try {
            await retryEmail(pendingRetry.id, requiresAcknowledgement && acknowledged);
            setPendingRetry(null);
            setNotice(strings.resendQueued);
            await load(cursors[pageIndex]);
        } catch {
            setActionError(strings.error);
        } finally {
            setRetryBusy(false);
        }
    };
    const run = async () => {
        if (runnerBusy) return;
        const parsed = Number(runnerLimit);
        const bounded = Number.isFinite(parsed) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed))) : 20;
        setRunnerLimit(String(bounded));
        setRunnerBusy(true);
        setActionError("");
        setSummary(null);
        try {
            const result = await runOperations(bounded);
            setSummary(result);
            setNotice(strings.success);
            await load(cursors[pageIndex]);
        } catch {
            setActionError(strings.error);
        } finally {
            setRunnerBusy(false);
        }
    };
    const next = () => {
        if (!nextAfterId || loading) return;
        setCursors((current) => [...current.slice(0, pageIndex + 1), nextAfterId]);
        setPageIndex((current) => current + 1);
    };
    const previous = () => { if (pageIndex > 0 && !loading) setPageIndex((current) => current - 1); };

    return <AdminLayout>
        <Helmet><title>{strings.title} | Digital-E</title></Helmet>
        <main className="admin__page admin__page--operations">
            <header className="admin__page__header"><div><span className="admin__page__eyebrow">{tx("Operations")}</span><h1 className="admin__page__title">{strings.title}</h1><p className="admin__page__subtitle">{strings.subtitle}</p></div></header>
            <section className="admin__card operations__runner" aria-label={strings.title}>
                <label htmlFor="runner-limit">{strings.batch}<input id="runner-limit" name="runnerLimit" type="number" inputMode="numeric" min="1" max={MAX_LIMIT} step="1" value={runnerLimit} onChange={(event) => setRunnerLimit(event.target.value)} /></label>
                <button type="button" className="admin__button admin__button--primary" onClick={() => void run()} disabled={runnerBusy}>{runnerBusy ? strings.running : strings.run}</button>
            </section>
            {summary ? <p className="operations__notice operations__runner-summary" role="status" aria-live="polite">{summary.claimed === 0 ? strings.runEmpty : <><strong>{strings.success}.</strong> {strings.runSummary(summary)}</>}</p> : null}
            {actionError ? <p className="operations__alert" role="alert">{actionError}</p> : null}
            {notice && !summary ? <p className="operations__notice" role="status" aria-live="polite">{notice}</p> : null}
            {loadError ? <AdminStatusPanel variant="error" title={strings.loadError} description={loadError} onRetry={() => void load(cursors[pageIndex])} /> : null}
            {loading && !messages.length ? <AdminStatusPanel variant="loading" title={strings.title} description={strings.running} /> : null}
            {!loading && !loadError && messages.length === 0 ? <AdminStatusPanel variant="empty" title={strings.empty} description={strings.emptyDescription} /> : null}
            <div className="operations__table-wrap"><table className="operations__table"><thead><tr><th scope="col">#</th><th scope="col">{strings.event}</th><th scope="col">{strings.recipient}</th><th scope="col">{strings.state}</th><th scope="col">{strings.updated}</th><th scope="col">{strings.safeReason}</th><th scope="col"><span className="operations__sr-only">{tx("Actions")}</span></th></tr></thead><tbody>
                {messages.map((message) => {
                    const key = message.state.toUpperCase();
                    const canRetry = ["FAILED", "ACCEPTED", "REVIEW_REQUIRED"].includes(key);
                    return <tr key={message.id}>
                        <th scope="row">{message.id}</th><td>{message.eventType.replaceAll("_", " ")}</td>
                        <td><span className="operations__masked" translate="no">{message.recipientMasked}</span></td>
                        <td><span className={`admin__pill admin__pill--${statusClass(key)}`}>{labels[key] || key}</span></td>
                        <td>{dateLabel(message.updatedAt, locale)}</td><td><code translate="no">{message.lastErrorCode || "—"}</code></td>
                        <td>{canRetry ? <button type="button" className="admin__button admin__button--ghost admin__button--compact" aria-label={`${strings.retry} #${message.id}`} onClick={() => openRetry(message)}>{strings.retry}</button> : null}</td>
                    </tr>;
                })}
            </tbody></table></div>
            <nav className="operations__pagination" aria-label={strings.title}><button type="button" className="admin__button admin__button--ghost" onClick={previous} disabled={pageIndex === 0 || loading}>{strings.previous}</button><button type="button" className="admin__button admin__button--ghost" onClick={next} disabled={!nextAfterId || loading}>{strings.next}</button></nav>
            {pendingRetry ? <dialog ref={dialogRef} aria-labelledby="resend-title" aria-describedby="resend-description" className="operations__dialog" onCancel={(event) => { event.preventDefault(); setPendingRetry(null); }}><h2 id="resend-title">{strings.confirm}</h2><p id="resend-description">{requiresAcknowledgement ? strings.unknown : `${strings.retry} #${pendingRetry.id}`}</p>{requiresAcknowledgement ? <label className="operations__ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{strings.acknowledge}</label> : null}<div className="operations__dialog-actions"><button type="button" className="admin__button admin__button--ghost" onClick={() => setPendingRetry(null)} disabled={retryBusy}>{strings.cancel}</button><button type="button" className="admin__button admin__button--primary" onClick={() => void confirmRetry()} disabled={retryBusy || (requiresAcknowledgement && !acknowledged)}>{retryBusy ? strings.running : strings.confirm}</button></div></dialog> : null}
        </main>
    </AdminLayout>;
};

export default AdminEmailOperationsPage;
