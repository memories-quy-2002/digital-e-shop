import React, { useState } from "react";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet";
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

interface ProductData {
    [key: string]: string | number | File | null | ProductAttributeRow[];
    name: string;
    sku: string;
    manufacturerPartNumber: string;
    warrantyMonths: string;
    description: string;
    image: File | null;
    imageUrl: string;
    category: string;
    brand: string;
    specifications: string;
    model: string;
    warranty: string;
    datasheet: string;
    highlights: string;
    price: number;
    inventory: number;
    attributes: ProductAttributeRow[];
}

type ProductAttributeEditorProps = {
    rows: ProductAttributeRow[];
    onChange: (id: string, patch: Partial<ProductAttributeRow>) => void;
    onAdd: () => void;
    onRemove: (id: string) => void;
};

const ProductAttributeEditor = ({ rows, onChange, onAdd, onRemove }: ProductAttributeEditorProps) => (
    <section className="admin__form-section">
        <div className="admin__form-section__header">
            <h4>Structured attributes</h4>
            <p>Use generic typed rows for electronics filters. Legacy specifications remain a display fallback.</p>
        </div>
        <button type="button" className="admin__button admin__button--ghost" onClick={onAdd}>Add attribute</button>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No structured attributes yet.</p> : (
            <div className="grid gap-3 mt-3">
                {rows.map((row, index) => (
                    <div key={row.id} className="grid gap-3 rounded-control border border-border p-3 md:grid-cols-12" data-testid="product-attribute-row">
                        <Form.Group className="md:col-span-2" controlId={`productAttributeKey-${row.id}`}>
                            <Form.Label htmlFor={`productAttributeKey-${row.id}`}>Key</Form.Label>
                            <Form.Control id={`productAttributeKey-${row.id}`} value={row.key} placeholder="vram_gb" autoComplete="off" spellCheck={false} onChange={(event) => onChange(row.id, { key: event.target.value })} />
                        </Form.Group>
                        <Form.Group className="md:col-span-3" controlId={`productAttributeLabel-${row.id}`}>
                            <Form.Label htmlFor={`productAttributeLabel-${row.id}`}>Label</Form.Label>
                            <Form.Control id={`productAttributeLabel-${row.id}`} value={row.label} placeholder="VRAM" onChange={(event) => onChange(row.id, { label: event.target.value })} />
                        </Form.Group>
                        <Form.Group className="md:col-span-2" controlId={`productAttributeType-${row.id}`}>
                            <Form.Label htmlFor={`productAttributeType-${row.id}`}>Type</Form.Label>
                            <Form.Control as="select" id={`productAttributeType-${row.id}`} value={row.type} onChange={(event) => onChange(row.id, { type: event.target.value as ProductAttributeRow["type"] })}>
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                            </Form.Control>
                        </Form.Group>
                        <Form.Group className="md:col-span-2" controlId={`productAttributeValue-${row.id}`}>
                            <Form.Label htmlFor={`productAttributeValue-${row.id}`}>Value</Form.Label>
                            <Form.Control id={`productAttributeValue-${row.id}`} type={row.type === "number" ? "number" : "text"} step={row.type === "number" ? "any" : undefined} value={row.value} placeholder={row.type === "number" ? "12" : "GDDR7"} onChange={(event) => onChange(row.id, { value: event.target.value })} />
                        </Form.Group>
                        <Form.Group className="md:col-span-1" controlId={`productAttributeUnit-${row.id}`}>
                            <Form.Label htmlFor={`productAttributeUnit-${row.id}`}>Unit</Form.Label>
                            <Form.Control id={`productAttributeUnit-${row.id}`} value={row.unit} placeholder="GB" onChange={(event) => onChange(row.id, { unit: event.target.value })} />
                        </Form.Group>
                        <div className="flex items-end gap-3 md:col-span-2">
                            <Form.Check id={`productAttributeFilterable-${row.id}`} type="checkbox" label="Filterable" checked={row.filterable} onChange={(event) => onChange(row.id, { filterable: event.target.checked })} />
                            <button type="button" className="admin__button admin__button--danger" aria-label={`Remove attribute ${index + 1}`} onClick={() => onRemove(row.id)}>Remove</button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </section>
);

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
        price: 0,
        inventory: 0,
        attributes: [],
    });
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const { addToast } = useToast();

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = event.target;
        setProductData((prevData) => ({ ...prevData, [name]: value }));
    };

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files![0];
        setProductData((prevData) => ({ ...prevData, image: file, imageUrl: "" }));
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
    };

    const addAttribute = () => setProductData((current) => ({ ...current, attributes: [...current.attributes, createProductAttributeRow()] }));
    const removeAttribute = (id: string) => setProductData((current) => ({ ...current, attributes: current.attributes.filter((row) => row.id !== id) }));

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            const formData = new FormData();
            Object.keys(productData).forEach((key) => {
                if (["model", "warranty", "datasheet", "highlights", "attributes"].includes(key)) return;
                const value = productData[key];
                if (value !== null) {
                    if (typeof value === "string") {
                        if (key === "imageUrl" && value === "") return;
                        if (["sku", "manufacturerPartNumber", "warrantyMonths"].includes(key) && value.trim() === "") {
                            return;
                        }
                        if (key === "specifications") {
                            formData.append(
                                key,
                                serializeProductDetails({
                                    model: productData.model,
                                    warranty: productData.warranty,
                                    datasheet: productData.datasheet,
                                    highlights: highlightsFromText(productData.highlights),
                                    specifications: rowsFromText(productData.specifications),
                                }),
                            );
                            return;
                        }
                        formData.append(key, value);
                    } else if (value instanceof File) {
                        if (!productData.imageUrl) {
                            formData.append(key, value);
                        }
                    } else if (typeof value === "number") {
                        formData.append(key, value.toString());
                    }
                }
            });
            const attributes = productAttributeRowsToInputs(productData.attributes);
            formData.append("attributes", JSON.stringify(attributes));
            await addProduct(formData);
            setError(null);
            addToast("Adding product", "Product has been added successfully");
            navigate("/admin/products");
        } catch (error) {
            setError(error instanceof Error ? error.message : "An unknown error occurred");
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
                        <h2 className="admin__page__title">Add new product</h2>
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
                            <section className="admin__form-section">
                                <div className="admin__form-section__header">
                                    <h4>Core content</h4>
                                    <p>Name, description, image, and specification copy for the storefront.</p>
                                </div>
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
                                            <div className="admin__form-upload">
                                                <button
                                                    type="button"
                                                    className="admin__button admin__button--ghost"
                                                    onClick={handleUploadToBlob}
                                                    disabled={uploading}
                                                >
                                                    {uploading ? "Uploading..." : "Upload to Blob"}
                                                </button>
                                                {productData.imageUrl ? (
                                                    <span className="admin__form-upload__status">Uploaded</span>
                                                ) : null}
                                            </div>
                                            {productData.imageUrl ? (
                                                <div className="admin__form-upload__preview">
                                                    <img src={productData.imageUrl} alt="Uploaded preview" />
                                                </div>
                                            ) : null}
                                        </Form.Group>

                                        <Form.Group className="mb-3" controlId="formSpecifications">
                                            <Form.Label>Specifications</Form.Label>
                                            <Form.Control
                                                as="textarea"
                                                rows={6}
                                                placeholder={"Processor: Intel Core i7\nMemory: 16GB\nStorage: 1TB SSD"}
                                                name="specifications"
                                                value={productData.specifications}
                                                onChange={handleInputChange}
                                            />
                                        </Form.Group>
                                    </div>
                                </div>
                            </section>

                            <section className="admin__form-section">
                                <div className="admin__form-section__header">
                                    <h4>Product metadata</h4>
                                    <p>Model details, warranty, datasheet, and customer-facing highlights.</p>
                                </div>
                                <div className="admin__form-grid admin__form-grid--compact">
                                    <Form.Group className="mb-3" controlId="formModel">
                                        <Form.Label>Model</Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Enter model number"
                                            name="model"
                                            value={productData.model}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formWarranty">
                                        <Form.Label>Warranty</Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="12 months, 24 months..."
                                            name="warranty"
                                            value={productData.warranty}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formDatasheet">
                                        <Form.Label>Datasheet URL</Form.Label>
                                        <Form.Control
                                            type="url"
                                            placeholder="https://example.com/manual.pdf"
                                            name="datasheet"
                                            value={productData.datasheet}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formHighlights">
                                        <Form.Label>Customer highlights</Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={4}
                                            placeholder={
                                                "Fast charging support\nEnergy efficient design\nQuiet operation"
                                            }
                                            name="highlights"
                                            value={productData.highlights}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </section>

                            <section className="admin__form-section">
                                <div className="admin__form-section__header">
                                    <h4>Catalog and pricing</h4>
                                    <p>Category, brand, unit price, and inventory available for sale.</p>
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

                                    <Form.Group className="mb-3" controlId="formSku">
                                        <Form.Label htmlFor="formSku">SKU</Form.Label>
                                        <Form.Control
                                            id="formSku"
                                            type="text"
                                            placeholder="Example: GPU-EX-001"
                                            name="sku"
                                            value={productData.sku}
                                            onChange={handleInputChange}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formManufacturerPartNumber">
                                        <Form.Label htmlFor="formManufacturerPartNumber">
                                            Manufacturer part number
                                        </Form.Label>
                                        <Form.Control
                                            id="formManufacturerPartNumber"
                                            type="text"
                                            placeholder="Optional manufacturer reference…"
                                            name="manufacturerPartNumber"
                                            value={productData.manufacturerPartNumber}
                                            onChange={handleInputChange}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </Form.Group>

                                    <Form.Group className="mb-3" controlId="formWarrantyMonths">
                                        <Form.Label htmlFor="formWarrantyMonths">Warranty (months)</Form.Label>
                                        <Form.Control
                                            id="formWarrantyMonths"
                                            type="number"
                                            min="0"
                                            step="1"
                                            inputMode="numeric"
                                            placeholder="Optional, e.g. 24"
                                            name="warrantyMonths"
                                            value={productData.warrantyMonths}
                                            onChange={handleInputChange}
                                            autoComplete="off"
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
                            </section>

                            <ProductAttributeEditor
                                rows={productData.attributes}
                                onChange={updateAttribute}
                                onAdd={addAttribute}
                                onRemove={removeAttribute}
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
