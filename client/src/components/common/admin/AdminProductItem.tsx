import React from "react";
import { PencilIcon } from "../Icons";
import { Product } from "../../../utils/interface";
import { formatCurrency } from "../../../utils/currency";
import { useAdminCopy } from "../../../hooks/useAdminCopy";

interface AdminProductItemProp {
    products: Product[];
    product: Product;
    handleOpen: (product: Product) => void;
}

const AdminProductItem = ({ products, product, handleOpen }: AdminProductItemProp) => {
    const tx = useAdminCopy();
    const isOutOfStock = product.stock <= 0;

    return (
        <tr className="admin__table__product-row" key={product.id}>
            <td className="admin__table__product-index" width="50px">{products.indexOf(product) + 1}</td>
            <td className="admin__table__product-name">
                <span className="admin__table__product-name__label">{product.name}</span>
            </td>
            <td className="admin__table__product-category">{product.category || "—"}</td>
            <td className="admin__table__product-brand">{product.brand || "—"}</td>
            <td className="admin__table__number admin__table__price">{formatCurrency(product.price)}</td>
            <td className="admin__table__number admin__table__sale-cell">
                {product.sale_price !== null ? (
                    <span className="admin__table__sale-price">{formatCurrency(product.sale_price)}</span>
                ) : (
                    <span className="admin__table__sale-none">—</span>
                )}
            </td>
            <td className="admin__table__stock-cell">
                <span
                    className={`admin__table__stock-pill ${
                        isOutOfStock ? "admin__table__stock-pill--empty" : "admin__table__stock-pill--available"
                    }`}
                >
                    <span className="admin__table__stock-indicator" aria-hidden="true" />
                    <strong>{product.stock}</strong>
                    <span>{tx(isOutOfStock ? "Out of stock" : "In stock")}</span>
                </span>
            </td>
            <td>
                <div className="admin__table__actions">
                    <button
                        data-testid="manageProductBtn"
                        type="button"
                        className="admin__button admin__button--ghost admin__button--compact admin__table__product-action"
                        aria-label={`Manage ${product.name}`}
                        onClick={() => handleOpen(product)}
                    >
                        <PencilIcon size={18} aria-hidden="true" />
                        <span>Manage</span>
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default AdminProductItem;
