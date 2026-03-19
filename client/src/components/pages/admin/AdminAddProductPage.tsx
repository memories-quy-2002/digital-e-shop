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
                    } else if (typeof value === "number") {
                        formData.append(key, value.toString());
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
            <main className="admin__page admin__page--add-product">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Catalog</span>
                        <h2 className="admin__page__title">Add new product</h2>
                        <p className="admin__page__subtitle">
                            Provide product details, pricing, and inventory. Fields marked with * are required.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={() => navigate("/admin/products")}>
                            Back to list
                        </button>
                    </div>
                </header>

                {error && <div className="admin__alert">{error}</div>}

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Product details</h3>
                            <span>Upload rich content to boost conversions.</span>
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Form onSubmit={handleSubmit}>
                            <div className="admin__form-grid">
                                <div>
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
                                            rows={6}
                                            name="description"
                                            placeholder="Write a short description..."
                                            value={productData.description}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>

                                <div>
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
                                        <Form.Text className="text-muted">
                                            Upload a high-quality image (JPG, PNG)
                                        </Form.Text>
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formSpecifications">
                                        <Form.Label>Specifications</Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={6}
                                            placeholder="Enter specifications (optional)"
                                            name="specifications"
                                            value={productData.specifications}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <div className="admin__form-grid admin__form-grid--compact">
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

                            <div className="admin__form-actions">
                                <Button variant="success" size="lg" type="submit">
                                    Save Product
                                </Button>
                            </div>
                        </Form>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminAddProductPage;
