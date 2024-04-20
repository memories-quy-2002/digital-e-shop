import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";

type RecommendedProps = {
	pid: number;
	randomProducts: Product[];
};

const RecommendedProduct = ({ pid, randomProducts }: RecommendedProps) => {
	const navigate = useNavigate();
	return (
		<div className="product__container__recommended">
			<h3 className="product__container__recommended__title">
				Recommended Products
			</h3>
			<div className="product__container__recommended__list">
				{randomProducts.map((product) => (
					<div
						className="product__container__recommended__list__item"
						key={product.id}>
						<div
							className="product__container__recommended__list__item__image"
							onClick={() =>
								navigate(`/product?id=${product.id}`)
							}>
							<img
								src={
									product.main_image
										? require(`../../assets/images/${product.main_image}.jpg`)
										: require(`../../assets/images/product_placeholder.jpg`)
								}
								alt="Empty"
							/>
						</div>

						<p
							style={{
								textAlign: "center",
								fontWeight: "bold",
								color: "#939393",
							}}>
							{product.category}
						</p>
						<p
							style={{
								textAlign: "center",
								fontWeight: "bold",
								fontSize: "20px",
								height: "40px",
							}}>
							{product.name}
						</p>
						<p
							style={{
								textAlign: "center",
								fontWeight: "bold",
								fontSize: "20px",
								color: "red",
							}}>
							${product.price}
						</p>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								justifyContent: "space-between",
								padding: "1rem 1.5rem",
							}}>
							<div
								style={{
									width: "240px",
									display: "flex",
									gap: "5px",
								}}>
								{ratingStar(product.rating)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default RecommendedProduct;
