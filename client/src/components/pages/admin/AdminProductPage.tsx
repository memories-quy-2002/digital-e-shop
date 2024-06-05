import { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import { FaBox, FaRegEdit, FaRegTrashAlt } from "react-icons/fa";
import { IoPricetagOutline } from "react-icons/io5";
import { MdCategory } from "react-icons/md";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import { Product } from "../../../utils/interface";
import AdminLayout from "../../layout/AdminLayout";
import { useNavigate } from "react-router-dom";

const AdminProductPage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const itemsPerPage = 5;
    const endOffset = itemOffset + itemsPerPage;
    console.log(`Loading products from ${itemOffset} to ${endOffset}`);
    const currentProducts = products.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(products.length / itemsPerPage);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * itemsPerPage) % products.length;
        console.log(
            `User requested page number ${event.selected}, which is offset ${newOffset}`
        );
        setItemOffset(newOffset);
    };
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);

                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchProducts();
        return () => {};
    }, []);
    const handleDelete = async (id: number) => {
        try {
            const response = await axios.post("/api/products/delete/", {
                pid: id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    };
    const uniqueBrands = new Set(products.map((product) => product.brand));
    const uniqueCategories = new Set(
        products.map((product) => product.category)
    );
    return (
        <AdminLayout>
            <div className="admin__product">
                <div className="admin__product__title">
                    <h3>PRODUCTS DASHBOARD</h3>
                </div>
                <div className="admin__product__overview">
                    <h4>Overview</h4>
                    <div className="admin__product__overview__stat">
                        <div className="admin__product__overview__stat__card">
                            <div className="admin__product__overview__stat__card__icon">
                                <i>
                                    <FaBox size={115} />
                                </i>
                            </div>
                            <div>
                                <p>Number of products</p>
                                <h3>{products.length}</h3>
                            </div>
                        </div>
                        <div className="admin__product__overview__stat__card">
                            <div className="admin__product__overview__stat__card__icon">
                                <i>
                                    <IoPricetagOutline size={115} />
                                </i>
                            </div>
                            <div>
                                <p>Number of brands</p>
                                <h3>{uniqueBrands.size}</h3>
                            </div>
                        </div>
                        <div className="admin__product__overview__stat__card">
                            <div className="admin__product__overview__stat__card__icon">
                                <i>
                                    <MdCategory size={115} />
                                </i>
                            </div>
                            <div>
                                <p>Number of categories</p>
                                <h3>{uniqueCategories.size}</h3>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="admin__product__list">
                    <div className="admin__product__list__search">
                        <div>
                            <h4>List of products</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search product"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate("/admin/add")}
                        >
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
                                    <th>Sale Price</th>
                                    <th>Original Price</th>
                                    <th>Quantity</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentProducts.map((product, index) => (
                                    <tr>
                                        <td width="50px">
                                            {products.indexOf(product) + 1}
                                        </td>
                                        <td>
                                            <img
                                                src={
                                                    product.main_image
                                                        ? require(`../../../assets/images/${product.main_image}.jpg`)
                                                        : require(`../../../assets/images/product_placeholder.jpg`)
                                                }
                                                alt={product.name}
                                                style={{ height: "100px" }}
                                            />
                                        </td>
                                        <td width="500px">{product.name}</td>
                                        <td width="150px">
                                            {product.category}
                                        </td>
                                        <td width="150px">{product.brand}</td>
                                        <td width="150px">
                                            {product.sale_price || "None"}
                                        </td>
                                        <td width="150px">{product.price}</td>
                                        <td width="150px">{product.stock}</td>
                                        <td>
                                            <div>
                                                <button type="button">
                                                    <FaRegEdit />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDelete(product.id)
                                                    }
                                                >
                                                    <FaRegTrashAlt />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
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
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminProductPage;
