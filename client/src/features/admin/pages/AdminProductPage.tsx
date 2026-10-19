import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button, Modal, Table } from "../../../components/ui/legacy";
import ReactPaginate from "react-paginate";
import { useNavigate } from "react-router-dom";
import type { Product } from "../../../types/product";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminProductItem from "../../../components/common/admin/AdminProductItem";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import { useAdminCopy } from "../../../hooks/useAdminCopy";
import { useLocale } from "../../../context/LocaleContext";
import {
    fetchAdminProductsPage,
    updateProduct,
    deleteProduct,
    updateProductInventory,
    fetchInventoryMovements,
} from "../api";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { getApiErrorMessage } from "../../../lib/api-contract";
import {
    createProductAttributeRow,
    productAttributeRowsToInputs,
    type ProductAttributeRow,
    type ProductWithAttributes,
} from "../../products/api";
import {
    highlightsFromText,
    highlightsToText,
    parseProductDetails,
    rowsFromText,
    rowsToText,
    serializeProductDetails,
} from "../../../utils/productDetails";
import { normalizeProduct as normalizeProductResponse } from "../../../utils/product";
import ProductForm, {
    type ProductFormErrors,
    type ProductFormField,
    type ProductFormValues,
} from "../components/ProductForm";
import { validateProductEdit } from "../utils/validateProductEdit";
import "../../../styles/features/admin/_products.scss";

const ITEMS_PER_PAGE = 8;
const STOCK_FILTERS = ["all", "low", "out"] as const;
type StockFilter = (typeof STOCK_FILTERS)[number];

type ProductEditForm = Omit<ProductFormValues, "inventory" | "stock" | "price" | "salePrice"> & {
    price: string;
    salePrice: string;
    stock: string;
};

type InventoryMovement = {
    id: number;
    product_id: number;
    product_name: string | null;
    order_id: number | null;
    movement_type: string;
    quantity_change: number;
    stock_before: number | null;
    stock_after: number | null;
    note: string | null;
    created_at: string;
};

const normalizeProduct = (product: ProductWithAttributes): ProductWithAttributes => {
    const normalized = normalizeProductResponse(product);
    return {
        ...normalized,
        attributes: product.attributes,
        price: Number(normalized.price) || 0,
        sale_price: normalized.sale_price === null ? null : Number(normalized.sale_price),
        stock: Number(normalized.stock) || 0,
    };
};

