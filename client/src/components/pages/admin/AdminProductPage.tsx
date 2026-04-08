import React, { useEffect, useState } from "react";
import { Button, Modal, Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import { useNavigate } from "react-router-dom";
import axios from "../../../api/axios";
import { Product } from "../../../utils/interface";
import AdminLayout from "../../layout/AdminLayout";
import AdminProductItem from "../../common/admin/AdminProductItem";
import { Helmet } from "react-helmet";

const ITEMS_PER_PAGE = 5;

const AdminProductPage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);
    const [show, setShow] = useState<boolean>(false);
    const [pid, setPid] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);

    const currentProducts = filteredProducts;
    const pageCount = Math.ceil((totalProducts || filteredProducts.length) / ITEMS_PER_PAGE);

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
    };

    const handleClear = () => {
        setSearchTerm("");
    };

    const handleOpen = (pid: number) => {
        setShow(true);
        setPid(pid);
    };

    const handleClose = () => {
        setShow(false);
    };

    const handleDelete = async (pid: number) => {
        try {
            const response = await axios.delete("/api/products/", {
                data: { pid },
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePageClick = (event: any) => {
        setCurrentPage(event.selected + 1);
    };

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get(`/api/products?page=${currentPage}&limit=${ITEMS_PER_PAGE}`);
                if (response.status === 200) {
                    setProducts(response.data.products.sort((a: Product, b: Product) => a.id - b.id));
                    setTotalProducts(response.data.pagination?.total ?? response.data.products.length);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchProducts();
    }, [currentPage]);

    useEffect(() => {
        const filtered = products.filter((product) => {
            const lowerSearchTerm = searchTerm.toLowerCase();
            return (
                product.name.toLowerCase().includes(lowerSearchTerm) ||
                product.category.toLowerCase().includes(lowerSearchTerm) ||
                product.brand.toLowerCase().includes(lowerSearchTerm)
            );
        });
        setFilteredProducts(filtered);
    }, [searchTerm, products]);

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
                        <button type="button" className="admin__button admin__button--primary" onClick={() => navigate("/admin/add")}>
                            + Add product
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total products</span>
                        <strong>{totalProducts || products.length}</strong>
                        <p>All listings</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Visible</span>
                        <strong>{filteredProducts.length}</strong>
                        <p>Filtered view</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Search</span>
                        <strong>{searchTerm ? "Active" : "All"}</strong>
                        <p>{searchTerm || "No filter"}</p>
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
                                placeholder="Search products"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                            <button type="button" className="admin__button admin__button--ghost" onClick={handleClear}>
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
                                    <th>Brands</th>
                                    <th>Original Price</th>
                                    <th>Sale Price</th>
                                    <th>Quantity</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentProducts.map((product, index) => (
                                    <AdminProductItem
                                        key={index}
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
                                forcePage={currentPage - 1}
                                renderOnZeroPageCount={null}
                            />
                        </div>
                        <Modal show={show} onHide={handleClose} animation={false}>
                            <Modal.Header closeButton>
                                <Modal.Title>Delete product</Modal.Title>
                            </Modal.Header>
                            <Modal.Body>Are you sure you want to remove this product?</Modal.Body>
                            <Modal.Footer>
                                <Button variant="secondary" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button variant="primary" onClick={() => handleDelete(pid)}>
                                    Confirm
                                </Button>
                            </Modal.Footer>
                        </Modal>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminProductPage;
