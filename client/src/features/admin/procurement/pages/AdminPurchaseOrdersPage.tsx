import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../../components/layout/AdminLayout";
import AdminStatusPanel from "../../components/AdminStatusPanel";
import AdminTableScrollHint from "../../components/AdminTableScrollHint";
import { useLocale } from "../../../../context/LocaleContext";
import { useToast } from "../../../../context/ToastContext";
import { fetchAdminProductsPage } from "../../api";
import { useAdminCopy } from "../../../../hooks/useAdminCopy";
import { getAdminRequestError } from "../../utils/adminRequestError";
import {
    createPurchaseOrder,
    fetchPurchaseOrder,
    fetchPurchaseOrders,
    fetchPurchaseReceipts,
    fetchSuppliers,
    postPurchaseReceipt,
    transitionPurchaseOrder,
    updatePurchaseOrder,
} from "../api";
import { procurementCopy as copy } from "../copy";
import type { ProductChoice, PurchaseOrder, PurchaseOrderInput, PurchaseReceipt, ReceiptLineInput, Supplier } from "../types";
import { formatDate, formatVnd, safeInteger, statusClassName, reuseOrCreateIdempotencyKey, type IdempotencyState } from "../utils";
import "../procurement.scss";

type DraftLine = { key: string; productId: string; orderedQuantity: string; unitCostVnd: string; note: string };
type ReceiptDraftLine = { purchaseOrderItemId: number; expectedQuantity: string; acceptedQuantity: string; rejectedQuantity: string; missingQuantity: string; unitCostVnd: string; actualCostReason: string; note: string };
const newDraftLine = (): DraftLine => ({ key: crypto.randomUUID(), productId: "", orderedQuantity: "1", unitCostVnd: "0", note: "" });
const emptyOrderForm = { supplierId: "", note: "", lines: [newDraftLine()] };
const pageLimit = 25;

