import type { ReactNode } from "react";
import {
    ArrowLeftIcon,
    BellFillIcon,
    BankIcon,
    BoxArrowRightIcon,
    BoxSeamIcon,
    CashStackIcon,
    CartIcon,
    ClipboardListIcon,
    EnvelopeIcon,
    PersonIcon,
    ShieldIcon,
    SpeedometerIcon,
    StarFillIcon,
    SupplierIcon,
    PurchaseOrderIcon,
    StockCountIcon,
    TelephoneIcon,
} from "../common/Icons";

export type AdminNavItem = {
    label: string;
    path: string;
    match: string;
    icon: ReactNode;
    searchTerms: string[];
};

export const adminNavGroups: { label: string; items: AdminNavItem[]; collapsible?: boolean; defaultExpanded?: boolean }[] = [
    {
        label: "Overview",
        collapsible: true,
        defaultExpanded: true,
        items: [
            {
                label: "Dashboard",
                path: "/admin",
                match: "dashboard",
                icon: <SpeedometerIcon size={20} />,
                searchTerms: ["overview", "tổng quan"],
            },
            {
                label: "Notifications",
                path: "/admin/notifications",
                match: "notifications",
                icon: <BellFillIcon size={20} />,
                searchTerms: ["alerts", "activity", "cảnh báo", "thông báo"],
            },
        ],
    },
    {
        label: "Commerce",
        collapsible: true,
        defaultExpanded: true,
        items: [
            {
                label: "Orders",
                path: "/admin/orders",
                match: "orders",
                icon: <CartIcon size={20} />,
                searchTerms: ["order", "đơn hàng"],
            },
            {
                label: "Fulfillment",
                path: "/admin/fulfillment",
                match: "fulfillment",
                icon: <BoxSeamIcon size={20} />,
                searchTerms: ["packing", "đóng gói", "xử lý giao hàng"],
            },
            {
                label: "Products",
                path: "/admin/products",
                match: "products",
                icon: <ClipboardListIcon size={20} />,
                searchTerms: ["product", "catalog", "inventory", "sản phẩm", "danh mục", "tồn kho"],
            },
            {
                label: "Suppliers",
                path: "/admin/suppliers",
                match: "suppliers",
                icon: <SupplierIcon size={20} />,
                searchTerms: ["vendor", "nhà cung cấp"],
            },
            {
                label: "Purchase orders",
                path: "/admin/purchase-orders",
                match: "purchase-orders",
                icon: <PurchaseOrderIcon size={20} />,
                searchTerms: ["procurement", "receiving", "đơn mua hàng", "nhập hàng"],
            },
            {
                label: "Stock counts",
                path: "/admin/stock-counts",
                match: "stock-counts",
                icon: <StockCountIcon size={20} />,
                searchTerms: ["inventory count", "kiểm kê"],
            },
            {
                label: "Promotions",
                path: "/admin/promotions",
                match: "promotions",
                icon: <StarFillIcon size={20} />,
                searchTerms: ["promotion", "discount", "khuyến mãi"],
            },
        ],
    },
    {
        label: "People & support",
        collapsible: true,
        items: [
            {
                label: "Accounts",
                path: "/admin/accounts",
                match: "accounts",
                icon: <PersonIcon size={20} />,
                searchTerms: ["account", "users", "customers", "tài khoản", "khách hàng"],
            },
            {
                label: "Support",
                path: "/admin/support",
                match: "support",
                icon: <TelephoneIcon size={20} />,
                searchTerms: ["hỗ trợ"],
            },
            {
                label: "After-sales",
                path: "/admin/after-sales",
                match: "after-sales",
                icon: <ArrowLeftIcon size={20} />,
                searchTerms: ["returns", "warranty", "đổi trả", "bảo hành", "hậu mãi"],
            },
        ],
    },
    {
        label: "Finance",
        collapsible: true,
        items: [
            {
                label: "Payment reconciliation",
                path: "/admin/payments/reconciliation",
                match: "payments",
                icon: <BankIcon size={20} />,
                searchTerms: ["payment", "reconciliation", "đối soát thanh toán", "thanh toán"],
            },
            {
                label: "COD settlements",
                path: "/admin/payments/cod-settlements",
                match: "cod-settlements",
                icon: <CashStackIcon size={20} />,
                searchTerms: ["cod", "cash on delivery", "đối soát cod"],
            },
        ],
    },
    {
        label: "System & setup",
        collapsible: true,
        items: [
            {
                label: "Delivery settings",
                path: "/admin/delivery/settings",
                match: "delivery-settings",
                icon: <BoxArrowRightIcon size={20} />,
                searchTerms: ["shipping settings", "cài đặt giao hàng"],
            },
            {
                label: "Email operations",
                path: "/admin/email-operations",
                match: "email-operations",
                icon: <EnvelopeIcon size={20} />,
                searchTerms: ["email", "email giao dịch"],
            },
            {
                label: "Audit log",
                path: "/admin/audit",
                match: "audit",
                icon: <ShieldIcon size={20} />,
                searchTerms: ["audit", "nhật ký thay đổi"],
            },
        ],
    },
];

export const adminNavItems = adminNavGroups.flatMap((group) => group.items);

const normalizeSearchTerm = (value: string) =>
    value
        .trim()
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đ]/g, "d")
        .replace(/\s+/g, " ");

export const findAdminNavigationItem = (keyword: string, localize: (label: string) => string) => {
    const normalizedKeyword = normalizeSearchTerm(keyword);
    if (!normalizedKeyword) return undefined;

    return adminNavItems.find((item) =>
        [item.label, localize(item.label), ...item.searchTerms].some(
            (term) => normalizeSearchTerm(term) === normalizedKeyword,
        ),
    );
};
