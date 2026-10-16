import React, { useState } from "react";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../../components/layout/AdminLayout";
import { useToast } from "../../../context/ToastContext";
import { highlightsFromText, rowsFromText, serializeProductDetails } from "../../../utils/productDetails";
import { uploadBlob, addProduct } from "../api";
import {
    createProductAttributeRow,
    productAttributeRowsToInputs,
    type ProductAttributeRow,
} from "../../products/api";
import { validateAddProduct, type AddProductField, type AddProductValidationErrors } from "../utils/validateAddProduct";
import ProductForm, {
    type ProductFormField,
    type ProductFormValues,
} from "../components/ProductForm";

type ProductData = Omit<ProductFormValues, "inventory"> & {
    image: File | null;
    imageUrl: string;
    inventory: string;
};

const AdminAddProductPage = () => {
    const navigate = useNavigate();
    const [productData, setProductData] = useState<ProductData>({
        name: "",
        sku: "",
        manufacturerPartNumber: "",
        warrantyMonths: "",
        description: "",
        image: null,
        imageUrl: "",
        category: "",
        brand: "",
        specifications: "",
        model: "",
        warranty: "",
        datasheet: "",
        highlights: "",
        price: "0",
        inventory: "0",
        attributes: [],
    });
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<AddProductValidationErrors>({});
    const [attributeError, setAttributeError] = useState<string | undefined>();
    const [uploading, setUploading] = useState(false);
    const { addToast } = useToast();

    const handleFieldChange = (field: ProductFormField, value: string) => {
        setProductData((prevData) => ({ ...prevData, [field]: value }));
        if (field in validationErrors) {
            setValidationErrors((current) => {
                const next = { ...current };
                delete next[field as AddProductField];
                return next;
            });
        }
        if (error) setError(null);
    };

    const handleUploadToBlob = async () => {
        if (!productData.image) {
            addToast("Upload image", "Please choose an image first.");
            return;
        }
        setUploading(true);
        try {
            const url = await uploadBlob(productData.image);
            setProductData((prevData) => ({ ...prevData, imageUrl: url }));
            addToast("Upload image", "Image uploaded to Blob successfully.");
        } catch {
            addToast("Upload image", "Unable to upload image.");
        } finally {
            setUploading(false);
        }
    };

    const updateAttribute = (id: string, patch: Partial<ProductAttributeRow>) => {
        setProductData((current) => ({
            ...current,
            attributes: current.attributes.map((row) => row.id === id ? { ...row, ...patch } : row),
        }));
        if (attributeError) setAttributeError(undefined);
    };

    const addAttribute = () => {
        setProductData((current) => ({ ...current, attributes: [...current.attributes, createProductAttributeRow()] }));
        if (attributeError) setAttributeError(undefined);
    };
    const removeAttribute = (id: string) => {
        setProductData((current) => ({ ...current, attributes: current.attributes.filter((row) => row.id !== id) }));
        if (attributeError) setAttributeError(undefined);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextValidationErrors = validateAddProduct({
            name: productData.name,
            category: productData.category,
            brand: productData.brand,
            price: productData.price,
            inventory: productData.inventory,
        });
        const firstInvalidField = (Object.keys(nextValidationErrors) as AddProductField[])[0];

        if (firstInvalidField) {
            setValidationErrors(nextValidationErrors);
            setError(nextValidationErrors[firstInvalidField] || "Please fix the highlighted fields.");
            const fieldIds: Record<AddProductField, string> = {
                name: "form-name",
                category: "form-category",
                brand: "form-brand",
                price: "form-price",
                inventory: "form-inventory",
            };
            document.getElementById(fieldIds[firstInvalidField])?.focus();
            return;
        }

        setValidationErrors({});
        setAttributeError(undefined);
        let attributes: ReturnType<typeof productAttributeRowsToInputs>;

        try {
            attributes = productAttributeRowsToInputs(productData.attributes);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Product attributes are invalid.";
            setAttributeError(message);
            setError(message);
            addToast("Adding product", "Unable to add product.");
            return;
        }

        try {
            const formData = new FormData();
            formData.append("name", productData.name.trim());
            formData.append("description", productData.description.trim());
            formData.append("category", productData.category.trim());
            formData.append("brand", productData.brand.trim());
            formData.append("price", String(productData.price));
            formData.append("inventory", String(productData.inventory));

            if (productData.sku.trim()) formData.append("sku", productData.sku.trim());
            if (productData.manufacturerPartNumber.trim()) {
                formData.append("manufacturerPartNumber", productData.manufacturerPartNumber.trim());
            }
            if (productData.warrantyMonths.trim()) {
                formData.append("warrantyMonths", productData.warrantyMonths.trim());
            }
            if (productData.imageUrl) {
                formData.append("imageUrl", productData.imageUrl);
            } else if (productData.image) {
                formData.append("image", productData.image);
            }
            formData.append(
                "specifications",
                serializeProductDetails({
                    model: productData.model,
                    warranty: productData.warranty,
                    datasheet: productData.datasheet,
                    highlights: highlightsFromText(productData.highlights),
                    specifications: rowsFromText(productData.specifications),
                }),
            );
            formData.append("attributes", JSON.stringify(attributes));
            await addProduct(formData);
            setError(null);
            addToast("Adding product", "Product has been added successfully");
            navigate("/admin/products");
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            setError(message);
            addToast("Adding product", "Unable to add product.");
        }
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>Add Product | Digital-E</title>
                <meta name="description" content="Admin page to add new products." />
            </Helmet>
            <main className="admin__page admin__page--add-product">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Catalog</span>
                        <h1 className="admin__page__title">Add new product</h1>
                        <p className="admin__page__subtitle">
                            Provide product details, pricing, and inventory. Fields marked with * are required.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button
                            type="button"
                            className="admin__button admin__button--ghost"
                            onClick={() => navigate("/admin/products")}
                        >
                            Back to list
                        </button>
                    </div>
                </header>

                {error && <div className="admin__alert" role="alert">{error}</div>}

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Product details</h3>
                            <span>Upload rich content to boost conversions.</span>
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Form noValidate onSubmit={handleSubmit}>
                            <ProductForm
                                mode="create"
                                idPrefix="form"
                                values={productData}
                                errors={validationErrors}
                                attributeError={attributeError}
                                onChange={handleFieldChange}
                                onAttributeChange={updateAttribute}
                                onAddAttribute={addAttribute}
                                onRemoveAttribute={removeAttribute}
                                image={productData.image}
                                imageUrl={productData.imageUrl}
                                onImageChange={(file) => setProductData((current) => ({ ...current, image: file, imageUrl: "" }))}
                                onUploadImage={handleUploadToBlob}
                                isUploading={uploading}
                            />
                            <div className="admin__form-actions">
                                <button type="submit" className="admin__button admin__button--success">
                                    Save Product
                                </button>
                            </div>
                        </Form>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminAddProductPage;