const AdminPurchaseOrdersPage = () => {
    const { locale } = useLocale();
    const { addToast } = useToast();
    const tx = useAdminCopy();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<ProductChoice[]>([]);
    const [productSearch, setProductSearch] = useState("");
    const [orderSearch, setOrderSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState(emptyOrderForm);
    const [editing, setEditing] = useState<PurchaseOrder | null>(null);
    const [selected, setSelected] = useState<PurchaseOrder | null>(null);
    const [transition, setTransition] = useState<{ order: PurchaseOrder; action: "cancel" | "close" } | null>(null);
    const [transitionReason, setTransitionReason] = useState("");
    const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);
    const [receiptNote, setReceiptNote] = useState("");
    const [receiptHistory, setReceiptHistory] = useState<PurchaseReceipt[]>([]);
    const receiptKeyRef = useRef<IdempotencyState>(null);

    const loadOrders = useCallback(async (nextPage = page) => {
        setLoading(true);
        setError("");
        try {
            const [orderPage, supplierPage] = await Promise.all([
                fetchPurchaseOrders({ page: nextPage, limit: pageLimit, search: orderSearch.trim() || undefined, status: statusFilter || undefined }),
                fetchSuppliers({ page: 1, limit: 100, status: "active" }),
            ]);
            setOrders(orderPage.items);
            setSuppliers(supplierPage.items);
            setPage(orderPage.pagination.page);
            setTotalPages(orderPage.pagination.totalPages);
            setLoaded(true);
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
        finally { setLoading(false); }
    }, [orderSearch, page, statusFilter]);

    const loadProducts = useCallback(async (search: string) => {
        try {
            const result = await fetchAdminProductsPage({ page: 1, limit: 100, search: search.trim() || undefined, stock: "all" });
            setProducts(result.items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, stock: Number(item.stock) || 0 })));
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
    }, []);

    useEffect(() => { void loadOrders(page); }, [loadOrders, page]);
    useEffect(() => {
        const timer = window.setTimeout(() => { void loadProducts(productSearch); }, 250);
        return () => window.clearTimeout(timer);
    }, [loadProducts, productSearch]);

    const orderPayload = useMemo<PurchaseOrderInput | null>(() => {
        const supplierId = safeInteger(form.supplierId);
        const lines = form.lines.map((line) => ({
            productId: safeInteger(line.productId),
            orderedQuantity: safeInteger(line.orderedQuantity),
            unitCostVnd: safeInteger(line.unitCostVnd),
            note: line.note.trim() || undefined,
        }));
        if (!Number.isSafeInteger(supplierId) || supplierId <= 0 || !lines.length || new Set(lines.map((line) => line.productId)).size !== lines.length || lines.some((line) => !Number.isSafeInteger(line.productId) || line.productId <= 0 || !Number.isSafeInteger(line.orderedQuantity) || line.orderedQuantity <= 0 || !Number.isSafeInteger(line.unitCostVnd) || line.unitCostVnd < 0)) return null;
        return { supplierId, note: form.note.trim() || undefined, lines };
    }, [form]);

    const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!orderPayload) return;
        setBusy(true);
        try {
            if (editing) await updatePurchaseOrder(editing.id, { ...orderPayload, version: editing.version });
            else await createPurchaseOrder(orderPayload);
            addToast(tx("Purchase order saved"), tx("The draft is ready for review."));
            setForm({ ...emptyOrderForm, lines: [newDraftLine()] });
            setEditing(null);
            await loadOrders(1);
        } catch (requestError) { setError(getAdminRequestError(requestError).message || copy(locale, "Unable to save this purchase order.", "Không thể lưu đơn mua hàng.")); }
        finally { setBusy(false); }
    };

    const inspectOrder = async (order: PurchaseOrder) => {
        setSelected(order);
        try {
            const [detail, receiptPage] = await Promise.all([fetchPurchaseOrder(order.id), fetchPurchaseReceipts(order.id, { page: 1, limit: 25 })]);
            setSelected(detail);
            setReceiptHistory(receiptPage.items);
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
    };

    const beginEdit = (order: PurchaseOrder) => {
        setEditing(order);
        setSelected(null);
        setForm({ supplierId: String(order.supplierId), note: order.note ?? "", lines: order.lines.map((line) => ({ key: crypto.randomUUID(), productId: String(line.productId), orderedQuantity: String(line.orderedQuantity), unitCostVnd: String(line.unitCostVnd), note: line.note ?? "" })) });
    };

    const runTransition = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!transition) return;
        setBusy(true);
        try {
            const updated = await transitionPurchaseOrder(transition.order.id, transition.action, { version: transition.order.version, reason: transitionReason.trim() });
            addToast(tx("Purchase order updated"), tx("The order status was saved."));
            setTransition(null);
            setTransitionReason("");
            setSelected(updated);
            await loadOrders(page);
        } catch (requestError) { setError(getAdminRequestError(requestError).message || copy(locale, "Unable to update the order status.", "Không thể cập nhật trạng thái đơn mua.")); }
        finally { setBusy(false); }
    };

    const beginReceipt = async (order: PurchaseOrder) => {
        try {
            const detail = await fetchPurchaseOrder(order.id);
            const pending = detail.lines.filter((line) => line.orderedQuantity > line.acceptedQuantity);
            setSelected(detail);
            setReceiptLines(pending.map((line) => ({ purchaseOrderItemId: line.id, expectedQuantity: String(line.orderedQuantity - line.acceptedQuantity), acceptedQuantity: String(line.orderedQuantity - line.acceptedQuantity), rejectedQuantity: "0", missingQuantity: "0", unitCostVnd: String(line.unitCostVnd), actualCostReason: "", note: "" })));
            setReceiptNote("");
            receiptKeyRef.current = null;
            setReceiptHistory((await fetchPurchaseReceipts(order.id, { page: 1, limit: 25 })).items);
        } catch (requestError) { setError(getAdminRequestError(requestError).message); }
    };

    const updateReceiptLine = (itemId: number, key: keyof ReceiptDraftLine, value: string) => {
        setReceiptLines((current) => current.map((line) => line.purchaseOrderItemId === itemId ? { ...line, [key]: value } : line));
    };

    const postReceipt = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selected) return;
        const lines: ReceiptLineInput[] = receiptLines.filter((line) => [line.acceptedQuantity, line.rejectedQuantity, line.missingQuantity].some((value) => safeInteger(value) > 0)).map((line) => ({
            purchaseOrderItemId: line.purchaseOrderItemId,
            expectedQuantity: safeInteger(line.expectedQuantity),
            acceptedQuantity: safeInteger(line.acceptedQuantity),
            rejectedQuantity: safeInteger(line.rejectedQuantity),
            missingQuantity: safeInteger(line.missingQuantity),
            unitCostVnd: safeInteger(line.unitCostVnd),
            actualCostReason: line.actualCostReason.trim() || undefined,
            note: line.note.trim() || undefined,
        }));
        if (!lines.length || lines.some((line) => {
            const poLine = selected.lines.find((item) => item.id === line.purchaseOrderItemId);
            return Object.values(line).some((value) => typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
                || line.expectedQuantity !== line.acceptedQuantity + line.rejectedQuantity + line.missingQuantity
                || !poLine || line.expectedQuantity > poLine.orderedQuantity - poLine.acceptedQuantity
                || ((line.rejectedQuantity > 0 || line.missingQuantity > 0) && !(line.note?.trim()));
        })) {
            setError(copy(locale, "Check each receipt line: quantities must be whole numbers, dispositions must match the expected amount within the remaining order, and rejected or missing units need a note.", "Kiểm tra từng dòng: số lượng phải là số nguyên, kết quả phải bằng số dự kiến và không vượt phần còn lại; hàng lỗi hoặc thiếu cần ghi chú."));
            return;
        }
        const costMismatch = lines.some((line) => {
            const poLine = selected.lines.find((item) => item.id === line.purchaseOrderItemId);
            return poLine && line.unitCostVnd !== poLine.unitCostVnd && (line.actualCostReason?.trim().length ?? 0) < 8;
        });
        if (costMismatch) {
            setError(copy(locale, "Add a reason of at least 8 characters when the received unit cost differs from the planned cost.", "Hãy nhập lý do ít nhất 8 ký tự khi giá nhập thực tế khác giá dự kiến."));
            return;
        }
        const payload = { note: receiptNote.trim() || undefined, lines };
        const fingerprint = JSON.stringify(payload);
        const keyState = reuseOrCreateIdempotencyKey(fingerprint, receiptKeyRef.current, () => crypto.randomUUID());
        receiptKeyRef.current = keyState;
        setBusy(true);
        try {
            await postPurchaseReceipt(selected.id, { ...payload, idempotencyKey: keyState!.key });
            addToast(tx("Receipt posted"), tx("Accepted units were added to sellable stock."));
            receiptKeyRef.current = null;
            await inspectOrder(selected);
            await loadOrders(page);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message || copy(locale, "Receipt posting failed. Retry without changing the form to safely reuse the same request key.", "Không thể ghi nhận phiếu nhập. Nếu thử lại, giữ nguyên biểu mẫu để sử dụng lại mã yêu cầu."));
        } finally { setBusy(false); }
    };

    return <AdminLayout>
        <Helmet><title>{copy(locale, "Purchase orders", "Đơn mua hàng")} | Digital-E</title></Helmet>
        <main className="admin__page admin__page--procurement">
            <header className="admin__page__header"><div><span className="admin__page__eyebrow">{copy(locale, "Inventory operations", "Vận hành kho")}</span><h1 className="admin__page__title">{copy(locale, "Purchase orders", "Đơn mua hàng")}</h1><p className="admin__page__subtitle">{copy(locale, "Track supplier commitments, deliveries, and actual acquisition cost.", "Theo dõi cam kết với nhà cung cấp, các lần giao hàng và giá nhập thực tế.")}</p></div><nav className="procurement__tabs" aria-label={copy(locale, "Inventory operations", "Vận hành kho")}><a href="/admin/suppliers">{copy(locale, "Suppliers", "Nhà cung cấp")}</a><a href="/admin/purchase-orders" aria-current="page">{copy(locale, "Purchase orders", "Đơn mua hàng")}</a><a href="/admin/stock-counts">{copy(locale, "Stock counts", "Kiểm kê kho")}</a></nav></header>
            <div className="procurement__split">
                <section className="admin__card procurement__panel">
                    <div className="admin__card__header admin__card__header--stacked"><div><h2>{copy(locale, "Purchase order queue", "Danh sách đơn mua")}</h2><span>{copy(locale, "Orders are drafts until confirmed.", "Đơn hàng ở trạng thái nháp cho đến khi xác nhận.")}</span></div><div className="procurement__toolbar"><label className="procurement__sr-only" htmlFor="purchase-order-search">{copy(locale, "Search purchase orders", "Tìm đơn mua hàng")}</label><input id="purchase-order-search" type="search" value={orderSearch} placeholder={copy(locale, "Search ID, supplier, or SKU…", "Tìm mã đơn, nhà cung cấp hoặc SKU…")} onChange={(event) => { setPage(1); setOrderSearch(event.target.value); }} /><label className="procurement__sr-only" htmlFor="purchase-order-status">{copy(locale, "Filter by order status", "Lọc trạng thái đơn")}</label><select id="purchase-order-status" value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">{copy(locale, "All statuses", "Tất cả trạng thái")}</option>{["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELED"].map((status) => <option key={status} value={status}>{copy(locale, status.replaceAll("_", " "), ({ DRAFT: "Nháp", ORDERED: "Đã đặt", PARTIALLY_RECEIVED: "Nhận một phần", RECEIVED: "Đã nhận đủ", CLOSED: "Đã đóng", CANCELED: "Đã hủy" } as Record<string, string>)[status])}</option>)}</select></div></div>
                    {error ? <AdminStatusPanel variant="error" title={copy(locale, "Purchase operation needs attention", "Cần kiểm tra thao tác nhập hàng")} description={error} onRetry={() => void loadOrders(1)} retryLabel={tx("Retry")} /> : null}
                    {loading && !loaded ? <AdminStatusPanel variant="loading" title={copy(locale, "Loading purchase orders", "Đang tải đơn mua hàng")} description={copy(locale, "Fetching order and supplier records.", "Đang tải đơn mua và nhà cung cấp.")} /> : null}
                    {!loading && loaded && orders.length === 0 ? <AdminStatusPanel variant="empty" title={copy(locale, "No purchase orders found", "Chưa có đơn mua hàng")} description={copy(locale, "Create a draft purchase order to begin.", "Tạo đơn mua nháp để bắt đầu.")} /> : null}
                    {orders.length ? <AdminTableScrollHint label={copy(locale, "Purchase order list", "Danh sách đơn mua hàng")}><table className="admin__table procurement__table"><thead><tr><th>{copy(locale, "Order", "Đơn mua")}</th><th>{copy(locale, "Supplier", "Nhà cung cấp")}</th><th>{copy(locale, "Lines", "Mặt hàng")}</th><th>{copy(locale, "Status", "Trạng thái")}</th><th>{copy(locale, "Actions", "Thao tác")}</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>PO-{order.id}</strong><small>{formatDate(order.createdAt, locale)}</small></td><td>{order.supplierName}<small>{order.supplierCode}</small></td><td>{order.lines.length} {copy(locale, "items", "mặt hàng")}<small>{order.lines.reduce((sum, line) => sum + line.orderedQuantity - line.acceptedQuantity, 0)} {copy(locale, "units outstanding", "đơn vị còn lại")}</small></td><td><span className={`procurement__status is-${statusClassName(order.status)}`}>{copy(locale, order.status.replaceAll("_", " "), ({ DRAFT: "Nháp", ORDERED: "Đã đặt", PARTIALLY_RECEIVED: "Nhận một phần", RECEIVED: "Đã nhận đủ", CLOSED: "Đã đóng", CANCELED: "Đã hủy" } as Record<string, string>)[order.status])}</span></td><td><div className="procurement__actions-cell"><button className="admin__button admin__button--ghost admin__button--compact" type="button" onClick={() => void inspectOrder(order)}>{copy(locale, "View", "Xem")}</button>{order.status === "DRAFT" ? <><button className="admin__button admin__button--ghost admin__button--compact" type="button" onClick={() => beginEdit(order)}>{tx("Edit")}</button><button className="admin__button admin__button--primary admin__button--compact" type="button" onClick={async () => { setBusy(true); try { await transitionPurchaseOrder(order.id, "confirm", { version: order.version }); addToast(tx("Order confirmed"), tx("The order lines are now immutable.")); await loadOrders(page); } catch (requestError) { setError(getAdminRequestError(requestError).message); } finally { setBusy(false); } }} disabled={busy}>{copy(locale, "Confirm", "Xác nhận")}</button><button className="admin__button admin__button--danger admin__button--compact" type="button" onClick={() => { setTransition({ order, action: "cancel" }); setTransitionReason(""); }}>{tx("Cancel")}</button></> : null}{["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) ? <><button className="admin__button admin__button--primary admin__button--compact" type="button" onClick={() => void beginReceipt(order)}>{copy(locale, "Receive", "Nhận hàng")}</button><button className="admin__button admin__button--danger admin__button--compact" type="button" onClick={() => { setTransition({ order, action: "close" }); setTransitionReason(""); }}>{copy(locale, "Close short", "Đóng thiếu")}</button></> : null}</div></td></tr>)}</tbody></table></AdminTableScrollHint> : null}
                    {totalPages > 1 ? <div className="procurement__pagination"><button className="admin__button admin__button--ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{copy(locale, "Previous", "Trước")}</button><span>{page} / {totalPages}</span><button className="admin__button admin__button--ghost" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{copy(locale, "Next", "Sau")}</button></div> : null}
                    {transition ? <form className="procurement__confirm" onSubmit={(event) => void runTransition(event)}><strong>{copy(locale, transition.action === "cancel" ? `Cancel draft PO-${transition.order.id}?` : `Close PO-${transition.order.id} with outstanding units?`, transition.action === "cancel" ? `Hủy đơn nháp PO-${transition.order.id}?` : `Đóng PO-${transition.order.id} khi còn hàng chưa nhận?`)}</strong><p>{transition.action === "close" ? copy(locale, "This closes the remaining quantities without adding stock. Posted receipts remain in the history.", "Đơn sẽ đóng với số lượng còn thiếu; các phiếu nhập đã ghi vẫn được giữ lại.") : copy(locale, "Only draft purchase orders can be canceled.", "Chỉ đơn nháp mới được hủy.")}</p><label>{copy(locale, "Reason (at least 8 characters)", "Lý do (ít nhất 8 ký tự)")}<textarea required minLength={8} maxLength={500} value={transitionReason} onChange={(event) => setTransitionReason(event.target.value)} /></label><button className="admin__button admin__button--danger" type="submit" disabled={busy || transitionReason.trim().length < 8}>{copy(locale, "Confirm action", "Xác nhận")}</button><button className="admin__button admin__button--ghost" type="button" onClick={() => setTransition(null)}>{tx("Cancel")}</button></form> : null}
                </section>

                <div className="procurement__section-stack">
                    <section className="admin__card procurement__panel">
                        <div className="admin__card__header"><div><h2>{editing ? copy(locale, `Edit draft PO-${editing.id}`, `Sửa đơn nháp PO-${editing.id}`) : copy(locale, "New purchase order", "Đơn mua hàng mới")}</h2><p>{copy(locale, "Confirming snapshots the supplier, SKU, item names, quantities, and planned VND costs.", "Xác nhận sẽ chụp lại nhà cung cấp, SKU, tên hàng, số lượng và chi phí dự kiến.")}</p></div></div>
                        <form className="procurement__form" onSubmit={(event) => void saveOrder(event)}>
                            <label>{copy(locale, "Supplier", "Nhà cung cấp")}<select required value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}><option value="">{copy(locale, "Select an active supplier", "Chọn nhà cung cấp đang hoạt động")}</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></label>
                            <label className="procurement__form__wide">{copy(locale, "Order note", "Ghi chú đơn mua")}<input maxLength={2000} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
                            <div className="procurement__form__wide"><label>{copy(locale, "Find products", "Tìm sản phẩm")}<input type="search" value={productSearch} placeholder={copy(locale, "Search SKU or product name…", "Tìm SKU hoặc tên sản phẩm…")} onChange={(event) => setProductSearch(event.target.value)} /></label></div>
                            <div className="procurement__form__wide procurement__line-editor">
                                {form.lines.map((line, index) => <div className="procurement__line-row" key={line.key}>
                                    <label>{copy(locale, "Product", "Sản phẩm")}<select required value={line.productId} onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((item) => item.key === line.key ? { ...item, productId: event.target.value } : item) }))}><option value="">{copy(locale, "Select product", "Chọn sản phẩm")}</option>{products.map((product) => <option value={product.id} key={product.id}>{product.sku} · {product.name} ({product.stock})</option>)}</select></label>
                                    <label>{copy(locale, "Quantity", "Số lượng")}<input type="number" min="1" step="1" required value={line.orderedQuantity} onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((item) => item.key === line.key ? { ...item, orderedQuantity: event.target.value } : item) }))} /></label>
                                    <label>{copy(locale, "Planned unit cost (VND)", "Giá dự kiến / đơn vị (VND)")}<input inputMode="numeric" type="number" min="0" step="1" required value={line.unitCostVnd} onChange={(event) => setForm((current) => ({ ...current, lines: current.lines.map((item) => item.key === line.key ? { ...item, unitCostVnd: event.target.value } : item) }))} /></label>
                                    <button className="admin__button admin__button--ghost admin__button--compact" type="button" aria-label={copy(locale, `Remove line ${index + 1}`, `Xóa dòng ${index + 1}`)} disabled={form.lines.length <= 1} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))}>×</button>
                                </div>)}
                                <button className="admin__button admin__button--ghost" type="button" disabled={form.lines.length >= 100} onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, newDraftLine()] }))}>{copy(locale, "Add item", "Thêm mặt hàng")}</button>
                            </div>
                            <div className="procurement__form__actions"><button className="admin__button admin__button--primary" type="submit" disabled={busy || !orderPayload}>{busy ? copy(locale, "Saving…", "Đang lưu…") : editing ? copy(locale, "Save draft", "Lưu đơn nháp") : copy(locale, "Create draft", "Tạo đơn nháp")}</button>{editing ? <button className="admin__button admin__button--ghost" type="button" onClick={() => { setEditing(null); setForm({ ...emptyOrderForm, lines: [newDraftLine()] }); }}>{copy(locale, "Cancel edit", "Hủy chỉnh sửa")}</button> : null}</div>
                        </form>
                    </section>
                    {selected ? <section className="admin__card procurement__panel">
                        <div className="admin__card__header admin__card__header--stacked"><div><h2>{copy(locale, `PO-${selected.id} details`, `Chi tiết PO-${selected.id}`)}</h2><span>{selected.supplierName} · {copy(locale, selected.status.replaceAll("_", " "), ({ DRAFT: "Nháp", ORDERED: "Đã đặt", PARTIALLY_RECEIVED: "Nhận một phần", RECEIVED: "Đã nhận đủ", CLOSED: "Đã đóng", CANCELED: "Đã hủy" } as Record<string, string>)[selected.status])}</span></div><button className="admin__button admin__button--ghost" type="button" onClick={() => setSelected(null)}>{tx("Close")}</button></div>
                        <AdminTableScrollHint label={copy(locale, "Purchase order lines", "Các mặt hàng trong đơn mua")}><table className="admin__table procurement__table"><thead><tr><th>{copy(locale, "Item", "Mặt hàng")}</th><th>{copy(locale, "Ordered", "Đã đặt")}</th><th>{copy(locale, "Accepted", "Đã nhận")}</th><th>{copy(locale, "Planned cost", "Giá dự kiến")}</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id}><td><strong>{line.productName}</strong><small>{line.sku}</small></td><td>{line.orderedQuantity}</td><td>{line.acceptedQuantity}</td><td>{formatVnd(line.unitCostVnd, locale)}</td></tr>)}</tbody></table></AdminTableScrollHint>
                        {receiptHistory.length ? <div className="procurement__notice"><strong>{copy(locale, "Posted receipts", "Phiếu nhập đã ghi")}</strong>{receiptHistory.map((receipt) => <p key={receipt.id}>#{receipt.id} · {formatDate(receipt.createdAt, locale)} · {formatVnd(receipt.totalAcceptedCostVnd, locale)}</p>)}</div> : null}
                    </section> : null}
                    {selected && receiptLines.length ? <section className="admin__card procurement__panel">
                        <div className="admin__card__header"><div><h2>{copy(locale, "Review receipt", "Kiểm tra phiếu nhập")}</h2><p>{copy(locale, "Only accepted units enter sellable stock. Rejected and missing units remain outstanding.", "Chỉ hàng đạt yêu cầu mới được cộng vào tồn bán. Hàng lỗi hoặc thiếu vẫn còn trong phần chưa nhận.")}</p></div></div>
                        <form className="procurement__line-editor" onSubmit={(event) => void postReceipt(event)}>
                            {receiptLines.map((line) => {
                                const poLine = selected.lines.find((item) => item.id === line.purchaseOrderItemId);
                                if (!poLine) return null;
                                const fields: Array<[keyof ReceiptDraftLine, string, string]> = [["expectedQuantity", "Expected", "Dự kiến"], ["acceptedQuantity", "Accepted", "Đạt"], ["rejectedQuantity", "Rejected", "Lỗi"], ["missingQuantity", "Missing", "Thiếu"], ["unitCostVnd", "Actual cost (VND)", "Giá nhập thực tế (VND)"]];
                                return <fieldset className="procurement__receipt-line" key={line.purchaseOrderItemId}><legend>{poLine.productName} · {poLine.sku} · {copy(locale, `${poLine.orderedQuantity - poLine.acceptedQuantity} remaining`, `còn ${poLine.orderedQuantity - poLine.acceptedQuantity}`)}</legend><div className="procurement__line-row procurement__line-row--receipt"><div className="procurement__line-product"><strong>{copy(locale, "Planned cost", "Giá dự kiến")}</strong><small>{formatVnd(poLine.unitCostVnd, locale)}</small></div>{fields.map(([key, en, vi]) => <label key={key}>{copy(locale, en, vi)}<input type="number" min="0" step="1" required value={line[key] as string} onChange={(event) => updateReceiptLine(line.purchaseOrderItemId, key, event.target.value)} /></label>)}<label className="procurement__receipt-reason">{copy(locale, "Reason if cost differs", "Lý do nếu giá khác")}<input maxLength={500} value={line.actualCostReason} onChange={(event) => updateReceiptLine(line.purchaseOrderItemId, "actualCostReason", event.target.value)} /></label><label>{copy(locale, "Line note", "Ghi chú dòng")}<input maxLength={500} value={line.note} onChange={(event) => updateReceiptLine(line.purchaseOrderItemId, "note", event.target.value)} /></label></div></fieldset>;
                            })}
                            <label className="procurement__form__wide">{copy(locale, "Receipt note", "Ghi chú phiếu nhập")}<textarea rows={2} maxLength={2000} value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} /></label>
                            <div className="procurement__form__actions"><button className="admin__button admin__button--primary" type="submit" disabled={busy}>{busy ? copy(locale, "Posting…", "Đang ghi nhận…") : copy(locale, "Post receipt", "Ghi nhận nhập hàng")}</button><span className="procurement__field-hint">{copy(locale, "If the request times out, retry without changing these values. The same idempotency key will be reused.", "Nếu quá thời gian chờ, hãy thử lại mà không đổi dữ liệu; mã yêu cầu cũ sẽ được dùng lại.")}</span></div>
                        </form>
                    </section> : null}
                </div>
            </div>
        </main>
    </AdminLayout>;
};

export default AdminPurchaseOrdersPage;
