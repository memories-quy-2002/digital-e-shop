import React from "react";
import { PencilIcon } from "../Icons";
import { Product } from "../../../utils/interface";
import loadImage from "../../../utils/loadImage";

interface AdminProductItemProp {
    products: Product[];
    product: Product;
    handleOpen: (product: Product) => void;
}

const AdminProductItem = ({ products, product, handleOpen }: AdminProductItemProp) => {
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <tr key={product.id}>
            <td width="50px">{products.indexOf(product) + 1}</td>
            <td>
                {loadImage(imageUrl, product.name, {
                    width: "144px",
                    height: "96px",
                    objectFit: "contain",
                })}
            </td>
            <td width="450px">{product.name}</td>
            <td width="150px">{product.category}</td>
            <td width="150px">{product.brand}</td>
            <td width="150px">${product.price.toFixed(2)}</td>
            <td width="150px">{product.sale_price !== null ? `$${product.sale_price.toFixed(2)}` : "None"}</td>
            <td width="150px">{product.stock}</td>
            <td>
                <div className="admin__table__actions">
                    <button
                        data-testid="manageProductBtn"
                        type="button"
                        className="admin__button admin__button--ghost admin__icon-button"
                        aria-label={`Manage ${product.name}`}
                        onClick={() => handleOpen(product)}
                    >
                        <PencilIcon size={18} />
                        <span>Manage</span>
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default AdminProductItem;
