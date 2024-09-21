import { Button, Form } from "react-bootstrap";
import AdminLayout from "../../layout/AdminLayout";
import { useState } from "react";
import axios from "../../../api/axios";
import { useToast } from "../../../context/ToastContext";
import { useNavigate } from "react-router-dom";

interface ProductData {
    [key: string]: string | number | File | null;
    name: string;
    description: string;
    image: File | null;
    category: string;
    brand: string;
    specifications: string;
    price: number;
    inventory: number;
}

const AdminAddProductPage = () => {
    const navigate = useNavigate();
    const [productData, setProductData] = useState<ProductData>({
        name: "",
        description: "",
        image: null,
        category: "",
        brand: "",
        specifications: "",
        price: 0,
        inventory: 0,
    });
    const [error, setError] = useState<string | null>(null);
    const { addToast } = useToast();
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setProductData((prevData) => ({ ...prevData, [name]: value }));
    };

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files![0];
        setProductData((prevData) => ({ ...prevData, image: file }));
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            const formData = new FormData();
            Object.keys(productData).forEach((key) => {
                const value = productData[key];
                if (value !== null) {
                    if (typeof value === "string") {
                        formData.append(key, value);
                    } else if (value instanceof File) {
                        formData.append(key, value);
                    }
                }
            });
            const response = await axios.post("/api/products/add", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
            if (response.status === 200) {
                setError(null);
                console.log(response.data.msg);
                addToast("Adding product", "Product has been added successfully");
                navigate("/admin/products");
            }
            // Handle success response from backend
        } catch (error) {
            setError(error instanceof Error ? error.message : "An unknown error occurred");
        }
    };
    return (
        <AdminLayout>
            <main className="admin__product">
                <div className="admin__product__title">
                    <h3>ADD PRODUCT</h3>
                </div>
                <div>
                    <div className="mb-1">
                        <span className="cart__container__payment__form__required">*</span> Required
                    </div>
                    <div>
                        {error && <p style={{ color: "red" }}>{error}</p>}
                        {/* ... */}
                    </div>

                    <Form onSubmit={handleSubmit}>
                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formProductName">
                                    <Form.Label>
                                        Product name <span className="cart__container__payment__form__required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter product name"
                                        name="name"
                                        value={productData.name}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>

                                <Form.Group className="mb-3" controlId="formDescription">
                                    <Form.Label>
                                        Description <span className="cart__container__payment__form__required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        name="description"
                                        value={productData.description}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formImage">
                                    <Form.Label>
                                        Image <span className="cart__container__payment__form__required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="file"
                                        accept="images/*"
                                        name="image"
                                        onChange={handleImageChange}
                                    />
                                </Form.Group>
                            </div>
                        </div>

                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formCategory">
                                    <Form.Label>
                                        Category <span className="cart__container__payment__form__required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter category"
                                        name="category"
                                        value={productData.category}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                                <Form.Group className="mb-3" controlId="formBrand">
                                    <Form.Label>
                                        Brand <span className="cart__container__payment__form__required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter brand"
                                        name="brand"
                                        value={productData.brand}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formSpecifications">
                                    <Form.Label>Specifications</Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        placeholder="Enter Specifications"
                                        name="specifications"
                                        value={productData.specifications}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                        </div>

                        <Form.Group className="mb-3" controlId="formPrice">
                            <Form.Label>Product Price</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="Enter price"
                                name="price"
                                value={productData.price}
                                onChange={handleInputChange}
                            />
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="formInventory">
                            <Form.Label>Inventory Quantity</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="Enter quantity"
                                name="inventory"
                                value={productData.inventory}
                                onChange={handleInputChange}
                            />
                        </Form.Group>
                        <Button variant="primary" type="submit">
                            Submit
                        </Button>
                    </Form>
                </div>
            </main>
        </AdminLayout>
    );
};

export default AdminAddProductPage;
