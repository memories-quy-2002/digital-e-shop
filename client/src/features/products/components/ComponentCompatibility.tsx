import { useRef, useState, type FormEvent } from "react";
import { useLocale } from "../../../context/LocaleContext";
import type { Product } from "../../../types/product";
import { fetchProduct, fetchProductCatalog, normalizeAttributeKey, type ProductWithAttributes } from "../api";
import { assessComponentCompatibility } from "../compare/componentCompatibility";

export function ComponentCompatibility({ product }: { product: Product }) {
    const { locale } = useLocale();
    const vi = locale === "vi";
    const category = normalizeAttributeKey(product.category);
    const isBoard = category === "motherboard";
    const counterpartCategories = isBoard ? ["cpu", "processor", "ram", "memory"] : ["motherboard"];
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<Product[] | null>(null);
    const [selected, setSelected] = useState<ProductWithAttributes | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const request = useRef(0);

    if (!isBoard && !["cpu", "processor", "ram", "memory"].includes(category)) return null;

    async function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!query.trim()) return;
        const id = ++request.current;
        setBusy(true);
        setError(false);
        setSelected(null);
        setMatches(null);
        try {
            const { products } = await fetchProductCatalog({
                term: query.trim(),
                categories: counterpartCategories.join(","),
                page: "1",
                limit: "12",
            });
            if (id === request.current) setMatches(products.filter((item) => counterpartCategories.includes(normalizeAttributeKey(item.category))));
        } catch {
            if (id === request.current) setError(true);
        } finally {
            if (id === request.current) setBusy(false);
        }
    }

    async function select(id: number) {
        const attempt = ++request.current;
        setBusy(true);
        setError(false);
        setSelected(null);
        try {
            const item = await fetchProduct(id);
            if (attempt === request.current) {
                setSelected(item);
                setError(!item);
            }
        } catch {
            if (attempt === request.current) setError(true);
        } finally {
            if (attempt === request.current) setBusy(false);
        }
    }

    const current = { category: product.category, attributes: "attributes" in product && Array.isArray(product.attributes) ? product.attributes : [] };
    const result = selected && (isBoard ? assessComponentCompatibility(current, selected) : assessComponentCompatibility(selected, current));
    const status = result?.status === "compatible" ? (vi ? "Thông số khớp" : "Specification matches")
        : result?.status === "conflict" ? (vi ? "Thông số xung đột" : "Specification conflict")
        : (vi ? "Chưa đủ dữ liệu" : "Insufficient evidence");

    return (
        <section className="product-page__description-card">
            <h2>{vi ? "Kiểm tra thông số tương thích" : "Check component compatibility"}</h2>
            <p>{vi ? "Đối chiếu socket hoặc chuẩn RAM. Hãy kiểm tra danh sách hỗ trợ của nhà sản xuất trước khi mua." : "Compare socket or memory standard. Check the manufacturer's support list before buying."}</p>
            <form onSubmit={search}>
                <label>{vi ? "Tên hoặc mã linh kiện" : "Component name or model"}
                    <input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <button type="submit" disabled={busy || !query.trim()}>{vi ? "Tìm linh kiện" : "Find components"}</button>
            </form>
            {matches?.length ? <ul>{matches.map((item) => (
                <li key={item.id}><button type="button" disabled={busy} onClick={() => void select(item.id)}>{item.name}</button></li>
            ))}</ul> : null}
            <div role="status">
                {busy ? <p>{vi ? "Đang tải…" : "Loading…"}</p> : null}
                {error ? <p>{vi ? "Không tải được dữ liệu. Hãy thử lại." : "Could not load component data. Try again."}</p> : null}
                {matches?.length === 0 ? <p>{vi ? "Không tìm thấy linh kiện phù hợp để đối chiếu." : "No matching components to check."}</p> : null}
                {selected ? <p><strong>{selected.name}: {status}</strong>{result ? ` · ${result.field === "socket" ? "Socket" : "RAM"} · ${result.boardValues.join(", ") || "—"} / ${result.partValues.join(", ") || "—"}` : ""}</p> : null}
            </div>
        </section>
    );
}
