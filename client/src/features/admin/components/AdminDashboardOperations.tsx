import { Link } from "react-router-dom";
import type { AdminOrder } from "../../../types/order";
import { Badge } from "../../../components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "../../../components/ui/card";
import { Table } from "../../../components/ui/legacy";
import AdminStatusPanel from "./AdminStatusPanel";
import AdminTableScrollHint from "./AdminTableScrollHint";
import type { DashboardSectionStatus } from "../utils/dashboardAvailability";
import { ORDER_STATUS } from "../../orders/orderStatus";
import { useAdminDashboardCopy } from "../../../hooks/useAdminDashboardCopy";

export type DashboardLowStockProduct = {
    id?: number;
    name?: string;
    stock?: number;
    category?: string;
    brand?: string;
};

type AdminDashboardOperationsProps = {
    pendingOrders: AdminOrder[];
    lowStockProducts: DashboardLowStockProduct[];
    ordersStatus: DashboardSectionStatus;
    productsStatus: DashboardSectionStatus;
    formatCurrency: (value: number) => string;
    formatReportDate: (date: Date) => string;
    onRetry?: () => void;
};

const getCustomerName = (order: AdminOrder) => order.customer_name || order.guest_name || "";

const getCustomerEmail = (order: AdminOrder) => order.customer_email || order.guest_email || "";

const getPaymentLabel = (paymentMethod?: string | null) => {
    if (!paymentMethod) return "Not recorded";
    return paymentMethod.replace(/_/g, " ");
};

const getOrderAge = (date: Date, tx: AdminCopy) => {
    const ageInDays = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
    return ageInDays === 0 ? tx("Today") : `${ageInDays} ${tx(ageInDays === 1 ? "day ago" : "days ago")}`;
};

type AdminCopy = (source: string) => string;

