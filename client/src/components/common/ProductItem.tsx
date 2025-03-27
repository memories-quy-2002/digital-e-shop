import { BsHeart, BsHeartFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import LazyLoadImage from "../../utils/LazyLoadingImage";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";
type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    onAddingWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ProductItem = ({ product, uid, isWishlist, onAddingWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <div className="home__product__menu__item" key={product.id}>
            <div className="home__product__menu__item__image" onClick={() => navigate(`/product?id=${product.id}`)}>
                {imageUrl ? (
                    <LazyLoadImage
                        src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                        alt={product.name}
                    />
                ) : (
                    <img src={productPlaceholder} alt={product.name} />
                )}
            </div>

            <div className="home__product__menu__item__like" onClick={() => onAddingWishlist(uid, product.id)}>
                {isWishlist ? <BsHeartFill size={24} color="red" /> : <BsHeart size={24} color="red" />}
            </div>

            <p className="home__product__menu__item__category">{product.category}</p>
            <p className="home__product__menu__item__name">{product.name}</p>
            {product.sale_price ? (
                <div className="d-flex flex-row gap-3 justify-content-center">
                    <p className="home__product__menu__item__price">${product.price}</p>
                    <p
                        style={{
                            textAlign: "center",
                            fontWeight: "bold",
                            fontSize: "20px",
                            color: "red",
                        }}
                    >
                        ${product.sale_price}
                    </p>
                </div>
            ) : (
                <p
                    className="home__product__menu__item__price"
                    style={{
                        color: "red",
                        textDecoration: "none",
                    }}
                >
                    ${product.price}
                </p>
            )}

            <div className="home__product__menu__item__rating">
                <div
                    style={{
                        width: "10rem",
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

export default ProductItem;
