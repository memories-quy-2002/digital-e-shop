import React from "react";
import "../../styles/components/_storefront-skeleton.scss";

type ProductGridSkeletonProps = {
    count: number;
    className?: string;
};

type FeaturedProductSkeletonsProps = {
    count: number;
};

const StorefrontSkeletonBlock = ({ className = "" }: { className?: string }) => (
    <div className={`storefront-skeleton ${className}`.trim()} aria-hidden="true" />
);

const ProductGridSkeleton = ({ count, className = "" }: ProductGridSkeletonProps) => (
    <div className={`storefront-skeleton-grid ${className}`.trim()} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
            <div key={`storefront-product-skeleton-${index}`} className="storefront-skeleton-card">
                <div className="storefront-skeleton-card__image">
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--image" />
                </div>
                <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--xs" />
                <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--lg" />
                <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--sm" />
                <div className="storefront-skeleton-card__footer">
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--sm" />
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--pill" />
                </div>
            </div>
        ))}
    </div>
);

const FeaturedProductSkeletons = ({ count }: FeaturedProductSkeletonsProps) => (
    <div className="storefront-skeleton-featured" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
            <div key={`storefront-featured-skeleton-${index}`} className="storefront-skeleton-featured__card">
                <div className="storefront-skeleton-featured__info">
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--xs" />
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--lg" />
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--line storefront-skeleton--sm" />
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--pill" />
                </div>
                <div className="storefront-skeleton-featured__image">
                    <StorefrontSkeletonBlock className="storefront-skeleton storefront-skeleton--image" />
                </div>
            </div>
        ))}
    </div>
);

export { FeaturedProductSkeletons, ProductGridSkeleton };
