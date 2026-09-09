import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Table } from "../../../components/ui/legacy";
import ReactPaginate from "react-paginate";
import { useNavigate } from "react-router-dom";
import type { Product } from "../../../types/product";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminProductItem from "../../../components/common/admin/AdminProductItem";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import {
    fetchAllProducts,
    updateProduct,
    deleteProduct,
    updateProductInventory,
    fetchInventoryMovements,
} from "../api";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
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

const ITEMS_PER_PAGE = 8;

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
        sale_price: normalized.sale_price === null ? null : Number(normalized.sale_price) || null,
        stock: Number(normalized.stock) || 0,
    };
};

const AdminProductPage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<ProductWithAttributes[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
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
    const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [productsError, setProductsError] = useState<AdminRequestError | null>(null);
    const [movementsLoaded, setMovementsLoaded] = useState(false);
    const [inventoryMovementsError, setInventoryMovementsError] = useState<AdminRequestError | null>(null);
    const productsLoadedRef = useRef(false);
    const movementsLoadedRef = useRef(false);
    const { addToast } = useToast();

    const loadProducts = React.useCallback(async () => {
        try {
            setProductsError(null);
            const products = await fetchAllProducts();
                setProducts(products.map(normalizeProduct).sort((a, b) => a.id - b.id));
            setProductsLoaded(true);
            productsLoadedRef.current = true;
        } catch (error) {
            setProductsError(getAdminRequestError(error));
            if (productsLoadedRef.current) addToast("Products", "Refresh failed. Showing the latest saved products.");
        }
    }, [addToast]);

    const loadMovements = React.useCallback(async () => {
        try {
            setInventoryMovementsError(null);
            const movements = await fetchInventoryMovements(12);
                setInventoryMovements(movements);
            setMovementsLoaded(true);
            movementsLoadedRef.current = true;
        } catch (error) {
            setInventoryMovementsError(getAdminRequestError(error));
            if (movementsLoadedRef.current) addToast("Inventory movements", "Refresh failed. Showing the latest saved movements.");
        }
    }, [addToast]);

    useEffect(() => {
        loadProducts();
        loadMovements();
    }, [loadMovements, loadProducts]);

    const filteredProducts = useMemo(() => {
        const lowerSearchTerm = searchTerm.trim().toLowerCase();

        if (!lowerSearchTerm) {
            return products;
        }

        return products.filter((product) => {
            return (
                product.name.toLowerCase().includes(lowerSearchTerm) ||
                product.category.toLowerCase().includes(lowerSearchTerm) ||
                product.brand.toLowerCase().includes(lowerSearchTerm) ||
                product.id.toString().includes(lowerSearchTerm)
            );
        });
    }, [products, searchTerm]);

    const pageCount = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const currentProducts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
    }, [currentPage, filteredProducts]);

    const inventoryWatch = useMemo(
        () => [...products].filter((product) => product.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 8),
        [products],
    );

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
            addToast("Update product", error instanceof Error ? error.message : "Product attributes are invalid.");
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
            addToast("Update product", `${updatedProduct.name} has been updated.`);
            handleClose();
        } catch {
            addToast("Update product", "Unable to update product.");
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
            addToast("Hide product", `${selectedProduct.name} has been hidden from the catalog.`);
            setShowDeleteConfirm(false);
            handleClose();
        } catch {
            addToast("Hide product", "Unable to hide product.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handlePageClick = (event: { selected: number }) => {
        setCurrentPage(event.selected + 1);
    };

    const handleQuickRestock = async (product: Product) => {
        const stock = Number(restockValues[product.id] ?? product.stock);
        if (!Number.isInteger(stock) || stock < 0) {
            addToast("Inventory", "Stock must be a valid whole number.");
            return;
        }

        try {
            const updated = await updateProductInventory(product.id, stock);
            const updatedProduct = normalizeProduct(updated);
            setProducts((currentProducts) =>
                currentProducts.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)),
            );
            setRestockValues((current) => ({ ...current, [product.id]: "" }));
            await loadMovements();
            addToast("Inventory", `${updatedProduct.name} stock updated.`);
        } catch {
            addToast("Inventory", "Unable to update stock.");
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
                <title>Admin Products | Digital-E</title>
                <meta name="description" content="Manage products in the store." />
            </Helmet>
            <main className="admin__page admin__page--products">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Catalog</span>
                        <h1 className="admin__page__title">Products</h1>
                        <p className="admin__page__subtitle">
                            Track inventory, pricing, and product availability across your store.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={exportProductsCsv}>
                            Export products CSV
                        </button>
                        <button type="button" className="admin__button admin__button--primary" onClick={() => navigate("/admin/add")}>
                            + Add product
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total products</span>
                        <strong>{products.length}</strong>
                        <p>All listings</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Visible</span>
                        <strong>{filteredProducts.length}</strong>
                        <p>Filtered from all products</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Low stock</span>
                        <strong>{products.filter((product) => product.stock <= 5).length}</strong>
                        <p>Need attention</p>
                    </div>
                </section>

                <section className="admin__card admin__card--secondary admin__card--inventory-log">
                    <div className="admin__card__header">
                        <div>
                            <h3>Recent inventory activity</h3>
                            <span>{inventoryMovements.length} recent adjustments</span>
                        </div>
                    </div>
                    <details className="admin__disclosure admin__card--inventory-log__disclosure">
                        <summary>View activity</summary>
                        <div className="admin__card__body admin__list-shell admin__card--inventory-log__body">
                        {inventoryMovementsError && !movementsLoaded ? <AdminStatusPanel variant="error" title="Inventory movements unavailable" description={inventoryMovementsError.message} onRetry={loadMovements} /> : null}
                        {!inventoryMovementsError && !movementsLoaded ? <AdminStatusPanel variant="loading" title="Loading inventory movements" description="Fetching recent stock adjustments." /> : null}
                        {inventoryMovementsError && movementsLoaded ? <AdminStatusPanel variant="error" title="Inventory movement refresh failed" description={inventoryMovementsError.message} onRetry={loadMovements} retryLabel="Retry refresh" /> : null}
                        {(!inventoryMovementsError || movementsLoaded) ? <AdminTableScrollHint label="Inventory movement log">
                        <Table responsive={false} hover borderless className="admin__table admin__table--inventory-movements">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Product</th>
                                    <th>Type</th>
                                    <th>Change</th>
                                    <th>Stock</th>
                                    <th>Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryMovements.length > 0 ? (
                                    inventoryMovements.map((movement) => (
                                        <tr key={movement.id}>
                                            <td width="180px">{new Date(movement.created_at).toLocaleString()}</td>
                                            <td width="260px">
                                                <div className="admin__table__stack">
                                                    <strong>{movement.product_name || `Product #${movement.product_id}`}</strong>
                                                    {movement.order_id ? <span>Order #{movement.order_id}</span> : null}
                                                </div>
                                            </td>
                                            <td width="160px">{movement.movement_type.replace(/_/g, " ")}</td>
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
                                        <td colSpan={6}>No inventory movements recorded yet.</td>
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
                            <h3>Inventory management</h3>
                            <span>Restock the products that are closest to selling out.</span>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        <AdminTableScrollHint label="Inventory restock table">
                        <Table responsive={false} hover borderless className="admin__table admin__table--inventory">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Current stock</th>
                                    <th>New stock</th>
                                    <th>Action</th>
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
                                                    {product.stock <= 0 ? "Out of stock" : `${product.stock} left`}
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
                                            <td width="160px">
                                                <button
                                                    type="button"
                                                    className="admin__button admin__button--primary"
                                                    onClick={() => handleQuickRestock(product)}
                                                >
                                                    Update stock
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint>
                    </div>
                </section> : null}

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Product list</h3>
                            <span>{filteredProducts.length} results</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <label className="admin__sr-only" htmlFor="product">
                                    Search products
                                </label>
                                <input
                                    type="search"
                                    name="product"
                                    id="product"
                                    placeholder="Search all products by name, category, brand, or ID…"
                                    value={searchTerm}
                                    onChange={(event) => {
                                        setSearchTerm(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setCurrentPage(1);
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        {productsError && !productsLoaded ? <AdminStatusPanel variant="error" title={productsError.title} description={productsError.message} onRetry={loadProducts} /> : null}
                        {!productsError && !productsLoaded ? <AdminStatusPanel variant="loading" title="Loading products" description="Fetching the latest catalog." /> : null}
                        {productsError && productsLoaded ? <AdminStatusPanel variant="error" title="Product refresh failed" description={productsError.message} onRetry={loadProducts} retryLabel="Retry refresh" /> : null}
                        {!productsError && productsLoaded && filteredProducts.length === 0 ? <AdminStatusPanel variant="empty" title="No products found" description="No products match the current search." /> : null}
                        {(!productsError || productsLoaded) && productsLoaded && filteredProducts.length > 0 ? <>
                        <AdminTableScrollHint label="Product catalog table">
                        <Table responsive={false} hover borderless className="admin__table admin__table--products">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Category</th>
                                    <th>Brand</th>
                                    <th>Price</th>
                                    <th>Sale</th>
                                    <th>Quantity</th>
                                    <th>Action</th>
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
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
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
                                <Modal.Title>Manage product</Modal.Title>
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
                                    {isDeleting ? "Hiding..." : "Hide product"}
                                </Button>
                                <div>
                                    <Button type="button" variant="secondary" onClick={handleClose} disabled={isDeleting || isSaving}>
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        form="manage-product-form"
                                        variant="primary"
                                        disabled={isDeleting || isSaving}
                                    >
                                        {isSaving ? "Saving..." : "Save changes"}
                                    </Button>
                                </div>
                            </Modal.Footer>
                        </Modal>
                        <ConfirmActionModal
                            show={showDeleteConfirm && selectedProduct !== null}
                            title="Hide product"
                            message={`Hide "${selectedProduct?.name || "this product"}" from the catalog? Use this when the product should no longer appear in the storefront.`}
                            confirmLabel="Hide product"
                            isConfirming={isDeleting}
                            onCancel={() => setShowDeleteConfirm(false)}
                            onConfirm={handleDelete}
                        />
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminProductPage;

