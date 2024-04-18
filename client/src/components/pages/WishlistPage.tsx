import React, { useEffect, useState } from "react";
import Layout from "../layout/Layout";
import Cookies from "universal-cookie";
import axios from "../../api/axios";

interface WishlistItem {
	id: number;
	productId: number;
	userId: string;
	quantity: number;
}

const cookies = new Cookies();

const WishlistPage = () => {
	const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
	const uid =
		cookies.get("rememberMe")?.uid ||
		(sessionStorage["rememberMe"]
			? JSON.parse(sessionStorage["rememberMe"]).uid
			: "");
	useEffect(() => {
		const fetchWishlist = async () => {
			try {
				const response = await axios.get(`/api/wishlist/${uid}`);
				if (response.status === 200) {
					console.log(response.data.msg);
					const wishlistItems: WishlistItem[] =
						response.data.wishlist.map((item: any) => {
							return {
								...item,
								productId: item.product_id,
								userId: uid,
							};
						});
					setWishlist(wishlistItems);
				}
			} catch (err) {
				console.error(err);
			}
		};
		fetchWishlist();
	}, [uid]);
	console.log(wishlist);

	return (
		<Layout>
			<div>Wishlist</div>
			<div>
				{wishlist.map((item) => (
					<div>{item.quantity}</div>
				))}
			</div>
		</Layout>
	);
};

export default WishlistPage;
