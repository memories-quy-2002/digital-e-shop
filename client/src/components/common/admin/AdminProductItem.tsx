import { useEffect, useState } from "react";
import { FaRegTrashAlt } from "react-icons/fa";
import axios from "../../../api/axios";
import { Product } from "../../../utils/interface";

interface AdminProductItemProp {
    products: Product[];
    product: Product;
}

const AdminProductItem = ({ products, product }: AdminProductItemProp) => {
    const [image, setImage] = useState<string | null>(null);

    const imageUrl = product.main_image
        ? product.main_image.replace(".jpg", "")
        : null;

    useEffect(() => {
        const fetchImage = async () => {
            try {
                if (imageUrl) {
                    // Fetch image from the server
                    const response = await axios.get(
                        `/api/products/images/${imageUrl}`,
                        { responseType: "blob" } // Request as blob
                    );

                    if (response.status === 200) {
                        const blob = new Blob([response.data], {
                            type: "image/jpeg",
                        });
                        const url = URL.createObjectURL(blob); // Create a Blob URL

                        setImage(url); // Set the Blob URL as the image source
                    } else {
                        console.error("Error loading image");
                    }
                } else {
                    console.error("Image not found");
                }
            } catch (error) {
                console.error("Error fetching image:", error);
            }
        };

        fetchImage();

        // Clean up the Blob URL after component unmount
        return () => {
            if (image) {
                URL.revokeObjectURL(image);
            }
        };
    }, [imageUrl]);

    const handleDelete = async (id: number) => {
        try {
            const response = await axios.post("/api/products/delete/", {
                pid: id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    };
    return (
        <tr>
            <td width="50px">{products.indexOf(product) + 1}</td>
            <td>
                <img
                    src={
                        image
                            ? image
                            : require("../../../assets/images/product_placeholder.jpg")
                    }
                    alt={product.name}
                    style={{
                        height: "108px",
                        width: "144px",
                    }}
                />
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
                    <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                    >
                        <FaRegTrashAlt />
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default AdminProductItem;
