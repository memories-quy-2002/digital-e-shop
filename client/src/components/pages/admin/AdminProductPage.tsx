import { useEffect, useState } from "react";
import { Button, Modal, Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import { useNavigate } from "react-router-dom";
import axios from "../../../api/axios";
import { Product } from "../../../utils/interface";
import AdminLayout from "../../layout/AdminLayout";
import AdminProductItem from "../../common/admin/AdminProductItem";

const ITEMS_PER_PAGE = 5;

const AdminProductPage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);
    const [show, setShow] = useState<boolean>(false);
    const [pid, setPid] = useState<number>(0);
    const endOffset = itemOffset + ITEMS_PER_PAGE;
    const currentProducts = filteredProducts.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

    // Handle search input change
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
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
            const response = await axios.post("/api/products/delete", {
                pid,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Filter products based on the search term
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
        return () => {};
    }, [searchTerm, products]);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * ITEMS_PER_PAGE) % products.length;
        console.log(`User requested page number ${event.selected}, which is offset ${newOffset}`);
        setItemOffset(newOffset);
    };
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products.sort((a: Product, b: Product) => a.id - b.id));
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchProducts();
        return () => {};
    }, []);
    return (
        <AdminLayout>
            <div className="admin__product">
                <div className="admin__product__list">
                    <div className="admin__product__list__search">
                        <div>
                            <h4>List of products</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search product"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>

                        <button type="button" onClick={() => navigate("/admin/add")}>
                            + Add product
                        </button>
                    </div>
                    <div className="admin__product__list__table">
                        <Table responsive striped borderless hover>
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
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                renderOnZeroPageCount={null}
                            />
                        </div>
                        <Modal show={show} onHide={handleClose} animation={false}>
                            <Modal.Header closeButton>
                                <Modal.Title>Purchase Confirmation</Modal.Title>
                            </Modal.Header>
                            <Modal.Body>Are you sure to make purchase?</Modal.Body>
                            <Modal.Footer>
                                <Button variant="secondary" onClick={handleClose}>
                                    Close
                                </Button>
                                <Button variant="primary" onClick={() => handleDelete(pid)}>
                                    Confirm
                                </Button>
                            </Modal.Footer>
                        </Modal>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminProductPage;
