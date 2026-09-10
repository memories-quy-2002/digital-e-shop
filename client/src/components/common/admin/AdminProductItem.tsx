import React from "react";
import { PencilIcon } from "../Icons";
import { Product } from "../../../utils/interface";
import { formatCurrency } from "../../../utils/currency";

interface AdminProductItemProp {
    products: Product[];
    product: Product;
    handleOpen: (product: Product) => void;
}

const AdminProductItem = ({ products, product, handleOpen }: AdminProductItemProp) => {
    return (
        <tr key={product.id}>
            <td width="50px">{products.indexOf(product) + 1}</td>
            <td className="admin__table__product-name">
                <span>{product.name}</span>
                <small className="admin__table__product-meta-mobile">{product.stock} in stock</small>
            </td>
            <td>{product.category}</td>
            <td>{product.brand}</td>
            <td className="admin__table__number">{formatCurrency(product.price)}</td>
            <td className="admin__table__number">{product.sale_price !== null ? formatCurrency(product.sale_price) : "None"}</td>
            <td className="admin__table__number">{product.stock}</td>
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
