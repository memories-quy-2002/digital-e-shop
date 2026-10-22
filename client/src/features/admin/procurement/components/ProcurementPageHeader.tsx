import type { Locale } from "../../../../i18n";
import { procurementCopy as copy } from "../copy";

type ProcurementPage = "suppliers" | "purchase-orders" | "stock-counts";

const PAGES = [
    { id: "suppliers", href: "/admin/suppliers", en: "Suppliers", vi: "Nhà cung cấp", descriptionEn: "Keep supplier contacts ready for purchasing and receiving.", descriptionVi: "Quản lý liên hệ nhà cung cấp cho việc đặt và nhận hàng." },
    { id: "purchase-orders", href: "/admin/purchase-orders", en: "Purchase orders", vi: "Đơn mua hàng", descriptionEn: "Track supplier commitments, deliveries, and actual acquisition cost.", descriptionVi: "Theo dõi cam kết với nhà cung cấp, các lần giao hàng và giá nhập thực tế." },
    { id: "stock-counts", href: "/admin/stock-counts", en: "Stock counts", vi: "Kiểm kê kho", descriptionEn: "Count against a saved stock baseline and review changes before they affect inventory.", descriptionVi: "Đối chiếu với mốc tồn đã lưu và duyệt chênh lệch trước khi cập nhật kho." },
] as const;

export default function ProcurementPageHeader({ locale, page }: { locale: Locale; page: ProcurementPage }) {
    const current = PAGES.find((item) => item.id === page)!;
    const title = copy(locale, current.en, current.vi);
    return (
        <header className="admin__page__header">
            <div>
                <span className="admin__page__eyebrow">{copy(locale, "Inventory operations", "Vận hành kho")}</span>
                <h1 className="admin__page__title">{title}</h1>
                <p className="admin__page__subtitle">{copy(locale, current.descriptionEn, current.descriptionVi)}</p>
            </div>
            <nav className="procurement__tabs" aria-label={copy(locale, "Inventory operations", "Vận hành kho")}>
                {PAGES.map((item) => (
                    <a key={item.id} href={item.href} aria-current={page === item.id ? "page" : undefined}>
                        {copy(locale, item.en, item.vi)}
                    </a>
                ))}
            </nav>
        </header>
    );
}
