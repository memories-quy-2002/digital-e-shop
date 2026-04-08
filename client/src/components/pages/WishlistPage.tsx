import React, { useEffect, useState } from "react";
import Layout from "../layout/Layout";
import axios from "../../api/axios";
import { Product } from "../../utils/interface";
import "../../styles/WishlistPage.scss";
import PaginatedItems from "../common/PaginatedItems";
import { Helmet } from "react-helmet";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

interface Wishlist {
    id: number;
    product: Product;
}

const WishlistPage = () => {
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const { userData } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    useEffect(() => {
        const fetchWishlist = async () => {
            try {
                const response = await axios.get(`/api/wishlist/${uid}`);
                if (response.status === 200) {
                    const newWishlist: Wishlist[] = response.data.wishlist.map((item: any) => {
                        const { id, product_id, ...productProps } = item;

                        return {
                            id,
                            product: {
                                id: product_id,
                                ...productProps,
                            },
                        };
                    });

                    setWishlist(newWishlist);
                }
            } catch (err) {
                if (uid) {
                    addToast("Wishlist", "Unable to load wishlist.");
                }
            }
        };
        fetchWishlist();
        return () => {};
    }, [uid]);

    return (
        <Layout>
            <Helmet>
                <title>Your Wishlist | Digital-E</title>
                <meta
                    name="description"
                    content="Save products you love and quickly add them to your cart when you're ready."
                />
            </Helmet>
            <main className="wishlist">
                <h2 className="wishlist__title">My Wishlist</h2>
                {wishlist.length > 0 ? (
                    <div className="wishlist__category">
                        <div className="wishlist__category__item">Product</div>
                        <div className="wishlist__category__item">Price</div>
                        <div className="wishlist__category__item">Stock status</div>
                        <div className="wishlist__category__item"></div>
                        <div className="wishlist__category__item"></div>
                    </div>
                ) : (
                    <div className="wishlist__empty">Your wishlist is empty.</div>
                )}

                <PaginatedItems
                    items={wishlist}
                    itemsPerPage={4}
                    uid={uid ? uid : ""}
                    wishlist={wishlist}
                    isWishlistPage={true}
                />
            </main>
        </Layout>
    );
};

export default WishlistPage;
