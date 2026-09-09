import React from "react";
import { Form } from "../../../components/ui/legacy";
import type { ProductAttributeRow } from "../../products/api";

export type ProductFormMode = "create" | "edit";

export type ProductFormField =
    | "name"
    | "sku"
    | "manufacturerPartNumber"
    | "warrantyMonths"
    | "description"
    | "category"
    | "brand"
    | "price"
    | "salePrice"
    | "inventory"
    | "model"
    | "warranty"
    | "datasheet"
    | "highlights"
    | "specifications";

export type ProductFormValues = {
    name: string;
    sku: string;
    manufacturerPartNumber: string;
    warrantyMonths: string;
    description: string;
    category: string;
    brand: string;
    price: string | number;
    salePrice?: string | number;
    inventory?: string | number;
    stock?: string | number;
    model: string;
    warranty: string;
    datasheet: string;
    highlights: string;
    specifications: string;
    attributes: ProductAttributeRow[];
};

export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

type ProductFormProps = {
    mode: ProductFormMode;
    values: ProductFormValues;
    errors?: ProductFormErrors;
    onChange: (field: ProductFormField, value: string) => void;
    onAttributeChange: (id: string, patch: Partial<ProductAttributeRow>) => void;
    onAddAttribute: () => void;
    onRemoveAttribute: (id: string) => void;
    attributeError?: string;
    idPrefix?: string;
    image?: File | null;
    imageUrl?: string;
    onImageChange?: (file: File | null) => void;
    onUploadImage?: () => void;
    isUploading?: boolean;
    currentStock?: number;
};

type FormFieldShellProps = {
    id: string;
    label: string;
    required?: boolean;
    helper?: string;
    error?: string;
    className?: string;
    control: React.ReactNode;
};

const toInputValue = (value: string | number | undefined): string =>
    value === undefined || value === null ? "" : String(value);

const controlA11yProps = (id: string, helper: string | undefined, error: string | undefined) => {
    const describedBy = [helper ? `${id}-hint` : null, error ? `${id}-error` : null]
        .filter((value): value is string => Boolean(value))
        .join(" ");

    return {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
    };
};

const FormFieldShell = ({ id, label, required = false, helper, error, className, control }: FormFieldShellProps) => (
    <Form.Group
        className={`admin__product-form__field${className ? ` ${className}` : ""}${error ? " admin__product-form__field--invalid" : ""}`}
        controlId={id}
    >
        <Form.Label htmlFor={id}>
            {label} {required ? <span className="required" aria-hidden="true">*</span> : null}
        </Form.Label>
        {control}
        {helper ? <p className="admin__product-form__hint" id={`${id}-hint`}>{helper}</p> : null}
        {error ? <p className="admin__field-error" id={`${id}-error`} aria-live="polite">{error}</p> : null}
    </Form.Group>
);

