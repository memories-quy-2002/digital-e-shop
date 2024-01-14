import React from "react";
import "../../styles/Header.scss";
import { IoCall, IoCart, IoHeart, IoHome, IoMailSharp } from "react-icons/io5";
import { Navbar } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
export const Header = (): JSX.Element => {
	const navigate = useNavigate();
	return (
		<div className="header__container">
			<div className="header__container__info">
				<div className="header__container__info__personal">
					<div className="header__container__info__personal__item">
						<IoCall color="white" />
						(+84) 123 456 7890
					</div>
					<div className="header__container__info__personal__item">
						<IoMailSharp color="white" />
						digital-e@gmail.com
					</div>
					<div className="header__container__info__personal__item">
						<IoHome color="white" />
						123 ABC Street, HCM City
					</div>
				</div>
				<div className="header__container__info__auth">
					<strong>Welcome Anonymous</strong>
					<div className="header__container__info__auth__button">
						<div>
							<a href="/login">Login</a>
						</div>
						<div>|</div>
						<div>
							<a href="/signup">Signup</a>
						</div>
					</div>
				</div>
			</div>
			<div className="header__container__main">
				<div className="header__container__main__brand">
					<Navbar.Brand
						href="/"
						className="header__container__main__brand__link"
					>
						DIGITAL-E
					</Navbar.Brand>
				</div>
				<div className="header__container__main__search">
					<input
						type="text"
						name=""
						id=""
						placeholder="Search product..."
						className="header__container__main__search__bar"
					/>
					<button onClick={() => navigate("/product?id=1")}>Search</button>
				</div>
				<div className="header__container__main__group">
					<div
						className="header__container__main__group__item"
						onClick={() => navigate("/wishlist")}
					>
						<IoHeart size={28} />
						Wishlist
					</div>
					<div
						className="header__container__main__group__item"
						onClick={() => navigate("/cart")}
					>
						<IoCart size={28} />
						Shopping Cart
					</div>
				</div>
			</div>
		</div>
	);
};
