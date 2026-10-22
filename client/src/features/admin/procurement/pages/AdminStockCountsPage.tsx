import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../../components/layout/AdminLayout";
import AdminStatusPanel from "../../components/AdminStatusPanel";
import AdminTableScrollHint from "../../components/AdminTableScrollHint";
import { useLocale } from "../../../../context/LocaleContext";
import { useToast } from "../../../../context/ToastContext";
import { useAdminCopy } from "../../../../hooks/useAdminCopy";
import { fetchAdminProductsPage } from "../../api";
import { getAdminRequestError } from "../../utils/adminRequestError";
import { createStockCount, fetchStockCount, fetchStockCounts, transitionStockCount, updateStockCount } from "../api";
import { procurementCopy as copy } from "../copy";
import ProcurementPageHeader from "../components/ProcurementPageHeader";
import type { ProductChoice, StockCount, StockCountConflictItem, StockCountItem } from "../types";
import { formatDate, safeInteger, statusClassName } from "../utils";
import "../procurement.scss";

type Observation = { countedQuantity: string; reason: string };
const AdminStockCountsPage = () => {
    const { locale } = useLocale();
    const { addToast } = useToast();
    const tx = useAdminCopy();
    const [counts, setCounts] = useState<StockCount[]>([]);
    const [products, setProducts] = useState<ProductChoice[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
    const [productSearch, setProductSearch] = useState("");
    const [count, setCount] = useState<StockCount | null>(null);
    const [observations, setObservations] = useState<Record<number, Observation>>({});
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflicts, setConflicts] = useState<StockCountConflictItem[]>([]);
    const [confirmAction, setConfirmAction] = useState<"cancel" | "reopen" | null>(null);
    const [actionReason, setActionReason] = useState("");

    const load = useCallback(async (nextPage = page) => {
        setLoading(true); setError("");
        try {
            const result = await fetchStockCounts({ page: nextPage, limit: 25, status: status || undefined });
            setCounts(result.items); setPage(result.pagination.page); setTotalPages(result.pagination.totalPages); setLoaded(true);
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
        finally { setLoading(false); }
    }, [page, status]);
    useEffect(() => { void load(page); }, [load, page]);
    useEffect(() => {
        const timer = window.setTimeout(async () => {
            try {
                const result = await fetchAdminProductsPage({ page: 1, limit: 100, search: productSearch.trim() || undefined, stock: "all" });
                setProducts(result.items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, stock: Number(item.stock) || 0 })));
            } catch (requestError) { setError(getAdminRequestError(requestError).message); }
        }, 250);
        return () => window.clearTimeout(timer);
    }, [productSearch]);

    const inspect = async (item: StockCount) => {
        setError(""); setConflicts([]);
        try {
            const detail = await fetchStockCount(item.id);
            setCount(detail);
            setObservations(Object.fromEntries(detail.items.map((row) => [row.id, { countedQuantity: row.countedQuantity == null ? "" : String(row.countedQuantity), reason: row.reason ?? "" }])));
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
    };
    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); if (!selectedProducts.length) return;
        setBusy(true); setError("");
        try {
            const created = await createStockCount({ productIds: selectedProducts });
            addToast(copy(locale, "Count created", "Đã tạo phiên kiểm kê"), copy(locale, "The saved baseline is ready for physical counting.", "Mốc tồn kho đã được lưu để bắt đầu kiểm đếm."));
            setSelectedProducts([]); await inspect(created); await load(1);
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
        finally { setBusy(false); }
    };
    const save = async (): Promise<StockCount | null> => {
        if (!count) return null;
        const values = count.items.map((item) => ({ item, observation: observations[item.id] ?? { countedQuantity: "", reason: "" } }));
        if (values.some(({ observation }) => observation.countedQuantity.trim() === "" || !Number.isSafeInteger(safeInteger(observation.countedQuantity)) || safeInteger(observation.countedQuantity) < 0)) {
            setError(copy(locale, "Enter a whole, non-negative count for every product.", "Nhập số lượng nguyên không âm cho từng sản phẩm.")); return null;
        }
        if (values.some(({ item, observation }) => safeInteger(observation.countedQuantity) !== item.baselineStock && observation.reason.trim().length < 8)) {
            setError(copy(locale, "Add a reason of at least 8 characters for each count that differs from its saved baseline.", "Nhập lý do ít nhất 8 ký tự cho mỗi số đếm khác mốc tồn đã lưu.")); return null;
        }
        setBusy(true); setError("");
        try {
            const updated = await updateStockCount(count.id, { version: count.version, observations: values.map(({ item, observation }) => ({ itemId: item.id, countedQuantity: safeInteger(observation.countedQuantity), reason: observation.reason.trim() || undefined })) });
            setCount(updated); setObservations(Object.fromEntries(updated.items.map((row) => [row.id, { countedQuantity: String(row.countedQuantity ?? ""), reason: row.reason ?? "" }])));
            addToast(copy(locale, "Count saved", "Đã lưu kết quả kiểm kê"), copy(locale, "Review the differences and reservation commitments before submitting.", "Hãy xem chênh lệch và lượng hàng đang giữ trước khi gửi duyệt.")); await load(page);
            return updated;
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
        finally { setBusy(false); }
        return null;
    };
    const action = async (name: "submit" | "approve" | "cancel" | "reopen", sourceCount = count) => {
        if (!sourceCount) return;
        setBusy(true); setError(""); setConflicts([]);
        try {
            const input = name === "cancel" ? { version: sourceCount.version, reason: actionReason.trim() }
                : name === "reopen" ? { version: sourceCount.version, itemIds: sourceCount.items.filter((item) => !conflicts.length || conflicts.some((conflict) => conflict.productId === item.productId)).map((item) => item.id), reason: actionReason.trim() }
                    : { version: sourceCount.version };
            const updated = await transitionStockCount(sourceCount.id, name, input);
            setCount(updated); setObservations(Object.fromEntries(updated.items.map((item) => [item.id, { countedQuantity: item.countedQuantity == null ? "" : String(item.countedQuantity), reason: item.reason ?? "" }]))); setConfirmAction(null); setActionReason("");
            addToast(copy(locale, "Count updated", "Đã cập nhật phiên kiểm kê"), copy(locale, `Stock count ${name} completed.`, `Đã hoàn tất thao tác ${name === "submit" ? "gửi duyệt" : name === "approve" ? "phê duyệt" : name === "cancel" ? "hủy" : "mở lại"}.`));
            await load(page);
        } catch (requestError) {
            const candidate = requestError && typeof requestError === "object" ? requestError as { response?: { data?: { code?: string; details?: { items?: StockCountConflictItem[] } } } } : {};
            const data = candidate.response?.data;
            if (data?.code === "STOCK_COUNT_CONFLICT" && Array.isArray(data.details?.items)) setConflicts(data.details.items);
            setError(data?.code === "STOCK_COUNT_CONFLICT" ? copy(locale, "Approval was blocked because stock changed or reservations now exceed a counted quantity. Review the conflicts below, reopen the affected lines, recount, then submit again.", "Không thể duyệt vì tồn kho đã thay đổi hoặc lượng giữ chỗ vượt số đếm. Xem xung đột bên dưới, mở lại dòng bị ảnh hưởng, kiểm đếm lại rồi gửi duyệt.") : getAdminRequestError(requestError).message);
        } finally { setBusy(false); }
    };

    return <AdminLayout>
        <Helmet><title>{copy(locale, "Stock counts", "Kiểm kê kho")} | Digital-E</title></Helmet>
        <main className="admin__page admin__page--procurement">
            <ProcurementPageHeader locale={locale} page="stock-counts" />
            {error ? <AdminStatusPanel variant="error" title={copy(locale, "Stock count needs attention", "Cần kiểm tra phiên kiểm kê")} description={error} onRetry={() => void load(1)} retryLabel={tx("Retry")} /> : null}
            {conflicts.length ? <div className="procurement__count-conflict" role="alert"><strong>{copy(locale, "Live stock conflicts", "Xung đột tồn kho hiện tại")}</strong><p>{copy(locale, "The captured baseline is no longer safe to apply. Reopen these items to capture a fresh baseline, then recount them.", "Mốc kiểm kê đã cũ hoặc không đủ cho lượng đang giữ. Mở lại các dòng này để lấy mốc mới rồi kiểm đếm lại.")}</p><ul>{conflicts.map((item) => <li key={item.productId}><strong>{item.sku ?? `#${item.productId}`} · {item.productName ?? ""}</strong>: {item.reason === "STALE_STOCK" ? copy(locale, `Stock changed (revision ${item.expectedRevision} → ${item.currentRevision}).`, `Tồn kho đã đổi (phiên bản ${item.expectedRevision} → ${item.currentRevision}).`) : item.reason === "RESERVATION_SHORTFALL" ? copy(locale, `${item.activeReservedQuantity} units are reserved against a lower count.`, `${item.activeReservedQuantity} đơn vị đang được giữ, nhiều hơn số đếm.`) : copy(locale, "Product is no longer active.", "Sản phẩm không còn hoạt động.")}</li>)}</ul></div> : null}
            <div className="procurement__split">
                <section className="admin__card procurement__panel">
                    <div className="admin__card__header admin__card__header--stacked"><div><h2>{copy(locale, "Count sessions", "Phiên kiểm kê")}</h2><span>{copy(locale, "Drafts have no stock effect until approved.", "Bản nháp không làm thay đổi tồn kho cho đến khi được duyệt.")}</span></div><label className="procurement__filter-label">{copy(locale, "Status", "Trạng thái")}<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">{copy(locale, "All statuses", "Tất cả trạng thái")}</option>{["DRAFT", "SUBMITTED", "APPROVED", "CANCELED"].map((value) => <option key={value} value={value}>{copy(locale, value, ({ DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", CANCELED: "Đã hủy" } as Record<string, string>)[value])}</option>)}</select></label></div>
                    {loading && !loaded ? <AdminStatusPanel variant="loading" title={copy(locale, "Loading stock counts", "Đang tải phiên kiểm kê")} description={copy(locale, "Fetching count sessions.", "Đang tải dữ liệu kiểm kê.")} /> : null}
                    {!loading && loaded && !counts.length ? <AdminStatusPanel variant="empty" title={copy(locale, "No count sessions", "Chưa có phiên kiểm kê")} description={copy(locale, "Create a session to capture a baseline for selected products.", "Tạo phiên để lưu mốc tồn của các sản phẩm được chọn.")} /> : null}
                    {counts.length ? <AdminTableScrollHint label={copy(locale, "Stock count sessions", "Danh sách phiên kiểm kê")}><table className="admin__table procurement__table"><thead><tr><th>{copy(locale, "Session", "Phiên")}</th><th>{copy(locale, "Products", "Sản phẩm")}</th><th>{copy(locale, "Created", "Ngày tạo")}</th><th>{copy(locale, "Status", "Trạng thái")}</th><th>{copy(locale, "Action", "Thao tác")}</th></tr></thead><tbody>{counts.map((item) => <tr key={item.id}><td><strong>SC-{item.id}</strong></td><td>{item.items.length}</td><td>{formatDate(item.createdAt, locale)}</td><td><span className={`procurement__status is-${statusClassName(item.status)}`}>{copy(locale, item.status, ({ DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", CANCELED: "Đã hủy" } as Record<string, string>)[item.status])}</span></td><td><button className="admin__button admin__button--ghost admin__button--compact" type="button" onClick={() => void inspect(item)}>{copy(locale, "Review", "Xem")}</button></td></tr>)}</tbody></table></AdminTableScrollHint> : null}
                    {totalPages > 1 ? <div className="procurement__pagination"><button className="admin__button admin__button--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{copy(locale, "Previous", "Trước")}</button><span>{page} / {totalPages}</span><button className="admin__button admin__button--ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{copy(locale, "Next", "Sau")}</button></div> : null}
                </section>
                <div className="procurement__section-stack">
                    {!count ? <section className="admin__card procurement__panel"><div className="admin__card__header"><div><h2>{copy(locale, "Start a count", "Tạo phiên kiểm kê")}</h2><p>{copy(locale, "The system records current stock and revision when the session is created.", "Hệ thống lưu tồn kho và phiên bản tại thời điểm tạo phiên.")}</p></div></div><div className="procurement__count-instructions"><strong>{copy(locale, "Count unallocated warehouse units", "Đếm hàng trong kho chưa phân bổ")}</strong><p>{copy(locale, "Count sellable units that are not already deducted for placed orders. Include units held by pending checkout reservations; do not add them a second time. Exclude sold goods awaiting dispatch, rejected deliveries, and quarantined or damaged goods.", "Đếm hàng bán được chưa bị trừ cho đơn đã đặt. Bao gồm hàng đang được giữ bởi phiên thanh toán chưa hoàn tất; không cộng phần giữ này thêm lần nữa. Loại trừ hàng đã bán chờ giao, hàng giao bị từ chối và hàng hư hỏng/cách ly.")}</p></div><form className="procurement__form" onSubmit={(event) => void create(event)}><label className="procurement__form__wide">{copy(locale, "Find products", "Tìm sản phẩm")}<input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={copy(locale, "Search SKU or product name…", "Tìm SKU hoặc tên sản phẩm…")} /></label><div className="procurement__product-picker procurement__form__wide" role="group" aria-label={copy(locale, "Products to count", "Sản phẩm cần kiểm kê")}>{products.length ? products.map((product) => <label key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={(event) => setSelectedProducts((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} /><span><strong>{product.name}</strong><small>{product.sku} · {product.stock} {copy(locale, "in stock", "trong kho")}</small></span></label>) : <p className="procurement__empty">{copy(locale, "No matching products.", "Không tìm thấy sản phẩm phù hợp.")}</p>}</div><div className="procurement__form__actions"><button className="admin__button admin__button--primary" type="submit" disabled={busy || selectedProducts.length === 0}>{busy ? copy(locale, "Creating…", "Đang tạo…") : copy(locale, `Create count (${selectedProducts.length})`, `Tạo phiên (${selectedProducts.length})`)}</button></div></form></section> : <section className="admin__card procurement__panel">
                        <div className="admin__card__header admin__card__header--stacked"><div><h2>{copy(locale, `Count SC-${count.id}`, `Kiểm kê SC-${count.id}`)}</h2><span>{copy(locale, count.status, ({ DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", CANCELED: "Đã hủy" } as Record<string, string>)[count.status])} · {formatDate(count.createdAt, locale)}</span></div><button className="admin__button admin__button--ghost" type="button" onClick={() => setCount(null)}>{tx("Close")}</button></div>
                        <div className="procurement__count-instructions"><strong>{copy(locale, "Count basis", "Mốc đối chiếu")}</strong><p>{copy(locale, "Baseline and stock revision were captured when this session was created. Reservations are checked again at approval; counting does not change inventory.", "Tồn kho và phiên bản được ghi lại lúc tạo phiên. Lượng giữ chỗ sẽ được kiểm tra lại khi duyệt; thao tác đếm không thay đổi tồn kho.")}</p></div>
                        <AdminTableScrollHint label={copy(locale, "Count review", "Bảng kết quả kiểm kê")}><table className="admin__table procurement__table"><thead><tr><th>{copy(locale, "Product", "Sản phẩm")}</th><th>{copy(locale, "Baseline", "Tồn gốc")}</th><th>{copy(locale, "Revision", "Phiên bản")}</th><th>{copy(locale, "Reserved now", "Đang giữ")}</th><th>{copy(locale, "Counted", "Đã đếm")}</th><th>{copy(locale, "Difference", "Chênh lệch")}</th><th>{copy(locale, "Reason", "Lý do")}</th></tr></thead><tbody>{count.items.map((item: StockCountItem) => { const value = observations[item.id] ?? { countedQuantity: "", reason: "" }; const difference = value.countedQuantity === "" ? null : safeInteger(value.countedQuantity) - item.baselineStock; const editable = count.status === "DRAFT"; return <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.sku}</small></td><td>{item.baselineStock}</td><td><code>{item.baselineRevision}</code></td><td>{item.activeReservedQuantity}</td><td>{editable ? <input className="procurement__inline-input" aria-label={copy(locale, `Counted quantity for ${item.productName}`, `Số lượng đếm của ${item.productName}`)} type="number" min="0" step="1" value={value.countedQuantity} onChange={(event) => setObservations((current) => ({ ...current, [item.id]: { ...value, countedQuantity: event.target.value } }))} /> : item.countedQuantity ?? "—"}</td><td>{editable ? difference ?? "—" : item.difference ?? "—"}</td><td>{editable ? <input className="procurement__inline-input" aria-label={copy(locale, `Reason for ${item.productName}`, `Lý do của ${item.productName}`)} maxLength={500} value={value.reason} onChange={(event) => setObservations((current) => ({ ...current, [item.id]: { ...value, reason: event.target.value } }))} /> : item.reason || "—"}</td></tr>; })}</tbody></table></AdminTableScrollHint>
                        {count.status === "SUBMITTED" || count.status === "APPROVED" ? <div className="procurement__notice"><strong>{copy(locale, "Review summary", "Tóm tắt kiểm tra")}</strong><p>{count.items.filter((item) => (item.difference ?? 0) > 0).length} {copy(locale, "increases", "tăng")} · {count.items.filter((item) => (item.difference ?? 0) < 0).length} {copy(locale, "decreases", "giảm")} · {count.items.reduce((sum, item) => sum + (item.activeReservedQuantity || 0), 0)} {copy(locale, "units currently reserved; commitments are checked again on approval.", "đơn vị đang được giữ; lượng giữ sẽ được kiểm tra lại khi duyệt.")}</p></div> : null}
                        <div className="procurement__form__actions procurement__count-actions">{count.status === "DRAFT" ? <><button className="admin__button admin__button--ghost" type="button" disabled={busy} onClick={() => void save()}>{copy(locale, "Save counts", "Lưu số đếm")}</button><button className="admin__button admin__button--primary" type="button" disabled={busy || count.items.some((item) => observations[item.id]?.countedQuantity === "")} onClick={async () => { const saved = await save(); if (saved) await action("submit", saved); }}>{copy(locale, "Submit for review", "Gửi duyệt")}</button><button className="admin__button admin__button--danger" type="button" onClick={() => { setConfirmAction("cancel"); setActionReason(""); }}>{tx("Cancel")}</button></> : null}{count.status === "SUBMITTED" ? <><button className="admin__button admin__button--primary" type="button" disabled={busy} onClick={() => void action("approve")}>{copy(locale, "Approve adjustments", "Duyệt điều chỉnh")}</button><button className="admin__button admin__button--ghost" type="button" onClick={() => { setConfirmAction("reopen"); setActionReason(""); }}>{copy(locale, "Reopen to recount", "Mở lại để đếm")}</button><button className="admin__button admin__button--danger" type="button" onClick={() => { setConfirmAction("cancel"); setActionReason(""); }}>{tx("Cancel")}</button></> : null}</div>
                        {confirmAction ? <form className="procurement__confirm" onSubmit={(event) => { event.preventDefault(); void action(confirmAction); }}><strong>{copy(locale, confirmAction === "cancel" ? "Cancel this count session?" : "Reopen this count session?", confirmAction === "cancel" ? "Hủy phiên kiểm kê này?" : "Mở lại phiên kiểm kê này?")}</strong><p>{copy(locale, "Add an audit reason. Reopening captures fresh baselines for all listed products; recount every item before submitting.", "Nhập lý do lưu lịch sử. Mở lại sẽ lấy mốc mới cho tất cả sản phẩm; hãy đếm lại từng dòng trước khi gửi duyệt.")}</p><label>{copy(locale, "Reason (at least 8 characters)", "Lý do (ít nhất 8 ký tự)")}<textarea required minLength={8} maxLength={500} value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></label><button className="admin__button admin__button--primary" type="submit" disabled={busy || actionReason.trim().length < 8}>{copy(locale, "Confirm", "Xác nhận")}</button><button className="admin__button admin__button--ghost" type="button" onClick={() => setConfirmAction(null)}>{tx("Cancel")}</button></form> : null}
                    </section>}
                </div>
            </div>
        </main>
    </AdminLayout>;
};

export default AdminStockCountsPage;