const ProductForm = ({
    mode,
    values,
    errors = {},
    onChange,
    onAttributeChange,
    onAddAttribute,
    onRemoveAttribute,
    attributeError,
    idPrefix = "product-form",
    image = null,
    imageUrl = "",
    onImageChange,
    onUploadImage,
    isUploading = false,
    currentStock = 0,
}: ProductFormProps) => {
    const id = (field: string) => `${idPrefix}-${field}`;
    const isCreate = mode === "create";
    const requiredIdentity = isCreate ? false : true;

    return (
        <div className="admin__product-form">
            <fieldset className="admin__product-form__fieldset">
                <legend className="admin__product-form__legend">Product identity</legend>
                <p className="admin__product-form__description">
                    Keep catalog identity consistent so staff can find and update the right product quickly.
                </p>
                <div className="admin__product-form__grid">
                    <FormFieldShell
                        id={id("name")}
                        label="Product Name"
                        required
                        className="admin__product-form__field--wide"
                        error={errors.name}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("name"), undefined, errors.name)}
                                type="text"
                                name="name"
                                value={toInputValue(values.name)}
                                placeholder="e.g. RTX 4070 SUPER…"
                                autoComplete="off"
                                maxLength={255}
                                required
                                onChange={(event) => onChange("name", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("sku")}
                        label="SKU"
                        required={requiredIdentity}
                        helper={isCreate ? "Optional; use a unique stock keeping unit when available." : "Required and unique within the catalog."}
                        error={errors.sku}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("sku"), isCreate ? "Optional; use a unique stock keeping unit when available." : "Required and unique within the catalog.", errors.sku)}
                                type="text"
                                name="sku"
                                value={toInputValue(values.sku)}
                                placeholder="GPU-EX-001…"
                                autoComplete="off"
                                maxLength={64}
                                spellCheck={false}
                                required={requiredIdentity}
                                onChange={(event) => onChange("sku", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("category")}
                        label="Category"
                        required
                        helper="Use an existing category name or enter a new one."
                        error={errors.category}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("category"), "Use an existing category name or enter a new one.", errors.category)}
                                type="text"
                                name="category"
                                value={toInputValue(values.category)}
                                placeholder="e.g. Graphics cards…"
                                autoComplete="off"
                                required
                                onChange={(event) => onChange("category", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("manufacturer-part-number")}
                        label="Manufacturer part number"
                        helper="Optional manufacturer reference."
                        error={errors.manufacturerPartNumber}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("manufacturer-part-number"), "Optional manufacturer reference.", errors.manufacturerPartNumber)}
                                type="text"
                                name="manufacturerPartNumber"
                                value={toInputValue(values.manufacturerPartNumber)}
                                placeholder="Manufacturer reference…"
                                autoComplete="off"
                                maxLength={128}
                                spellCheck={false}
                                onChange={(event) => onChange("manufacturerPartNumber", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("brand")}
                        label="Brand"
                        required
                        helper="Use the catalog brand name consistently."
                        error={errors.brand}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("brand"), "Use the catalog brand name consistently.", errors.brand)}
                                type="text"
                                name="brand"
                                value={toInputValue(values.brand)}
                                placeholder="e.g. ASUS…"
                                autoComplete="off"
                                required
                                onChange={(event) => onChange("brand", event.target.value)}
                            />
                        )}
                    />
                </div>
            </fieldset>

            <fieldset className="admin__product-form__fieldset">
                <legend className="admin__product-form__legend">{isCreate ? "Pricing and inventory" : "Pricing"}</legend>
                <p className="admin__product-form__description">
                    {isCreate ? "Set the initial selling price and available quantity." : "Set the customer-facing base and promotional price."}
                </p>
                <div className="admin__product-form__grid admin__product-form__grid--compact">
                    <FormFieldShell
                        id={id("price")}
                        label="Price ($)"
                        required
                        helper="Use the regular catalog price before promotions."
                        error={errors.price}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("price"), "Use the regular catalog price before promotions.", errors.price)}
                                type="number"
                                name="price"
                                value={toInputValue(values.price)}
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0.00…"
                                required
                                onChange={(event) => onChange("price", event.target.value)}
                            />
                        )}
                    />
                    {isCreate ? (
                        <FormFieldShell
                            id={id("inventory")}
                            label="Inventory Quantity"
                            required
                            helper="The opening quantity available for sale."
                            error={errors.inventory}
                            control={(
                                <Form.Control
                                    {...controlA11yProps(id("inventory"), "The opening quantity available for sale.", errors.inventory)}
                                    type="number"
                                    name="inventory"
                                    value={toInputValue(values.inventory)}
                                    min="0"
                                    step="1"
                                    inputMode="numeric"
                                    placeholder="0…"
                                    required
                                    onChange={(event) => onChange("inventory", event.target.value)}
                                />
                            )}
                        />
                    ) : (
                        <FormFieldShell
                            id={id("sale-price")}
                            label="Sale price ($)"
                            helper="Optional; leave empty when no promotion is active."
                            error={errors.salePrice}
                            control={(
                                <Form.Control
                                    {...controlA11yProps(id("sale-price"), "Optional; leave empty when no promotion is active.", errors.salePrice)}
                                    type="number"
                                    name="salePrice"
                                    value={toInputValue(values.salePrice)}
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="Leave empty…"
                                    onChange={(event) => onChange("salePrice", event.target.value)}
                                />
                            )}
                        />
                    )}
                    <FormFieldShell
                        id={id("warranty-months")}
                        label="Warranty period (months)"
                        helper="Optional canonical warranty duration used by the catalog."
                        error={errors.warrantyMonths}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("warranty-months"), "Optional canonical warranty duration used by the catalog.", errors.warrantyMonths)}
                                type="number"
                                name="warrantyMonths"
                                value={toInputValue(values.warrantyMonths)}
                                min="0"
                                step="1"
                                inputMode="numeric"
                                placeholder="e.g. 24…"
                                autoComplete="off"
                                onChange={(event) => onChange("warrantyMonths", event.target.value)}
                            />
                        )}
                    />
                </div>
            </fieldset>

            {!isCreate ? (
                <fieldset className="admin__product-form__fieldset admin__product-form__fieldset--read-only">
                    <legend className="admin__product-form__legend">Inventory</legend>
                    <p className="admin__product-form__description">
                        Inventory changes are tracked separately so every adjustment has an auditable movement record.
                    </p>
                    <div className="admin__product-form__read-only-value">
                        <span className="admin__product-form__read-only-label">Current stock</span>
                        <output id={id("current-stock")} className="admin__product-form__stock-value" aria-label="Current stock">
                            {currentStock}
                        </output>
                        <span className="admin__product-form__hint">Use the inventory adjustment control below the product list to change stock.</span>
                    </div>
                </fieldset>
            ) : null}

            <fieldset className="admin__product-form__fieldset">
                <legend className="admin__product-form__legend">Storefront content</legend>
                <p className="admin__product-form__description">
                    Write customer-facing copy and keep technical details in the structured format the storefront expects.
                </p>
                <div className="admin__product-form__grid">
                    <FormFieldShell
                        id={id("description")}
                        label="Description"
                        helper="A concise overview shown near the product title."
                        error={errors.description}
                        className="admin__product-form__field--wide"
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("description"), "A concise overview shown near the product title.", errors.description)}
                                as="textarea"
                                rows={5}
                                name="description"
                                value={toInputValue(values.description)}
                                placeholder="Describe the product in one or two clear paragraphs…"
                                maxLength={255}
                                onChange={(event) => onChange("description", event.target.value)}
                            />
                        )}
                    />
                    {isCreate ? (
                        <FormFieldShell
                            id={id("image")}
                            label="Product Image"
                            helper="Choose a clear JPG, PNG, or WebP image, then upload it before saving."
                            className="admin__product-form__field--wide"
                            control={(
                                <>
                                    <Form.Control
                                        {...controlA11yProps(id("image"), "Choose a clear JPG, PNG, or WebP image, then upload it before saving.", undefined)}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        name="image"
                                        onChange={(event) => onImageChange?.(event.target.files?.[0] ?? null)}
                                    />
                                    <div className="admin__form-upload">
                                        <button
                                            type="button"
                                            className="admin__button admin__button--ghost"
                                            onClick={onUploadImage}
                                            disabled={!onUploadImage || isUploading || !image}
                                        >
                                            {isUploading ? "Uploading…" : "Upload image"}
                                        </button>
                                        {imageUrl ? <span className="admin__form-upload__status" aria-live="polite">Uploaded</span> : null}
                                    </div>
                                    {imageUrl ? (
                                        <div className="admin__form-upload__preview">
                                            <img src={imageUrl} alt="Uploaded product preview" width={160} height={160} />
                                        </div>
                                    ) : null}
                                </>
                            )}
                        />
                    ) : null}
                    <FormFieldShell
                        id={id("model")}
                        label="Model"
                        helper="Optional model or series name."
                        error={errors.model}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("model"), "Optional model or series name.", errors.model)}
                                type="text"
                                name="model"
                                value={toInputValue(values.model)}
                                placeholder="e.g. ROG Strix…"
                                onChange={(event) => onChange("model", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("warranty")}
                        label="Warranty terms"
                        helper="Optional storefront copy; the numeric warranty period stays above."
                        error={errors.warranty}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("warranty"), "Optional storefront copy; the numeric warranty period stays above.", errors.warranty)}
                                type="text"
                                name="warranty"
                                value={toInputValue(values.warranty)}
                                placeholder="e.g. Local warranty coverage…"
                                onChange={(event) => onChange("warranty", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("datasheet")}
                        label="Datasheet URL"
                        helper="Optional public link to a technical datasheet or manual."
                        error={errors.datasheet}
                        className="admin__product-form__field--wide"
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("datasheet"), "Optional public link to a technical datasheet or manual.", errors.datasheet)}
                                type="url"
                                name="datasheet"
                                value={toInputValue(values.datasheet)}
                                placeholder="https://…"
                                inputMode="url"
                                onChange={(event) => onChange("datasheet", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("highlights")}
                        label="Customer highlights"
                        helper="One benefit per line; these become storefront bullets."
                        error={errors.highlights}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("highlights"), "One benefit per line; these become storefront bullets.", errors.highlights)}
                                as="textarea"
                                rows={4}
                                name="highlights"
                                value={toInputValue(values.highlights)}
                                placeholder={"Fast charging support\nEnergy efficient design\nQuiet operation\n…"}
                                onChange={(event) => onChange("highlights", event.target.value)}
                            />
                        )}
                    />
                    <FormFieldShell
                        id={id("specifications")}
                        label="Product specifications"
                        helper="One specification per line using Label: Value, for example Processor: Intel Core i7."
                        error={errors.specifications}
                        control={(
                            <Form.Control
                                {...controlA11yProps(id("specifications"), "One specification per line using Label: Value, for example Processor: Intel Core i7.", errors.specifications)}
                                as="textarea"
                                rows={6}
                                name="specifications"
                                value={toInputValue(values.specifications)}
                                placeholder={"Processor: Intel Core i7\nMemory: 16GB\nStorage: 1TB SSD\n…"}
                                onChange={(event) => onChange("specifications", event.target.value)}
                            />
                        )}
                    />
                </div>
            </fieldset>

            <fieldset className="admin__product-form__fieldset">
                <legend className="admin__product-form__legend">Structured attributes</legend>
                <div className="admin__product-form__fieldset-header">
                    <p className="admin__product-form__description">
                        Add typed attributes for filters and comparison. The storage key uses lowercase snake_case.
                    </p>
                    <button type="button" className="admin__button admin__button--ghost" onClick={onAddAttribute}>
                        Add attribute
                    </button>
                </div>
                {attributeError ? <p className="admin__field-error" aria-live="polite">{attributeError}</p> : null}
                {values.attributes.length === 0 ? (
                    <p className="admin__product-form__empty">No structured attributes yet. Add one when the product needs a filterable technical value.</p>
                ) : (
                    <div className="admin__product-form__attributes">
                        {values.attributes.map((row, index) => {
                            const rowId = `${idPrefix}-attribute-${row.id}`;
                            const keyId = `${rowId}-key`;
                            const labelId = `${rowId}-label`;
                            const typeId = `${rowId}-type`;
                            const valueId = `${rowId}-value`;
                            const unitId = `${rowId}-unit`;
                            const filterId = `${rowId}-filterable`;

                            return (
                                <div key={row.id} className="admin__product-form__attribute-row" data-testid="product-attribute-row">
                                    <FormFieldShell
                                        id={keyId}
                                        label="Storage key"
                                        required
                                        helper="lowercase_snake_case"
                                        control={(
                                            <Form.Control
                                                {...controlA11yProps(keyId, "lowercase_snake_case", undefined)}
                                                type="text"
                                                value={row.key}
                                                placeholder="vram_gb…"
                                                autoComplete="off"
                                                spellCheck={false}
                                                required
                                                onChange={(event) => onAttributeChange(row.id, { key: event.target.value })}
                                            />
                                        )}
                                    />
                                    <FormFieldShell
                                        id={labelId}
                                        label="Display label"
                                        required
                                        control={(
                                            <Form.Control
                                                {...controlA11yProps(labelId, undefined, undefined)}
                                                type="text"
                                                value={row.label}
                                                placeholder="VRAM…"
                                                required
                                                onChange={(event) => onAttributeChange(row.id, { label: event.target.value })}
                                            />
                                        )}
                                    />
                                    <FormFieldShell
                                        id={typeId}
                                        label="Value type"
                                        control={(
                                            <Form.Control
                                                {...controlA11yProps(typeId, undefined, undefined)}
                                                as="select"
                                                value={row.type}
                                                onChange={(event) => onAttributeChange(row.id, { type: event.target.value as ProductAttributeRow["type"] })}
                                            >
                                                <option value="text">Text</option>
                                                <option value="number">Number</option>
                                            </Form.Control>
                                        )}
                                    />
                                    <FormFieldShell
                                        id={valueId}
                                        label="Value"
                                        required
                                        control={(
                                            <Form.Control
                                                {...controlA11yProps(valueId, undefined, undefined)}
                                                type={row.type === "number" ? "number" : "text"}
                                                step={row.type === "number" ? "any" : undefined}
                                                inputMode={row.type === "number" ? "decimal" : undefined}
                                                value={row.value}
                                                placeholder={row.type === "number" ? "12…" : "GDDR7…"}
                                                required
                                                onChange={(event) => onAttributeChange(row.id, { value: event.target.value })}
                                            />
                                        )}
                                    />
                                    <FormFieldShell
                                        id={unitId}
                                        label="Unit"
                                        helper="Optional"
                                        control={(
                                            <Form.Control
                                                {...controlA11yProps(unitId, "Optional", undefined)}
                                                type="text"
                                                value={row.unit}
                                                placeholder="GB…"
                                                maxLength={32}
                                                onChange={(event) => onAttributeChange(row.id, { unit: event.target.value })}
                                            />
                                        )}
                                    />
                                    <div className="admin__product-form__attribute-actions">
                                        <Form.Check
                                            id={filterId}
                                            type="checkbox"
                                            label="Use in storefront filters"
                                            checked={row.filterable}
                                            onChange={(event) => onAttributeChange(row.id, { filterable: event.target.checked })}
                                        />
                                        <button
                                            type="button"
                                            className="admin__button admin__button--danger"
                                            aria-label={`Remove attribute ${index + 1}`}
                                            onClick={() => onRemoveAttribute(row.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </fieldset>
        </div>
    );
};

export default ProductForm;