const renderOrders = ({
    pendingOrders,
    status,
    formatCurrency,
    formatReportDate,
    onRetry,
    tx,
}: Pick<AdminDashboardOperationsProps, "pendingOrders" | "formatCurrency" | "formatReportDate" | "onRetry"> & { status: DashboardSectionStatus; tx: AdminCopy }) => {
    if (status === "loading") {
        return <AdminStatusPanel variant="loading" title={tx("Loading pending orders")} description={tx("Fetching orders that need an admin decision.")} />;
    }

    if (status === "error") {
        return <AdminStatusPanel variant="error" title={tx("Orders needing action unavailable")} description={tx("The order queue could not be loaded.")} onRetry={onRetry} retryLabel={tx("Retry orders")} />;
    }

    if (pendingOrders.length === 0) {
        return <AdminStatusPanel variant="empty" title={tx("No pending orders")} description={tx("There are no orders waiting for review.")} />;
    }

    return (
        <AdminTableScrollHint label={tx("Orders needing action table")}>
            <Table responsive={false} hover borderless className="admin__table admin__table--dashboard-operations">
                <thead>
                    <tr>
                        <th scope="col">{tx("Order")}</th>
                        <th scope="col">{tx("Customer")}</th>
                        <th scope="col">{tx("Value")}</th>
                        <th scope="col">{tx("Age")}</th>
                        <th scope="col">{tx("Payment")}</th>
                        <th scope="col">{tx("Action")}</th>
                    </tr>
                </thead>
                <tbody>
                    {pendingOrders.slice(0, 5).map((order) => (
                        <tr key={order.id}>
                            <td>
                                <div className="admin__table__stack">
                                    <strong>#{order.id}</strong>
                                    <span>{formatReportDate(new Date(order.date_added))}</span>
                                </div>
                            </td>
                            <td>
                                <div className="admin__table__stack">
                                    <strong>{getCustomerName(order) || tx(order.user_id ? "Registered customer" : "Guest checkout")}</strong>
                                    <span>{getCustomerEmail(order) || tx("Not recorded")}</span>
                                </div>
                            </td>
                            <td className="admin__table__numeric">{formatCurrency(order.status === ORDER_STATUS.CANCELED ? 0 : Math.max(order.total_price - order.discount, 0))}</td>
                            <td>{getOrderAge(order.date_added, tx)}</td>
                            <td><span className="admin__dashboard__table-value">{tx(getPaymentLabel(order.payment_method))}</span></td>
                            <td><Link className="admin__dashboard__table-action" to="/admin/orders">{tx("Review")}</Link></td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </AdminTableScrollHint>
    );
};

const getStockSeverity = (stock: number) => stock <= 0 ? "Critical" : "Low";

const renderInventory = ({
    lowStockProducts,
    status,
    onRetry,
    tx,
}: Pick<AdminDashboardOperationsProps, "lowStockProducts" | "onRetry"> & { status: DashboardSectionStatus; tx: AdminCopy }) => {
    if (status === "loading") {
        return <AdminStatusPanel variant="loading" title={tx("Loading inventory risk")} description={tx("Checking the catalog for products below the stock threshold.")} />;
    }

    if (status === "error") {
        return <AdminStatusPanel variant="error" title={tx("Inventory risk unavailable")} description={tx("The product stock queue could not be loaded.")} onRetry={onRetry} retryLabel={tx("Retry inventory")} />;
    }

    if (lowStockProducts.length === 0) {
        return <AdminStatusPanel variant="empty" title={tx("No low-stock products")} description={tx("No products are currently at or below the stock threshold.")} />;
    }

    return (
        <AdminTableScrollHint label={tx("Inventory risk table")}>
            <Table responsive={false} hover borderless className="admin__table admin__table--dashboard-operations admin__table--dashboard-inventory">
                <thead>
                    <tr>
                        <th scope="col">{tx("Product")}</th>
                        <th scope="col">{tx("Stock")}</th>
                        <th scope="col">{tx("Severity")}</th>
                        <th scope="col">{tx("Action")}</th>
                    </tr>
                </thead>
                <tbody>
                    {lowStockProducts.slice(0, 5).map((product, index) => {
                        const stock = Number(product.stock) || 0;
                        return (
                            <tr key={product.id ?? `${product.name}-${index}`}>
                                <td>
                                    <div className="admin__table__stack">
                                    <strong>{product.name || tx("Unnamed product")}</strong>
                                    <span>{product.brand || product.category || tx("Not recorded")}</span>
                                    </div>
                                </td>
                                <td className="admin__table__numeric">{stock}</td>
                                <td><Badge variant={stock <= 0 ? "danger" : "signal"}>{tx(getStockSeverity(stock))}</Badge></td>
                                <td><Link className="admin__dashboard__table-action" to="/admin/products">{tx("Open product")}</Link></td>
                            </tr>
                        );
                    })}
                </tbody>
            </Table>
        </AdminTableScrollHint>
    );
};

const AdminDashboardOperations = ({
    pendingOrders,
    lowStockProducts,
    ordersStatus,
    productsStatus,
    formatCurrency,
    formatReportDate,
    onRetry,
}: AdminDashboardOperationsProps) => {
    const tx = useAdminDashboardCopy();
    return (
    <section className="admin__dashboard__operations" aria-label={tx("Operational work queues")} role="region">
        <div className="admin__dashboard__section-heading">
            <div>
                <p className="admin__dashboard__eyebrow">{tx("Work queues")}</p>
                <h2>{tx("Act on what needs attention")}</h2>
            </div>
            <span className="admin__dashboard__section-meta">{tx("Five most urgent items")}</span>
        </div>
        <div className="admin__dashboard__operations-grid">
            <Card className="admin__dashboard__operation-card">
                <CardHeader className="admin__dashboard__operation-header">
                    <div className="admin__dashboard__card-heading">
                        <div>
                            <CardTitle>{tx("Orders needing action")}</CardTitle>
                            <CardDescription>{tx("Pending orders awaiting review or payment confirmation.")}</CardDescription>
                        </div>
                        <Link className="admin__dashboard__view-all" to="/admin/orders">{tx("Open orders")}</Link>
                    </div>
                </CardHeader>
                <CardContent className="admin__dashboard__operation-content">
                    {renderOrders({ pendingOrders, status: ordersStatus, formatCurrency, formatReportDate, onRetry, tx })}
                </CardContent>
            </Card>
            <Card className="admin__dashboard__operation-card">
                <CardHeader className="admin__dashboard__operation-header">
                    <div className="admin__dashboard__card-heading">
                        <div>
                            <CardTitle>{tx("Inventory risk")}</CardTitle>
                            <CardDescription>{tx("Products at or below the low-stock threshold.")}</CardDescription>
                        </div>
                        <Link className="admin__dashboard__view-all" to="/admin/products">{tx("Open products")}</Link>
                    </div>
                </CardHeader>
                <CardContent className="admin__dashboard__operation-content">
                    {renderInventory({ lowStockProducts, status: productsStatus, onRetry, tx })}
                </CardContent>
            </Card>
        </div>
    </section>
    );
};

export type { AdminDashboardOperationsProps };
export default AdminDashboardOperations;
