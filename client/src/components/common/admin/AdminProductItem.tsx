import React from "react";
import { TrashIcon } from "../Icons";
import { Product } from "../../../utils/interface";
import loadImage from "../../../utils/loadImage";
interface AdminProductItemProp {
    products: Product[];
    product: Product;
    handleOpen: (pid: number) => void;
}

const AdminProductItem = ({ products, product, handleOpen }: AdminProductItemProp) => {
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <tr key={product.id}>
            <td width="50px">{products.indexOf(product) + 1}</td>
            <td>
                {loadImage(imageUrl, product.name, {
                    width: "144px",
                    height: "96px", // thêm height cố định
                    objectFit: "contain", // crop ảnh để fill đều, không bị méo
                })}
            </td>
            <td width="450px">{product.name}</td>
            <td width="150px">{product.category}</td>
            <td width="150px">{product.brand}</td>
            <td width="150px">{product.price}</td>
            <td width="150px">{product.sale_price || "None"}</td>

            <td width="150px">{product.stock}</td>
            <td>
                <div>
                    {/* <button type="button">
                        <FaRegEdit />
                     </button> */}
                    <button data-testid="deleteProductBtn" type="button" onClick={() => handleOpen(product.id)}>
                        <TrashIcon />
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default AdminProductItem;
