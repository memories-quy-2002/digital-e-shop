import React, { useEffect, useState } from "react";
import Layout from "../layout/Layout";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { Product } from "../../utils/interface";
import "../../styles/WishlistPage.scss";
import PaginatedItems from "../common/PaginatedItems";
import NavigationBar from "../common/NavigationBar";

interface Wishlist {
    id: number;
    product: Product;
}

const cookies = new Cookies();

const WishlistPage = () => {
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
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
                    const newWishlist: Wishlist[] = response.data.wishlist.map(
                        (item: any) => {
                            const { id, product_id, ...productProps } = item;

                            return {
                                id,
                                product: {
                                    id: product_id,
                                    ...productProps,
                                },
                            };
                        }
                    );

                    setWishlist(newWishlist);
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchWishlist();
        return () => {};
    }, [uid]);
    console.log(wishlist);

    return (
        <Layout>
            <NavigationBar />
            <div className="wishlist">
                <div className="wishlist__title">
                    <h2>MY WISHLIST</h2>
                </div>
                <div className="wishlist__category">
                    <div
                        id="wishlist_product"
                        className="wishlist__category__item"
                    >
                        Product
                    </div>
                    <div
                        id="wishlist_price"
                        className="wishlist__category__item"
                    >
                        Price
                    </div>
                    <div
                        id="wishlist_stock"
                        className="wishlist__category__item"
                    >
                        Stock status
                    </div>
                </div>

                <PaginatedItems
                    items={wishlist}
                    itemsPerPage={4}
                    uid={uid}
                    wishlist={[]}
                />
            </div>
        </Layout>
    );
};

export default WishlistPage;
