import { BsHeart, BsHeartFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    onAddingWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ShopsItem = ({ product, uid, isWishlist, onAddingWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <div className="shops__container__main__pagination__list__item" key={product.id}>
            <div
                className="shops__container__main__pagination__list__item__image"
                onClick={() => navigate(`/product?id=${product.id}`)}
            >
                {imageUrl ? (
                    <img
                        src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                        alt={product.name}
                    />
                ) : (
                    <img src={require("../../assets/images/product_placeholder.jpg")} alt={product.name} />
                )}
            </div>

            <div
                className="shops__container__main__pagination__list__item__like"
                onClick={() => onAddingWishlist(uid, product.id)}
            >
                {isWishlist ? <BsHeartFill size={24} color="red" /> : <BsHeart size={24} color="red" />}
            </div>

            <p className="shops__container__main__pagination__list__item__category">{product.category}</p>
            <p className="shops__container__main__pagination__list__item__name">{product.name}</p>
            {product.sale_price ? (
                <div className="d-flex flex-row gap-3 justify-content-center">
                    <p
                        style={{
                            textAlign: "center",
                            fontWeight: "bold",
                            fontSize: "1.25rem",
                            color: "red",
                        }}
                    >
                        ${product.sale_price}
                    </p>
                    <p className="shops__container__main__pagination__list__item__price">${product.price}</p>
                </div>
            ) : (
                <p
                    className="shops__container__main__pagination__list__item__price"
                    style={{ color: "red", textDecoration: "none" }}
                >
                    ${product.price}
                </p>
            )}

            <div className="shops__container__main__pagination__list__item__rating">
                <div
                    style={{
                        width: "8rem",
                        display: "flex",
                        gap: "0.25rem",
                    }}
                >
                    {ratingStar(product.rating)}
                </div>

                <button type="button" onClick={() => onAddingCart(uid, product.id)} style={{ fontSize: "16px" }}>
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default ShopsItem;
