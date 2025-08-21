import { Button, Form } from "react-bootstrap";
import AdminLayout from "../../layout/AdminLayout";
import React, { useState } from "react";
import axios from "../../../api/axios";
import { useToast } from "../../../context/ToastContext";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";

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
            <Helmet>
                <title>Add Product</title>
                <meta name="description" content="Admin page to add new products." />
            </Helmet>
            <main className="admin__product">
                <div className="admin__product__header">
                    <h2 className="admin__product__header__title">➕ Add New Product</h2>
                    <p className="admin__product__header__subtitle">
                        Fill in the product details below. Fields marked with <span>*</span> are required.
                    </p>
                </div>

                {error && <div className="admin__product__error">{error}</div>}

                <div className="admin__product__form">
                    <Form onSubmit={handleSubmit}>
                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formProductName">
                                    <Form.Label>
                                        Product Name <span className="required">*</span>
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
                                        Description <span className="required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        name="description"
                                        placeholder="Write a short description..."
                                        value={productData.description}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>

                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formImage">
                                    <Form.Label>
                                        Product Image <span className="required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="file"
                                        accept="image/*"
                                        name="image"
                                        onChange={handleImageChange}
                                    />
                                    <Form.Text className="text-muted">Upload a high-quality image (JPG, PNG)</Form.Text>
                                </Form.Group>

                                <Form.Group className="mb-3" controlId="formSpecifications">
                                    <Form.Label>Specifications</Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        placeholder="Enter specifications (optional)"
                                        name="specifications"
                                        value={productData.specifications}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                        </div>

                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formCategory">
                                    <Form.Label>
                                        Category <span className="required">*</span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter category"
                                        name="category"
                                        value={productData.category}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formBrand">
                                    <Form.Label>
                                        Brand <span className="required">*</span>
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
                        </div>

                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3" controlId="formPrice">
                                    <Form.Label>Price ($)</Form.Label>
                                    <Form.Control
                                        type="number"
                                        placeholder="Enter price"
                                        name="price"
                                        value={productData.price}
                                        onChange={handleInputChange}
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
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
                            </div>
                        </div>

                        <div className="admin__product__form__submit">
                            <Button variant="success" size="lg" type="submit">
                                ✅ Save Product
                            </Button>
                        </div>
                    </Form>
                </div>
            </main>
            <div className="admin__product__footer">
                <p>
                    After saving, you can view and manage your products in the{" "}
                    <a href="/admin/products">Product Management</a> section.
                </p>
            </div>
        </AdminLayout>
    );
};

export default AdminAddProductPage;
