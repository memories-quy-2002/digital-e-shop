import React from "react";
import LazyLoadImage from "../../utils/LazyLoadingImage";
import { normalizeProductImageName } from "../../utils/images";
import type { RecentlyViewedEntry } from "../../hooks/useRecentlyViewed";
import { useT } from "../../hooks/useT";

type RecentlyViewedStripProps = {
    items: RecentlyViewedEntry[];
    onSelect?: (id: number) => void;
};

const formatPrice = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const RecentlyViewedStrip: React.FC<RecentlyViewedStripProps> = ({ items, onSelect }) => {
    const t = useT();
    if (items.length === 0) {
        return null;
    }

    return (
        <section className="recently-viewed" aria-label={t("home.recentlyViewed")}>
            <header className="recently-viewed__head">
                <h2>{t("home.recentlyViewed")}</h2>
                <p>{t("home.recentlyViewedSubtitle")}</p>
            </header>
            <ul className="recently-viewed__track" role="list">
                {items.map((item) => {
                    const hasSale =
                        item.sale_price !== null && item.sale_price !== undefined && item.sale_price < item.price;
                    const activePrice = hasSale ? item.sale_price ?? item.price : item.price;
                    const handleClick = () => onSelect?.(item.id);
                    return (
                        <li key={item.id} className="recently-viewed__item">
                            <a
                                href={`/product?id=${item.id}`}
                                className="recently-viewed__card"
                                onClick={(event) => {
                                    if (onSelect) {
                                        event.preventDefault();
                                        handleClick();
                                    }
                                }}
                            >
                                <div className="recently-viewed__image">
                                    <LazyLoadImage
                                        src={`https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/${normalizeProductImageName(item.main_image)}.jpg`}
                                        alt={item.name}
                                        onError={() => undefined}
                                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                    />
                                </div>
                                <div className="recently-viewed__body">
                                    <span className="recently-viewed__brand">{item.brand}</span>
                                    <strong className="recently-viewed__name">{item.name}</strong>
                                    <span className="recently-viewed__price">
                                        {hasSale ? (
                                            <>
                                                <em>${formatPrice(item.price)}</em>
                                                <strong>${formatPrice(activePrice)}</strong>
                                            </>
                                        ) : (
                                            <strong>${formatPrice(activePrice)}</strong>
                                        )}
                                    </span>
                                </div>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default RecentlyViewedStrip;
