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

const ProductItem = ({
    product,
    uid,
    isWishlist,
    onAddingWishlist,
    onAddingCart,
}: ProductProps) => {
    const navigate = useNavigate();
    const checkImageExists = (imageName: string | null) => {
        try {
            require(`../../assets/images/${imageName}.jpg`);
            return true;
        } catch (error) {
            return false;
        }
    };

    return (
        <div className="home__product__menu__item" key={product.id}>
            <div
                className="home__product__menu__item__image"
                onClick={() => navigate(`/product?id=${product.id}`)}
            >
                <img
                    src={
                        checkImageExists(product.main_image)
                            ? require(`../../assets/images/${product.main_image}.jpg`)
                            : require(`../../assets/images/product_placeholder.jpg`)
                    }
                    alt={product.name}
                />
            </div>

            <div className="home__product__menu__item__wishlist">0</div>

            <div
                className="home__product__menu__item__like"
                onClick={() => onAddingWishlist(uid, product.id)}
            >
                {isWishlist ? (
                    <BsHeartFill size={24} color="red" />
                ) : (
                    <BsHeart size={24} color="red" />
                )}
            </div>

            <p
                style={{
                    textAlign: "center",
                    fontWeight: "bold",
                    color: "#939393",
                }}
            >
                {product.category}
            </p>
            <p
                style={{
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "20px",
                    height: "55px",
                }}
            >
                {product.name}
            </p>
            <p
                style={{
                    textAlign: "center",
                    fontWeight: "bold",
                    fontSize: "20px",
                    color: "red",
                }}
            >
                ${product.price}
            </p>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    padding: "1rem 1.5rem",
                }}
            >
                <div
                    style={{
                        width: "240px",
                        display: "flex",
                        gap: "5px",
                    }}
                >
                    {ratingStar(product.rating)}
                </div>

                <button
                    type="button"
                    onClick={() => onAddingCart(uid, product.id)}
                    style={{ fontSize: "16px" }}
                >
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default ProductItem;
