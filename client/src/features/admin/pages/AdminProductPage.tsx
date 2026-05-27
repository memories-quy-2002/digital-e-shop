import React, { useEffect, useMemo, useState } from "react";
import { Button, Form, Modal, Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import { useNavigate } from "react-router-dom";
import axios from "../../../api/axios";
import { Product } from "../../../utils/interface";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminProductItem from "../../../components/common/admin/AdminProductItem";
import { Helmet } from "react-helmet";
import { useToast } from "../../../context/ToastContext";
import {
    highlightsFromText,
    highlightsToText,
    parseProductDetails,
    rowsFromText,
    rowsToText,
    serializeProductDetails,
} from "../../../utils/productDetails";

const ITEMS_PER_PAGE = 8;

type ProductEditForm = {
    name: string;
    description: string;
    category: string;
    brand: string;
    price: string;
    salePrice: string;
    stock: string;
    model: string;
    warranty: string;
    datasheet: string;
    highlights: string;
    specifications: string;
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

const normalizeProduct = (product: Product): Product => ({
    ...product,
    price: Number(product.price) || 0,
    sale_price: product.sale_price === null ? null : Number(product.sale_price) || null,
    stock: Number(product.stock) || 0,
});

const AdminProductPage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [show, setShow] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [editForm, setEditForm] = useState<ProductEditForm>({
        name: "",
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
    });
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [restockValues, setRestockValues] = useState<Record<number, string>>({});
    const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
    const { addToast } = useToast();

    const fetchInventoryMovements = async () => {
        try {
            const response = await axios.get("/api/products/admin/inventory-movements?limit=12");
            setInventoryMovements(response.data.movements || []);
        } catch {
            setInventoryMovements([]);
        }
    };

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts((response.data.products || []).map(normalizeProduct).sort((a: Product, b: Product) => a.id - b.id));
                }
            } catch {
                addToast("Products", "Unable to load products.");
            }
        };

        fetchProducts();
        fetchInventoryMovements();
    }, [addToast]);

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
        const details = parseProductDetails(product.specifications);
        setSelectedProduct(product);
        setEditForm({
            name: product.name,
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
        });
        setShow(true);
    };

    const handleClose = () => {
        setShow(false);
        setSelectedProduct(null);
    };

    const handleEditChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setEditForm((currentForm) => ({ ...currentForm, [name]: value }));
    };

    const handleSave = async () => {
        if (!selectedProduct) {
            return;
        }

        const price = Number(editForm.price);
        const salePrice = editForm.salePrice.trim() === "" ? null : Number(editForm.salePrice);
        const stock = Number(editForm.stock);

        if (
            !editForm.name.trim() ||
            !editForm.category.trim() ||
            !editForm.brand.trim() ||
            Number.isNaN(price) ||
            Number.isNaN(stock) ||
            price < 0 ||
            stock < 0
        ) {
            addToast("Update product", "Name, category, brand, price, and quantity must be valid.");
            return;
        }

        if (salePrice !== null && (Number.isNaN(salePrice) || salePrice < 0)) {
            addToast("Update product", "Sale price must be empty or a valid number.");
            return;
        }

        try {
            setIsSaving(true);
            const response = await axios.put(`/api/products/${selectedProduct.id}`, {
                name: editForm.name.trim(),
                description: editForm.description.trim(),
                category: editForm.category.trim(),
                brand: editForm.brand.trim(),
                price,
                salePrice,
                stock,
                specifications: serializeProductDetails({
                    model: editForm.model,
                    warranty: editForm.warranty,
                    datasheet: editForm.datasheet,
                    highlights: highlightsFromText(editForm.highlights),
                    specifications: rowsFromText(editForm.specifications),
                }),
            });

            if (response.status === 200) {
                const updatedProduct = normalizeProduct(response.data.product);
                setProducts((currentProducts) =>
                    currentProducts.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
                );
                fetchInventoryMovements();
                addToast("Update product", `${updatedProduct.name} has been updated.`);
                handleClose();
            }
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
            const response = await axios.delete("/api/products/", {
                data: { pid: selectedProduct.id },
            });
            if (response.status === 200) {
                setProducts((currentProducts) => currentProducts.filter((product) => product.id !== selectedProduct.id));
                addToast("Delete product", `${selectedProduct.name} has been removed from the catalog.`);
                handleClose();
            }
        } catch {
            addToast("Delete product", "Unable to delete product.");
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
            const response = await axios.put(`/api/products/${product.id}/inventory`, { stock });
            if (response.status === 200) {
                const updatedProduct = normalizeProduct(response.data.product);
                setProducts((currentProducts) =>
                    currentProducts.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)),
                );
                setRestockValues((current) => ({ ...current, [product.id]: "" }));
                fetchInventoryMovements();
                addToast("Inventory", `${updatedProduct.name} stock updated.`);
            }
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
                        <h2 className="admin__page__title">Products</h2>
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

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Inventory movement log</h3>
                            <span>Recent stock adjustments from sales, product creation, and admin updates.</span>
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
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
                                ) : (
                                    <tr>
                                        <td colSpan={6}>No inventory movements recorded yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Inventory management</h3>
                            <span>Restock the products that are closest to selling out.</span>
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
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
                                {inventoryWatch.length > 0 ? (
                                    inventoryWatch.map((product) => (
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
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5}>Inventory is healthy. No low-stock products right now.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Product list</h3>
                            <span>{filteredProducts.length} results</span>
                        </div>
                        <div className="admin__filters">
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search all products by name, category, brand, or ID"
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
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Picture</th>
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
                        <div className="admin__table__pagination">
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                pageClassName="pagination__item"
                                pageLinkClassName="pagination__link"
                                previousClassName="pagination__item"
                                nextClassName="pagination__item"
                                breakClassName="pagination__item"
                                activeClassName="selected"
                                disabledClassName="disabled"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                forcePage={Math.max(currentPage - 1, 0)}
                                renderOnZeroPageCount={null}
                            />
                        </div>
                        <Modal show={show} onHide={handleClose} animation={false} centered size="lg">
                            <Modal.Header closeButton>
                                <Modal.Title>Manage product</Modal.Title>
                            </Modal.Header>
                            <Modal.Body>
                                <Form className="admin__edit-form">
                                    <Form.Group className="mb-3" controlId="productName">
                                        <Form.Label>Name</Form.Label>
                                        <Form.Control name="name" value={editForm.name} onChange={handleEditChange} />
                                    </Form.Group>
                                    <Form.Group className="mb-3" controlId="productDescription">
                                        <Form.Label>Description</Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={3}
                                            name="description"
                                            value={editForm.description}
                                            onChange={handleEditChange}
                                        />
                                    </Form.Group>
                                    <div className="admin__edit-form__grid">
                                        <Form.Group className="mb-3" controlId="productCategory">
                                            <Form.Label>Category</Form.Label>
                                            <Form.Control
                                                name="category"
                                                value={editForm.category}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productBrand">
                                            <Form.Label>Brand</Form.Label>
                                            <Form.Control
                                                name="brand"
                                                value={editForm.brand}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productPrice">
                                            <Form.Label>Price</Form.Label>
                                            <Form.Control
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                name="price"
                                                value={editForm.price}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productSalePrice">
                                            <Form.Label>Sale price</Form.Label>
                                            <Form.Control
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                name="salePrice"
                                                placeholder="None"
                                                value={editForm.salePrice}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productStock">
                                            <Form.Label>Quantity</Form.Label>
                                            <Form.Control
                                                type="number"
                                                min="0"
                                                step="1"
                                                name="stock"
                                                value={editForm.stock}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                    </div>
                                    <div className="admin__edit-form__grid">
                                        <Form.Group className="mb-3" controlId="productModel">
                                            <Form.Label>Model</Form.Label>
                                            <Form.Control name="model" value={editForm.model} onChange={handleEditChange} />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productWarranty">
                                            <Form.Label>Warranty</Form.Label>
                                            <Form.Control
                                                name="warranty"
                                                value={editForm.warranty}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productDatasheet">
                                            <Form.Label>Datasheet URL</Form.Label>
                                            <Form.Control
                                                type="url"
                                                name="datasheet"
                                                value={editForm.datasheet}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                    </div>
                                    <div className="admin__edit-form__grid admin__edit-form__grid--two">
                                        <Form.Group className="mb-3" controlId="productHighlights">
                                            <Form.Label>Customer highlights</Form.Label>
                                            <Form.Control
                                                as="textarea"
                                                rows={4}
                                                name="highlights"
                                                value={editForm.highlights}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3" controlId="productSpecifications">
                                            <Form.Label>Specifications</Form.Label>
                                            <Form.Control
                                                as="textarea"
                                                rows={4}
                                                name="specifications"
                                                value={editForm.specifications}
                                                onChange={handleEditChange}
                                            />
                                        </Form.Group>
                                    </div>
                                </Form>
                            </Modal.Body>
                            <Modal.Footer className="admin__modal-actions">
                                <Button variant="outline-danger" onClick={handleDelete} disabled={isDeleting || isSaving}>
                                    {isDeleting ? "Deleting..." : "Delete product"}
                                </Button>
                                <div>
                                    <Button variant="secondary" onClick={handleClose} disabled={isDeleting || isSaving}>
                                        Cancel
                                    </Button>
                                    <Button variant="primary" onClick={handleSave} disabled={isDeleting || isSaving}>
                                        {isSaving ? "Saving..." : "Save changes"}
                                    </Button>
                                </div>
                            </Modal.Footer>
                        </Modal>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminProductPage;

