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

const getCustomerName = (order: AdminOrder) =>
    order.customer_name || order.guest_name || (order.user_id ? "Registered customer" : "Guest checkout");

const getCustomerEmail = (order: AdminOrder) => order.customer_email || order.guest_email || "Not recorded";

const getPaymentLabel = (paymentMethod?: string | null) => {
    if (!paymentMethod) return "Not recorded";
    return paymentMethod.replace(/_/g, " ");
};

const getOrderAge = (date: Date) => {
    const ageInDays = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
    return ageInDays === 0 ? "Today" : `${ageInDays}d ago`;
};

const renderOrders = ({
    pendingOrders,
    status,
    formatCurrency,
    formatReportDate,
    onRetry,
}: Pick<AdminDashboardOperationsProps, "pendingOrders" | "formatCurrency" | "formatReportDate" | "onRetry"> & { status: DashboardSectionStatus }) => {
    if (status === "loading") {
        return <AdminStatusPanel variant="loading" title="Loading pending orders" description="Fetching orders that need an admin decision." />;
    }

    if (status === "error") {
        return <AdminStatusPanel variant="error" title="Orders needing action unavailable" description="The order queue could not be loaded." onRetry={onRetry} retryLabel="Retry orders" />;
    }

    if (pendingOrders.length === 0) {
        return <AdminStatusPanel variant="empty" title="No pending orders" description="There are no orders waiting for review." />;
    }

    return (
        <AdminTableScrollHint label="Orders needing action table">
            <Table responsive={false} hover borderless className="admin__table admin__table--dashboard-operations">
                <thead>
                    <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Value</th>
                        <th scope="col">Age</th>
                        <th scope="col">Payment</th>
                        <th scope="col">Action</th>
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
                                    <strong>{getCustomerName(order)}</strong>
                                    <span>{getCustomerEmail(order)}</span>
                                </div>
                            </td>
                            <td className="admin__table__numeric">{formatCurrency(Math.max(order.total_price - order.discount, 0))}</td>
                            <td>{getOrderAge(order.date_added)}</td>
                            <td><span className="admin__dashboard__table-value">{getPaymentLabel(order.payment_method)}</span></td>
                            <td><Link className="admin__dashboard__table-action" to="/admin/orders">Review</Link></td>
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
}: Pick<AdminDashboardOperationsProps, "lowStockProducts" | "onRetry"> & { status: DashboardSectionStatus }) => {
    if (status === "loading") {
        return <AdminStatusPanel variant="loading" title="Loading inventory risk" description="Checking the catalog for products below the stock threshold." />;
    }

    if (status === "error") {
        return <AdminStatusPanel variant="error" title="Inventory risk unavailable" description="The product stock queue could not be loaded." onRetry={onRetry} retryLabel="Retry inventory" />;
    }

    if (lowStockProducts.length === 0) {
        return <AdminStatusPanel variant="empty" title="No low-stock products" description="No products are currently at or below the stock threshold." />;
    }

    return (
        <AdminTableScrollHint label="Inventory risk table">
            <Table responsive={false} hover borderless className="admin__table admin__table--dashboard-operations admin__table--dashboard-inventory">
                <thead>
                    <tr>
                        <th scope="col">Product</th>
                        <th scope="col">Stock</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {lowStockProducts.slice(0, 5).map((product, index) => {
                        const stock = Number(product.stock) || 0;
                        return (
                            <tr key={product.id ?? `${product.name}-${index}`}>
                                <td>
                                    <div className="admin__table__stack">
                                        <strong>{product.name || "Unnamed product"}</strong>
                                        <span>{product.brand || product.category || "Not recorded"}</span>
                                    </div>
                                </td>
                                <td className="admin__table__numeric">{stock}</td>
                                <td><Badge variant={stock <= 0 ? "danger" : "signal"}>{getStockSeverity(stock)}</Badge></td>
                                <td><Link className="admin__dashboard__table-action" to="/admin/products">Open product</Link></td>
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
}: AdminDashboardOperationsProps) => (
    <section className="admin__dashboard__operations" aria-label="Operational work queues" role="region">
        <div className="admin__dashboard__section-heading">
            <div>
                <p className="admin__dashboard__eyebrow">Work queues</p>
                <h2>Act on what needs attention</h2>
            </div>
            <span className="admin__dashboard__section-meta">Five most urgent items</span>
        </div>
        <div className="admin__dashboard__operations-grid">
            <Card className="admin__dashboard__operation-card">
                <CardHeader className="admin__dashboard__operation-header">
                    <div className="admin__dashboard__card-heading">
                        <div>
                            <CardTitle>Orders needing action</CardTitle>
                            <CardDescription>Pending orders awaiting review or payment confirmation.</CardDescription>
                        </div>
                        <Link className="admin__dashboard__view-all" to="/admin/orders">Open orders</Link>
                    </div>
                </CardHeader>
                <CardContent className="admin__dashboard__operation-content">
                    {renderOrders({ pendingOrders, status: ordersStatus, formatCurrency, formatReportDate, onRetry })}
                </CardContent>
            </Card>
            <Card className="admin__dashboard__operation-card">
                <CardHeader className="admin__dashboard__operation-header">
                    <div className="admin__dashboard__card-heading">
                        <div>
                            <CardTitle>Inventory risk</CardTitle>
                            <CardDescription>Products at or below the low-stock threshold.</CardDescription>
                        </div>
                        <Link className="admin__dashboard__view-all" to="/admin/products">Open products</Link>
                    </div>
                </CardHeader>
                <CardContent className="admin__dashboard__operation-content">
                    {renderInventory({ lowStockProducts, status: productsStatus, onRetry })}
                </CardContent>
            </Card>
        </div>
    </section>
);

export type { AdminDashboardOperationsProps };
export default AdminDashboardOperations;