const AdminProductPage = () => {
    const navigate = useNavigate();
    const tx = useAdminCopy();
    const { locale } = useLocale();
    const [products, setProducts] = useState<ProductWithAttributes[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [stockFilter, setStockFilter] = useState<StockFilter>("all");
    const [show, setShow] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductWithAttributes | null>(null);
    const [editForm, setEditForm] = useState<ProductEditForm>({
        name: "",
        sku: "",
        manufacturerPartNumber: "",
        warrantyMonths: "",
        description: "",
        category: "",
        brand: "",
        price: "",
        salePrice: "",
        stock: "",
        model: "",
        warranty: "",
        datasheet: "",
        highlights: "",
        specifications: "",
        attributes: [],
    });
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editValidationErrors, setEditValidationErrors] = useState<ProductFormErrors>({});
    const [attributeError, setAttributeError] = useState<string | undefined>();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [restockValues, setRestockValues] = useState<Record<number, string>>({});
    const [restockReasons, setRestockReasons] = useState<Record<number, string>>({});
    const [inventoryWatch, setInventoryWatch] = useState<ProductWithAttributes[]>([]);
    const [productSummary, setProductSummary] = useState({ total: 0, lowStock: 0, outOfStock: 0 });
    const [matchingProductTotal, setMatchingProductTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [productsError, setProductsError] = useState<AdminRequestError | null>(null);
    const [movementsLoaded, setMovementsLoaded] = useState(false);
    const [inventoryMovementsError, setInventoryMovementsError] = useState<AdminRequestError | null>(null);
    const productsLoadedRef = useRef(false);
    const requestSequence = useRef(0);
    const movementsLoadedRef = useRef(false);
    const { addToast } = useToast();
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const loadProducts = React.useCallback(async () => {
        const requestId = ++requestSequence.current;
        try {
            setProductsError(null);
            const [page, inventoryPage] = await Promise.all([
                fetchAdminProductsPage({ page: currentPage, limit: ITEMS_PER_PAGE, search: deferredSearchTerm, stock: stockFilter }),
                fetchAdminProductsPage({ page: 1, limit: 8, stock: "low" }),
            ]);
            if (requestId !== requestSequence.current) return;
            setProducts(page.items.map(normalizeProduct));
            setProductSummary(page.summary);
            setMatchingProductTotal(page.pagination.total);
            setTotalPages(page.pagination.totalPages);
            setInventoryWatch(inventoryPage.items.map(normalizeProduct));
            setProductsLoaded(true);
            productsLoadedRef.current = true;
        } catch (error) {
            if (requestId !== requestSequence.current) return;
            setProductsError(getAdminRequestError(error));
            if (productsLoadedRef.current) addToast(tx("Products"), tx("Refresh failed. Showing the latest saved products."));
        }
    }, [addToast, currentPage, deferredSearchTerm, stockFilter, tx]);

    const loadMovements = React.useCallback(async () => {
        try {
            setInventoryMovementsError(null);
            const movements = await fetchInventoryMovements(12);
                setInventoryMovements(movements);
            setMovementsLoaded(true);
            movementsLoadedRef.current = true;
        } catch (error) {
            setInventoryMovementsError(getAdminRequestError(error));
            if (movementsLoadedRef.current) addToast(tx("Inventory"), tx("Refresh failed. Showing the latest saved movements."));
        }
    }, [addToast, tx]);

    useEffect(() => {
        loadProducts();
        loadMovements();
    }, [loadMovements, loadProducts]);

    const filteredProducts = products;
    const pageCount = totalPages;
    const currentProducts = products;

    useEffect(() => {
        const safePageCount = Math.max(pageCount, 1);
        if (currentPage > safePageCount) {
            setCurrentPage(1);
        }
    }, [currentPage, pageCount]);

    const handleOpen = (product: Product) => {
        const productWithAttributes = product as ProductWithAttributes;
        const details = parseProductDetails(product.specifications);
        setSelectedProduct(productWithAttributes);
        setEditForm({
            name: product.name,
            sku: product.sku || "",
            manufacturerPartNumber: product.manufacturerPartNumber || "",
            warrantyMonths: product.warrantyMonths === null ? "" : String(product.warrantyMonths),
            description: product.description || "",
            category: product.category || "",
            brand: product.brand || "",
            price: String(product.price),
            salePrice: product.sale_price === null ? "" : String(product.sale_price),
            stock: String(product.stock),
            model: details.model,
            warranty: details.warranty,
            datasheet: details.datasheet,
            highlights: highlightsToText(details.highlights),
            specifications: rowsToText(details.specifications),
            attributes: productWithAttributes.attributes ?? [],
        });
        setEditValidationErrors({});
        setAttributeError(undefined);
        setShow(true);
    };

    const handleClose = () => {
        setShow(false);
        setSelectedProduct(null);
        setEditValidationErrors({});
        setAttributeError(undefined);
    };

    const handleEditFieldChange = (field: ProductFormField, value: string) => {
        setEditForm((currentForm) => ({ ...currentForm, [field]: value }));
        setEditValidationErrors((current) => {
            if (!(field in current)) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
        if (attributeError) setAttributeError(undefined);
    };

    const handleAttributeChange = (id: string, patch: Partial<ProductAttributeRow>) => {
        setEditForm((currentForm) => ({
            ...currentForm,
            attributes: currentForm.attributes.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        }));
        if (attributeError) setAttributeError(undefined);
    };

    const addAttribute = () => {
        setEditForm((currentForm) => ({
            ...currentForm,
            attributes: [...currentForm.attributes, createProductAttributeRow()],
        }));
        if (attributeError) setAttributeError(undefined);
    };

    const removeAttribute = (id: string) => {
        setEditForm((currentForm) => ({
            ...currentForm,
            attributes: currentForm.attributes.filter((row) => row.id !== id),
        }));
        if (attributeError) setAttributeError(undefined);
    };

    const handleSave = async () => {
        if (!selectedProduct) {
            return;
        }

        const nextValidationErrors = validateProductEdit({
            name: editForm.name,
            sku: editForm.sku,
            category: editForm.category,
            brand: editForm.brand,
            price: editForm.price,
            salePrice: editForm.salePrice,
            warrantyMonths: editForm.warrantyMonths,
        });
        const firstInvalidField = Object.keys(nextValidationErrors)[0] as ProductFormField | undefined;

        if (firstInvalidField) {
            setEditValidationErrors(nextValidationErrors);
            const fieldIds: Partial<Record<ProductFormField, string>> = {
                name: "manage-product-name",
                sku: "manage-product-sku",
                category: "manage-product-category",
                brand: "manage-product-brand",
                price: "manage-product-price",
                salePrice: "manage-product-sale-price",
                warrantyMonths: "manage-product-warranty-months",
            };
            document.getElementById(fieldIds[firstInvalidField] || "")?.focus();
            return;
        }

        setEditValidationErrors({});
        const price = Number(editForm.price);
        const salePrice = editForm.salePrice.trim() === "" ? null : Number(editForm.salePrice);
        const warrantyMonths = editForm.warrantyMonths.trim() === "" ? null : Number(editForm.warrantyMonths);
        let attributes;

        try {
            attributes = productAttributeRowsToInputs(editForm.attributes);
        } catch (error) {
            setAttributeError(error instanceof Error ? error.message : "Product attributes are invalid.");
            addToast(tx("Update product"), error instanceof Error ? error.message : tx("Product attributes are invalid."));
            return;
        }

        try {
            setIsSaving(true);
            const updated = await updateProduct(selectedProduct.id, {
                name: editForm.name.trim(),
                sku: editForm.sku.trim(),
                manufacturerPartNumber: editForm.manufacturerPartNumber.trim() || null,
                warrantyMonths,
                description: editForm.description.trim(),
                category: editForm.category.trim(),
                brand: editForm.brand.trim(),
                price,
                salePrice,
                attributes,
                specifications: serializeProductDetails({
                    model: editForm.model,
                    warranty: editForm.warranty,
                    datasheet: editForm.datasheet,
                    highlights: highlightsFromText(editForm.highlights),
                    specifications: rowsFromText(editForm.specifications),
                }),
            });
            const updatedProduct = normalizeProduct(updated);
            setProducts((currentProducts) =>
                currentProducts.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
            );
            await loadMovements();
            addToast(tx("Update product"), `${updatedProduct.name} ${tx("has been updated.")}`);
            handleClose();
        } catch (error: unknown) {
            addToast(tx("Update product"), getApiErrorMessage(error, tx("Unable to update product.")));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedProduct) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteProduct(selectedProduct.id);
            setProducts((currentProducts) => currentProducts.filter((product) => product.id !== selectedProduct.id));
            addToast(tx("Hide product"), `${selectedProduct.name} ${tx("has been hidden from the catalog.")}`);
            setShowDeleteConfirm(false);
            handleClose();
        } catch (error: unknown) {
            addToast(tx("Hide product"), getApiErrorMessage(error, tx("Unable to hide product.")));
        } finally {
            setIsDeleting(false);
        }
    };

    const handlePageClick = (event: { selected: number }) => {
        setCurrentPage(event.selected + 1);
    };

    const handleQuickRestock = async (product: Product) => {
        const stock = Number(restockValues[product.id] ?? product.stock);
        const reason = restockReasons[product.id]?.trim() || "";
        if (!Number.isInteger(stock) || stock < 0) {
            addToast(tx("Inventory"), tx("Stock must be a valid whole number."));
            return;
        }
        if (reason.length < 8) {
            addToast(tx("Inventory"), tx("Add a reason with at least 8 characters before updating stock."));
            return;
        }

        try {
            const updated = await updateProductInventory(product.id, stock, reason);
            const updatedProduct = normalizeProduct(updated);
            setProducts((currentProducts) =>
                currentProducts.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)),
            );
            setRestockValues((current) => ({ ...current, [product.id]: "" }));
            setRestockReasons((current) => ({ ...current, [product.id]: "" }));
            await Promise.all([loadMovements(), loadProducts()]);
            addToast(tx("Inventory"), `${updatedProduct.name} ${tx("stock updated.")}`);
        } catch (error: unknown) {
            addToast(tx("Inventory"), getApiErrorMessage(error, tx("Unable to update stock.")));
        }
    };

    const exportProductsCsv = () => {
        const rows = [
            ["id", "name", "category", "brand", "price", "sale_price", "stock"],
            ...products.map((product) => [
                String(product.id),
                product.name,
                product.category,
                product.brand,
                product.price.toFixed(2),
                product.sale_price === null ? "" : product.sale_price.toFixed(2),
                String(product.stock),
            ]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "digital-e-products.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>{tx("Products")} | Digital-E</title>
                <meta name="description" content="Manage products in the store." />
            </Helmet>
            <main className="admin__page admin__page--products">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">{tx("Catalog")}</span>
                        <h1 className="admin__page__title">{tx("Products")}</h1>
                        <p className="admin__page__subtitle">
                            {tx("Track inventory, pricing, and product availability across your store.")}
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={exportProductsCsv}>
                            {tx("Export loaded page CSV")}
                        </button>
                        <button type="button" className="admin__button admin__button--primary" onClick={() => navigate("/admin/add")}>
                            + {tx("Add product")}
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>{tx("Total products")}</span>
                        <strong>{productSummary.total}</strong>
                        <p>{tx("All listings")}</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>{tx("Visible")}</span>
                        <strong>{matchingProductTotal}</strong>
                        <p>{tx("Matching current filters")}</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>{tx("Needs replenishment")}</span>
                        <strong>{productSummary.lowStock + productSummary.outOfStock}</strong>
                        <p>{tx("Need attention")}</p>
                    </div>
                </section>

                <section className="admin__card admin__product-list">
                    <div className="admin__card__header admin__card__header--stacked admin__product-list__header">
                        <div>
                            <h3>{tx("Product list")}</h3>
                            <span className="admin__product-list__count">{matchingProductTotal} {tx("results")}</span>
                        </div>
                        <div className="admin__list-toolbar admin__product-list__toolbar">
                            <div className="admin__filters admin__product-list__filters">
                                <label className="admin__sr-only" htmlFor="product">
                                    {tx("Search products")}
                                </label>
                                <input
                                    type="search"
                                    name="product"
                                    id="product"
                                    placeholder={tx("Search name, SKU, model, brand, category, or ID…")}
                                    value={searchTerm}
                                    onChange={(event) => {
                                        setSearchTerm(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                                <label className="admin__sr-only" htmlFor="product-stock-filter">{tx("Filter by stock")}</label>
                                <select
                                    id="product-stock-filter"
                                    aria-label={tx("Filter by stock")}
                                    value={stockFilter}
                                    onChange={(event) => { setStockFilter(event.target.value as StockFilter); setCurrentPage(1); }}
                                >
                                    {STOCK_FILTERS.map((filter) => <option key={filter} value={filter}>{tx(filter === "all" ? "All stock" : filter === "low" ? "Low stock" : "Out of stock")}</option>)}
                                </select>
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setCurrentPage(1);
                                    }}
                                >
                                    {tx("Clear")}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        {productsError && !productsLoaded ? <AdminStatusPanel variant="error" title={productsError.title} description={productsError.message} onRetry={loadProducts} /> : null}
                        {!productsError && !productsLoaded ? <AdminStatusPanel variant="loading" title={tx("Loading products")} description={tx("Fetching the latest catalog.")} /> : null}
                        {productsError && productsLoaded ? <AdminStatusPanel variant="error" title={tx("Product refresh failed")} description={productsError.message} onRetry={loadProducts} retryLabel={tx("Retry refresh")} /> : null}
                        {!productsError && productsLoaded && filteredProducts.length === 0 ? <AdminStatusPanel variant="empty" title={tx("No products found")} description={tx("No products match the current search.")} /> : null}
                        {(!productsError || productsLoaded) && productsLoaded && filteredProducts.length > 0 ? <>
                        <AdminTableScrollHint label={tx("Product catalog table")}>
                        <Table responsive={false} hover borderless className="admin__table admin__table--products">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>{tx("Name")}</th>
                                    <th>{tx("Category")}</th>
                                    <th>{tx("Brand")}</th>
                                    <th>{tx("Price")}</th>
                                    <th>{tx("Sale")}</th>
                                    <th>{tx("Quantity")}</th>
                                    <th>{tx("Action")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentProducts.map((product) => (
                                    <AdminProductItem
                                        key={product.id}
                                        products={filteredProducts}
                                        product={product}
                                        handleOpen={handleOpen}
                                    />
                                ))}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint>
                        {pageCount > 1 ? <div className="admin__table__pagination">
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                pageClassName="pagination__item"
                                pageLinkClassName="pagination__link"
                                previousClassName="pagination__item"
                                nextClassName="pagination__item"
                                breakClassName="pagination__item"
                                activeClassName="selected"
                                disabledClassName="disabled"
                                breakLabel="…"
                                nextLabel={tx("Next")}
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel={tx("Previous")}
                                forcePage={Math.max(currentPage - 1, 0)}
                                renderOnZeroPageCount={null}
                            />
                        </div> : null}
                        </> : null}
                        <Modal
                            show={show}
                            onHide={handleClose}
                            animation={false}
                            centered
                            size="lg"
                            dialogClassName="admin__dialog"
                            contentClassName="admin__dialog__content"
                        >
                            <Modal.Header closeButton>
                                <Modal.Title>{tx("Manage product")}</Modal.Title>
                            </Modal.Header>
                            <Modal.Body>
                                <form
                                    id="manage-product-form"
                                    className="admin__product-form__native"
                                    noValidate
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void handleSave();
                                    }}
                                >
                                    <ProductForm
                                        mode="edit"
                                        idPrefix="manage-product"
                                        values={editForm}
                                        errors={editValidationErrors}
                                        onChange={handleEditFieldChange}
                                        onAttributeChange={handleAttributeChange}
                                        onAddAttribute={addAttribute}
                                        onRemoveAttribute={removeAttribute}
                                        attributeError={attributeError}
                                        currentStock={Number(editForm.stock) || 0}
                                    />
                                </form>
                            </Modal.Body>
                            <Modal.Footer className="admin__modal-actions">
                                <Button
                                    variant="outline-danger"
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={isDeleting || isSaving}
                                >
                                    {isDeleting ? tx("Hiding...") : tx("Hide product")}
                                </Button>
                                <div>
                                    <Button type="button" variant="secondary" onClick={handleClose} disabled={isDeleting || isSaving}>
                                        {tx("Cancel")}
                                    </Button>
                                    <Button
                                        type="submit"
                                        form="manage-product-form"
                                        variant="primary"
                                        disabled={isDeleting || isSaving}
                                    >
                                        {isSaving ? tx("Saving...") : tx("Save changes")}
                                    </Button>
                                </div>
                            </Modal.Footer>
                        </Modal>
                        <ConfirmActionModal
                            show={showDeleteConfirm && selectedProduct !== null}
                            title={tx("Hide product")}
                            message={`${tx("Hide")} "${selectedProduct?.name || tx("this product")}" ${tx("from the catalog? Use this when the product should no longer appear in the storefront.")}`}
                            confirmLabel={tx("Hide product")}
                            isConfirming={isDeleting}
                            onCancel={() => setShowDeleteConfirm(false)}
                            onConfirm={handleDelete}
                        />
                    </div>
                </section>

                <section className="admin__card admin__card--secondary admin__card--inventory-log">
                    <div className="admin__card__header">
                        <div>
                            <h3>{tx("Recent inventory activity")}</h3>
                            <span>{inventoryMovements.length} {tx("recent adjustments")}</span>
                        </div>
                    </div>
                    <details className="admin__disclosure admin__card--inventory-log__disclosure">
                        <summary>{tx("View activity")}</summary>
                        <div className="admin__card__body admin__list-shell admin__card--inventory-log__body">
                        {inventoryMovementsError && !movementsLoaded ? <AdminStatusPanel variant="error" title={tx("Inventory movements unavailable")} description={inventoryMovementsError.message} onRetry={loadMovements} /> : null}
                        {!inventoryMovementsError && !movementsLoaded ? <AdminStatusPanel variant="loading" title={tx("Loading inventory movements")} description={tx("Fetching recent stock adjustments.")} /> : null}
                        {inventoryMovementsError && movementsLoaded ? <AdminStatusPanel variant="error" title={tx("Inventory movement refresh failed")} description={inventoryMovementsError.message} onRetry={loadMovements} retryLabel={tx("Retry refresh")} /> : null}
                        {(!inventoryMovementsError || movementsLoaded) ? <AdminTableScrollHint label={tx("Inventory movement log")}>
                        <Table responsive={false} hover borderless className="admin__table admin__table--inventory-movements">
                            <thead>
                                <tr>
                                    <th>{tx("Time")}</th>
                                    <th>{tx("Product")}</th>
                                    <th>{tx("Type")}</th>
                                    <th>{tx("Change")}</th>
                                    <th>{tx("Stock")}</th>
                                    <th>{tx("Note")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryMovements.length > 0 ? (
                                    inventoryMovements.map((movement) => (
                                        <tr key={movement.id}>
                                            <td width="180px">{new Date(movement.created_at).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB")}</td>
                                            <td width="260px">
                                                <div className="admin__table__stack">
                                                    <strong>{movement.product_name || `Product #${movement.product_id}`}</strong>
                                                    {movement.order_id ? <span>{tx("Order")} #{movement.order_id}</span> : null}
                                                </div>
                                            </td>
                                            <td width="160px">{tx(movement.movement_type.replace(/_/g, " "))}</td>
                                            <td width="120px">
                                                <span className={movement.quantity_change < 0 ? "admin__pill admin__pill--danger" : "admin__pill admin__pill--success"}>
                                                    {movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change}
                                                </span>
                                            </td>
                                            <td width="140px">
                                                {movement.stock_before ?? "-"} {"->"} {movement.stock_after ?? "-"}
                                            </td>
                                            <td>{movement.note || "-"}</td>
                                        </tr>
                                    ))
                                ) : !inventoryMovementsError && movementsLoaded ? (
                                    <tr>
                                        <td colSpan={6}>{tx("No inventory movements recorded yet.")}</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint> : null}
                        </div>
                    </details>
                </section>

                {inventoryWatch.length > 0 ? <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>{tx("Inventory management")}</h3>
                            <span>{tx("Restock the products that are closest to selling out.")}</span>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        <AdminTableScrollHint label={tx("Inventory restock table")}>
                        <Table responsive={false} hover borderless className="admin__table admin__table--inventory">
                            <thead>
                                <tr>
                                    <th>{tx("Product")}</th>
                                    <th>{tx("Category")}</th>
                                    <th>{tx("Current stock")}</th>
                                    <th>{tx("New stock")}</th>
                                    <th>{tx("Reason")}</th>
                                    <th>{tx("Action")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryWatch.map((product) => (
                                        <tr key={`inventory-${product.id}`}>
                                            <td width="320px">
                                                <div className="admin__table__stack">
                                                    <strong>{product.name}</strong>
                                                    <span>{product.brand}</span>
                                                </div>
                                            </td>
                                            <td width="180px">{product.category}</td>
                                            <td width="160px">
                                                <span
                                                    className={
                                                        product.stock <= 0
                                                            ? "admin__pill admin__pill--danger"
                                                            : "admin__pill admin__pill--warning"
                                                    }
                                                >
                                                    {product.stock <= 0 ? tx("Out of stock") : `${product.stock} ${tx("left")}`}
                                                </span>
                                            </td>
                                            <td width="160px">
                                                <input
                                                    className="admin__table__input"
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={restockValues[product.id] ?? ""}
                                                    onChange={(event) =>
                                                        setRestockValues((current) => ({
                                                            ...current,
                                                            [product.id]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder={String(Math.max(product.stock, 0))}
                                                />
                                            </td>
                                            <td width="220px">
                                                <label className="admin__sr-only" htmlFor={`restock-reason-${product.id}`}>{tx("Reason for stock change")}</label>
                                                <input
                                                    id={`restock-reason-${product.id}`}
                                                    className="admin__table__input"
                                                    type="text"
                                                    maxLength={255}
                                                    value={restockReasons[product.id] ?? ""}
                                                    onChange={(event) => setRestockReasons((current) => ({ ...current, [product.id]: event.target.value }))}
                                                    placeholder={tx("Count, delivery, correction…")}
                                                />
                                            </td>
                                            <td width="160px">
                                                <button
                                                    type="button"
                                                    className="admin__button admin__button--primary"
                                                    onClick={() => handleQuickRestock(product)}
                                                >
                                                    {tx("Update stock")}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint>
                    </div>
                </section> : null}


            </main>
        </AdminLayout>
    );
};

export default AdminProductPage;
