import React from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

type ProductGridSkeletonProps = {
    count: number;
    className?: string;
};

type FeaturedProductSkeletonsProps = {
    count: number;
};

const StorefrontSkeletonBlock = ({ className = "" }: { className?: string }) => (
    <Skeleton className={className} aria-hidden="true" />
);

const ProductGridSkeleton = ({ count, className = "" }: ProductGridSkeletonProps) => (
    <div
        className={cn("grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3", className)}
        role="status"
        aria-label="Loading products"
        aria-busy="true"
    >
        {Array.from({ length: count }, (_, index) => (
            <div
                key={`storefront-product-skeleton-${index}`}
                data-testid="product-skeleton-card"
                className="grid gap-3 rounded-control border border-border bg-card p-4 shadow-sm"
            >
                <div className="overflow-hidden rounded-control">
                    <StorefrontSkeletonBlock className="aspect-[4/3] w-full" />
                </div>
                <StorefrontSkeletonBlock className="h-3 w-1/3" />
                <StorefrontSkeletonBlock className="h-5 w-5/6" />
                <StorefrontSkeletonBlock className="h-4 w-1/2" />
                <div className="mt-2 flex items-center justify-between gap-4">
                    <StorefrontSkeletonBlock className="h-5 w-1/2" />
                    <StorefrontSkeletonBlock className="h-10 w-28 rounded-control" />
                </div>
            </div>
        ))}
    </div>
);

const FeaturedProductSkeletons = ({ count }: FeaturedProductSkeletonsProps) => (
    <div
        className="grid grid-cols-1 gap-5 lg:grid-cols-3"
        role="status"
        aria-label="Loading featured products"
        aria-busy="true"
    >
        {Array.from({ length: count }, (_, index) => (
            <div
                key={`storefront-featured-skeleton-${index}`}
                className="grid min-h-64 grid-cols-[1.1fr_1fr] items-center gap-4 rounded-panel border border-border bg-card p-5 shadow-sm"
            >
                <div className="flex flex-col gap-3">
                    <StorefrontSkeletonBlock className="h-3 w-1/3" />
                    <StorefrontSkeletonBlock className="h-6 w-5/6" />
                    <StorefrontSkeletonBlock className="h-4 w-1/2" />
                    <StorefrontSkeletonBlock className="h-10 w-28 rounded-control" />
                </div>
                <div className="flex min-h-44 items-center justify-center">
                    <StorefrontSkeletonBlock className="h-44 w-full max-w-52 rounded-control" />
                </div>
            </div>
        ))}
    </div>
);

export { FeaturedProductSkeletons, ProductGridSkeleton };
