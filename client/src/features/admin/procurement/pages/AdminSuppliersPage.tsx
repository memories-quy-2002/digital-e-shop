import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../../components/layout/AdminLayout";
import AdminStatusPanel from "../../components/AdminStatusPanel";
import AdminTableScrollHint from "../../components/AdminTableScrollHint";
import { useLocale } from "../../../../context/LocaleContext";
import { useToast } from "../../../../context/ToastContext";
import { useAdminCopy } from "../../../../hooks/useAdminCopy";
import { getAdminRequestError } from "../../utils/adminRequestError";
import { archiveSupplier, createSupplier, fetchSuppliers, updateSupplier } from "../api";
import { procurementCopy as copy } from "../copy";
import type { Supplier, SupplierInput } from "../types";
import "../procurement.scss";

const emptySupplier: SupplierInput = { code: "", name: "", contactName: "", email: "", phone: "", address: "", notes: "" };

const AdminSuppliersPage = () => {
    const { locale } = useLocale();
    const { addToast } = useToast();
    const tx = useAdminCopy();
    const [items, setItems] = useState<Supplier[]>([]);
    const [form, setForm] = useState<SupplierInput>(emptySupplier);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);
    const [archiveReason, setArchiveReason] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"active" | "archived" | "all">("active");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async (nextPage = page) => {
        setLoading(true);
        setError("");
        try {
            const result = await fetchSuppliers({ page: nextPage, limit: 25, search: search.trim() || undefined, status });
            setItems(result.items);
            setPage(result.pagination.page);
            setTotalPages(result.pagination.totalPages);
            setLoaded(true);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [page, search, status]);

    useEffect(() => { void load(page); }, [load, page]);

    const startEdit = (supplier: Supplier) => {
        setEditing(supplier);
        setArchiveTarget(null);
        setForm({ code: supplier.code, name: supplier.name, contactName: supplier.contactName ?? "", email: supplier.email ?? "", phone: supplier.phone ?? "", address: supplier.address ?? "", notes: supplier.notes ?? "" });
    };

    const resetForm = () => { setEditing(null); setForm(emptySupplier); };
    const updateField = (key: keyof SupplierInput, value: string) => setForm((current) => ({ ...current, [key]: value }));

    const saveSupplier = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        try {
            const normalized: SupplierInput = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, String(value ?? "").trim()])) as SupplierInput;
            if (editing) await updateSupplier(editing.id, { ...normalized, version: editing.version });
            else await createSupplier(normalized);
            addToast(tx("Supplier saved"), tx("Supplier details are up to date."));
            resetForm();
            await load(1);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message || copy(locale, "Unable to save this supplier.", "Không thể lưu nhà cung cấp này."));
        } finally { setBusy(false); }
    };

    const confirmArchive = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!archiveTarget || archiveReason.trim().length < 8) return;
        setBusy(true);
        try {
            await archiveSupplier(archiveTarget.id, { version: archiveTarget.version, reason: archiveReason.trim() });
            addToast(tx("Supplier archived"), tx("Existing purchase orders remain linked to this supplier."));
            setArchiveTarget(null);
            setArchiveReason("");
            await load(1);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message || copy(locale, "Unable to archive this supplier.", "Không thể lưu trữ nhà cung cấp này."));
        } finally { setBusy(false); }
    };

    return <AdminLayout>
        <Helmet><title>{copy(locale, "Suppliers", "Nhà cung cấp")} | Digital-E</title></Helmet>
        <main className="admin__page admin__page--procurement">
            <header className="admin__page__header">
                <div><span className="admin__page__eyebrow">{copy(locale, "Inventory operations", "Vận hành kho")}</span><h1 className="admin__page__title">{copy(locale, "Suppliers", "Nhà cung cấp")}</h1><p className="admin__page__subtitle">{copy(locale, "Keep supplier contacts ready for purchasing and receiving.", "Quản lý liên hệ nhà cung cấp cho việc đặt và nhận hàng.")}</p></div>
                <nav className="procurement__tabs" aria-label={copy(locale, "Inventory operations", "Vận hành kho")}>
                    <a href="/admin/suppliers" aria-current="page">{copy(locale, "Suppliers", "Nhà cung cấp")}</a><a href="/admin/purchase-orders">{copy(locale, "Purchase orders", "Đơn mua hàng")}</a><a href="/admin/stock-counts">{copy(locale, "Stock counts", "Kiểm kê kho")}</a>
                </nav>
            </header>

            <div className="procurement__grid procurement__grid--suppliers">
                <section className="admin__card procurement__panel">
                    <div className="admin__card__header"><div><h2>{editing ? copy(locale, "Edit supplier", "Sửa nhà cung cấp") : copy(locale, "Add supplier", "Thêm nhà cung cấp")}</h2><p>{copy(locale, "Archived suppliers stay visible on existing purchase history.", "Nhà cung cấp đã lưu trữ vẫn xuất hiện trong lịch sử đơn mua.")}</p></div></div>
                    <form className="procurement__form" onSubmit={(event) => void saveSupplier(event)}>
                        <label>{copy(locale, "Supplier code", "Mã nhà cung cấp")}<input required maxLength={64} value={form.code} onChange={(event) => updateField("code", event.target.value)} autoComplete="off" /></label>
                        <label>{copy(locale, "Supplier name", "Tên nhà cung cấp")}<input required maxLength={160} value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
                        <label>{copy(locale, "Contact name", "Người liên hệ")}<input maxLength={120} value={form.contactName ?? ""} onChange={(event) => updateField("contactName", event.target.value)} /></label>
                        <label>{copy(locale, "Email", "Email")}<input type="email" maxLength={254} value={form.email ?? ""} onChange={(event) => updateField("email", event.target.value)} /></label>
                        <label>{copy(locale, "Phone", "Số điện thoại")}<input type="tel" maxLength={40} value={form.phone ?? ""} onChange={(event) => updateField("phone", event.target.value)} /></label>
                        <label>{copy(locale, "Address", "Địa chỉ")}<input maxLength={500} value={form.address ?? ""} onChange={(event) => updateField("address", event.target.value)} /></label>
                        <label className="procurement__form__wide">{copy(locale, "Notes", "Ghi chú")}<textarea rows={3} maxLength={2000} value={form.notes ?? ""} onChange={(event) => updateField("notes", event.target.value)} /></label>
                        <div className="procurement__form__actions"><button className="admin__button admin__button--primary" type="submit" disabled={busy}>{busy ? copy(locale, "Saving…", "Đang lưu…") : editing ? copy(locale, "Save changes", "Lưu thay đổi") : copy(locale, "Add supplier", "Thêm nhà cung cấp")}</button>{editing ? <button className="admin__button admin__button--ghost" type="button" onClick={resetForm}>{copy(locale, "Cancel edit", "Hủy chỉnh sửa")}</button> : null}</div>
                    </form>
                </section>

                <section className="admin__card procurement__panel">
                    <div className="admin__card__header admin__card__header--stacked"><div><h2>{copy(locale, "Supplier directory", "Danh sách nhà cung cấp")}</h2><span>{items.length} {copy(locale, "on this page", "trong trang này")}</span></div><div className="procurement__toolbar"><label className="admin__sr-only" htmlFor="supplier-search">{copy(locale, "Search suppliers", "Tìm nhà cung cấp")}</label><input id="supplier-search" type="search" value={search} placeholder={copy(locale, "Search code, name, contact…", "Tìm mã, tên, liên hệ…")} onChange={(event) => { setPage(1); setSearch(event.target.value); }} /><label className="admin__sr-only" htmlFor="supplier-status">{copy(locale, "Supplier status", "Trạng thái nhà cung cấp")}</label><select id="supplier-status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }}><option value="active">{copy(locale, "Active", "Đang hoạt động")}</option><option value="archived">{copy(locale, "Archived", "Đã lưu trữ")}</option><option value="all">{copy(locale, "All suppliers", "Tất cả")}</option></select><button type="button" className="admin__button admin__button--ghost" onClick={() => void load(1)}>{tx("Refresh")}</button></div></div>
                    {error ? <AdminStatusPanel variant="error" title={copy(locale, "Supplier action needs attention", "Cần kiểm tra thao tác nhà cung cấp")} description={error} onRetry={() => void load(1)} retryLabel={tx("Retry")} /> : null}
                    {loading && !loaded ? <AdminStatusPanel variant="loading" title={copy(locale, "Loading suppliers", "Đang tải nhà cung cấp")} description={copy(locale, "Fetching supplier records.", "Đang tải dữ liệu nhà cung cấp.")} /> : null}
                    {!loading && loaded && !items.length ? <AdminStatusPanel variant="empty" title={copy(locale, "No suppliers found", "Chưa có nhà cung cấp")} description={copy(locale, "Add a supplier or adjust your search filters.", "Hãy thêm nhà cung cấp hoặc đổi bộ lọc.")} /> : null}
                    {items.length ? <AdminTableScrollHint label={copy(locale, "Supplier list", "Danh sách nhà cung cấp")}><table className="admin__table procurement__table"><thead><tr><th>{copy(locale, "Supplier", "Nhà cung cấp")}</th><th>{copy(locale, "Contact", "Liên hệ")}</th><th>{copy(locale, "Status", "Trạng thái")}</th><th>{copy(locale, "Actions", "Thao tác")}</th></tr></thead><tbody>{items.map((supplier) => <tr key={supplier.id}>
                        <td><strong>{supplier.name}</strong><small>{supplier.code}</small></td><td>{supplier.contactName || "—"}<small>{supplier.email || supplier.phone || "—"}</small></td><td><span className={`procurement__status ${supplier.active ? "is-active" : "is-inactive"}`}>{supplier.active ? copy(locale, "Active", "Đang hoạt động") : copy(locale, "Archived", "Đã lưu trữ")}</span></td><td className="procurement__actions"><button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => startEdit(supplier)}>{tx("Edit")}</button>{supplier.active ? <button type="button" className="admin__button admin__button--danger admin__button--compact" onClick={() => { setArchiveTarget(supplier); setEditing(null); }}>{copy(locale, "Archive", "Lưu trữ")}</button> : null}</td>
                    </tr>)}</tbody></table></AdminTableScrollHint> : null}
                    {totalPages > 1 ? <div className="procurement__pagination"><button type="button" className="admin__button admin__button--ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{copy(locale, "Previous", "Trước")}</button><span>{page} / {totalPages}</span><button type="button" className="admin__button admin__button--ghost" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{copy(locale, "Next", "Sau")}</button></div> : null}
                    {archiveTarget ? <form className="procurement__confirm" onSubmit={(event) => void confirmArchive(event)}><strong>{copy(locale, `Archive ${archiveTarget.name}?`, `Lưu trữ ${archiveTarget.name}?`)}</strong><p>{copy(locale, "This prevents new purchase orders from using the supplier. Existing confirmed orders can still be received.", "Không thể chọn nhà cung cấp cho đơn mới; đơn đã xác nhận vẫn có thể nhận hàng.")}</p><label>{copy(locale, "Reason (at least 8 characters)", "Lý do (ít nhất 8 ký tự)")}<textarea required minLength={8} maxLength={500} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} /></label><button className="admin__button admin__button--danger" type="submit" disabled={busy || archiveReason.trim().length < 8}>{copy(locale, "Confirm archive", "Xác nhận lưu trữ")}</button><button className="admin__button admin__button--ghost" type="button" onClick={() => setArchiveTarget(null)}>{tx("Cancel")}</button></form> : null}
                </section>
            </div>
        </main>
    </AdminLayout>;
};

export default AdminSuppliersPage;
