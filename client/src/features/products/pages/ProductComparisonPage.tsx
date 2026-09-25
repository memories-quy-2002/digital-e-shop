import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import EmptyState from "../../../components/common/EmptyState";
import LoadingScreen from "../../../components/common/LoadingScreen";
import { Button } from "../../../components/ui/button";
import Layout from "../../../components/layout/Layout";
import { useCart } from "../../../context/CartContext";
import { useComparison } from "../../../context/ComparisonContext";
import { useToast } from "../../../context/ToastContext";
import { useT } from "../../../hooks/useT";
import { fetchProductComparison, type ProductWithAttributes } from "../api";
import ComparisonTable from "../components/ComparisonTable";
import { buildComparisonRows, filterComparisonRows } from "../compare/compareMatrix";
import { formatCurrency } from "../../../utils/currency";
import {
    getProductImageUrl,
    getResponsiveImageSource,
    PAGE_IMAGE_WIDTHS,
} from "../../../utils/images";
import "../../../styles/pages/_comparison.scss";

const MAX_COMPARISON_ITEMS = 4;

type ParsedComparisonIds = {
    ids: number[];
    invalid: boolean;
};

type ComparisonRequestError = {
    response?: {
        data?: {
            code?: unknown;
        };
    };
};

const parseComparisonIds = (search: string): ParsedComparisonIds => {
    const raw = new URLSearchParams(search).get("ids");
    if (!raw) {
        return { ids: [], invalid: false };
    }

    const rawTokens = raw.split(",").map((value) => value.trim());
    const tokens = rawTokens.filter(Boolean);
    const parsed = tokens.map((value) => Number(value));
    const hasInvalidToken = rawTokens.some((value) => !value) || tokens.length === 0 || parsed.some((id, index) =>
        !/^\d+$/.test(tokens[index]) || !Number.isSafeInteger(id) || id <= 0,
    );
    const ids = Array.from(new Set(parsed.filter((id) => Number.isSafeInteger(id) && id > 0)));

    const invalid = hasInvalidToken || ids.length !== parsed.length || ids.length > MAX_COMPARISON_ITEMS;

    return {
        ids: invalid ? [] : ids,
        invalid,
    };
};

const getComparisonErrorCode = (error: unknown): string => {
    if (!error || typeof error !== "object") {
        return "";
    }

    const code = (error as ComparisonRequestError).response?.data?.code;
    return typeof code === "string" ? code : "";
};

const getComparisonErrorKey = (code: string): string => {
    switch (code) {
        case "COMPARE_CATEGORY_MISMATCH":
            return "comparison.categoryMismatch";
        case "COMPARE_PRODUCTS_NOT_FOUND":
            return "comparison.notFound";
        case "COMPARE_INVALID_IDS":
            return "comparison.invalidLink";
        default:
            return "comparison.loadError";
    }
};

const availableStockFor = (product: ProductWithAttributes): number =>
    Math.max(0, Number(product.available_stock ?? product.stock) || 0);

const ProductSummary = ({
    product,
    onAddToCart,
    onRemove,
}: {
    product: ProductWithAttributes;
    onAddToCart: (product: ProductWithAttributes) => void;
    onRemove: (productId: number) => void;
}) => {
    const t = useT();
    const availableStock = availableStockFor(product);
    const hasSale = product.sale_price !== null && product.sale_price > 0 && product.sale_price < product.price;
    const activePrice = hasSale ? product.sale_price : product.price;
    const imageSource = getResponsiveImageSource(getProductImageUrl(product.main_image), {
        sizes: "(min-width: 1024px) 18rem, (min-width: 640px) 30vw, 90vw",
        widths: PAGE_IMAGE_WIDTHS,
    });

    return (
        <article className="comparison-product">
            <div className="comparison-product__media">
                {imageSource.src ? (
                    <img
                        src={imageSource.src}
                        srcSet={imageSource.srcSet}
                        sizes={imageSource.sizes}
                        alt={product.name}
                        loading="lazy"
                    />
                ) : (
                    <div className="comparison-product__placeholder" role="img" aria-label={product.name}>
                        <span aria-hidden="true">DE</span>
                    </div>
                )}
            </div>
            <div className="comparison-product__body">
                <div className="comparison-product__heading">
                    <div>
                        <p className="comparison-product__eyebrow">{product.brand || product.category}</p>
                        <h2>
                            <Link to={`/product?id=${product.id}`}>{product.name}</Link>
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="comparison-product__remove"
                        onClick={() => onRemove(product.id)}
                        aria-label={t("comparison.removeComparisonProduct", product.name)}
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                </div>
                <p className="comparison-product__sku">{product.sku}</p>
                <p className="comparison-product__reviews">
                    <span role="img" aria-label={`${product.rating.toFixed(1)} ${t("product.ratingLabel")}`}>
                        {product.rating.toFixed(1)}
                    </span>
                    <span aria-hidden="true"> · </span>
                    {t("product.reviewsCount", product.reviews)}
                </p>
                <div className="comparison-product__pricing" aria-label={t("comparison.pageTitle")}>
                    <strong>{formatCurrency(activePrice)}</strong>
                    {hasSale ? <span>{formatCurrency(product.price)}</span> : null}
                </div>
                <dl className="comparison-product__facts">
                    <div>
                        <dt>{t("comparison.warranty")}</dt>
                        <dd>
                            {product.warrantyMonths ? t("comparison.warrantyDuration", product.warrantyMonths) : t("comparison.missingValue")}
                        </dd>
                    </div>
                    <div>
                        <dt>{t("comparison.availability")}</dt>
                        <dd className={availableStock > 0 ? "comparison-product__stock--available" : "comparison-product__stock--empty"}>
                            {availableStock > 0 ? t("comparison.inStock", availableStock) : t("comparison.outOfStock")}
                        </dd>
                    </div>
                </dl>
                <Button
                    className="comparison-product__cart"
                    variant="outline"
                    disabled={availableStock <= 0}
                    onClick={() => onAddToCart(product)}
                    aria-label={t("comparison.addToCart", product.name)}
                >
                    {availableStock > 0 ? t("comparison.addToCart", product.name) : t("comparison.outOfStock")}
                </Button>
            </div>
        </article>
    );
};

const ProductComparisonPage = () => {
    const t = useT();
    const location = useLocation();
    const navigate = useNavigate();
    const comparison = useComparison();
    const { remove: removeComparison, replace: replaceComparison } = comparison;
    const { addItem } = useCart();
    const { addToast } = useToast();
    const requested = useMemo(() => parseComparisonIds(location.search), [location.search]);
    const [comparisonData, setComparisonData] = useState<Awaited<ReturnType<typeof fetchProductComparison>> | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [differencesOnly, setDifferencesOnly] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        if (requested.invalid) {
            return;
        }
        replaceComparison(requested.ids);
    }, [replaceComparison, requested.ids, requested.invalid]);

    useEffect(() => {
        let cancelled = false;
        setComparisonData(null);
        setErrorKey(null);
        setLoading(false);

        if (requested.invalid || requested.ids.length < 2) {
            return () => {
                cancelled = true;
            };
        }

        setLoading(true);
        fetchProductComparison(requested.ids)
            .then((data) => {
                if (!cancelled) {
                    setComparisonData(data);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setErrorKey(getComparisonErrorKey(getComparisonErrorCode(error)));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [requested.ids, requested.invalid, retryCount]);

    const products = useMemo(() => comparisonData?.products ?? [], [comparisonData]);
    const rows = useMemo(
        () => filterComparisonRows(buildComparisonRows(products), differencesOnly),
        [differencesOnly, products],
    );

    const handleRemove = useCallback((productId: number) => {
        const nextIds = requested.ids.filter((id) => id !== productId);
        removeComparison(productId);
        navigate(nextIds.length > 0 ? `/compare?ids=${nextIds.join(",")}` : "/compare", { replace: true });
        addToast(t("comparison.removed"), t("comparison.productId", productId));
    }, [addToast, removeComparison, navigate, requested.ids, t]);

    const handleAddToCart = useCallback(async (product: ProductWithAttributes) => {
        const added = await addItem(product.id, 1);
        if (added) {
            addToast(t("comparison.added"), product.name);
        }
    }, [addItem, addToast, t]);

    const renderState = () => {
        if (requested.invalid) {
            return <p className="comparison-page__message" role="alert">{t("comparison.invalidLink")}</p>;
        }

        if (requested.ids.length === 0) {
            return (
                <EmptyState
                    title={t("comparison.emptyTitle")}
                    description={t("comparison.emptyDescription")}
                    actionLabel={t("common.shopNow")}
                    actionTo="/shops"
                    className="comparison-page__empty"
                />
            );
        }

        if (requested.ids.length === 1) {
            return (
                <EmptyState
                    title={t("comparison.oneProductTitle")}
                    actionLabel={t("common.shopNow")}
                    actionTo="/shops"
                    className="comparison-page__empty"
                />
            );
        }

        if (loading) {
            return (
                <div className="comparison-page__status" role="status" aria-live="polite" aria-busy="true">
                    <LoadingScreen />
                    <span>{t("comparison.loading")}</span>
                </div>
            );
        }

        if (errorKey) {
            return (
                <div className="comparison-page__message" role="alert" aria-live="polite">
                    <p>{t(errorKey)}</p>
                    <Button onClick={() => setRetryCount((count) => count + 1)}>{t("comparison.retry")}</Button>
                </div>
            );
        }

        if (products.length === 0) {
            return <p className="comparison-page__message" role="alert">{t("comparison.notFound")}</p>;
        }

        return (
            <>
                <div
                    className="comparison-page__products"
                    data-product-count={products.length}
                    aria-label={t("comparison.selectedProducts")}
                >
                    {products.map((product) => (
                        <ProductSummary
                            key={product.id}
                            product={product}
                            onAddToCart={handleAddToCart}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
                <section className="comparison-page__matrix" aria-labelledby="comparison-matrix-title">
                    <div className="comparison-page__matrix-heading">
                        <div>
                            <p className="comparison-page__eyebrow">{comparisonData?.category.name}</p>
                            <h2 id="comparison-matrix-title">{t("comparison.specifications")}</h2>
                        </div>
                        <label className="comparison-page__toggle">
                            <input
                                type="checkbox"
                                aria-pressed={differencesOnly}
                                checked={differencesOnly}
                                onChange={(event) => setDifferencesOnly(event.target.checked)}
                            />
                            <span>{t("comparison.differencesOnly")}</span>
                        </label>
                    </div>
                    {rows.length > 0 ? (
                        <ComparisonTable products={products} rows={rows} />
                    ) : (
                        <p className="comparison-page__message comparison-page__message--compact">
                            {t("comparison.missingValue")}
                        </p>
                    )}
                </section>
            </>
        );
    };

    return (
        <Layout>
            <section className="comparison-page" aria-labelledby="comparison-page-title">
                <header className="comparison-page__header">
                    <div>
                        <p className="comparison-page__eyebrow">{t("comparison.selectedCount", requested.ids.length)}</p>
                        <h1 id="comparison-page-title">{t("comparison.pageTitle")}</h1>
                        <p>{t("comparison.pageDescription")}</p>
                    </div>
                    {requested.ids.length > 0 ? (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                comparison.clear();
                                navigate("/compare", { replace: true });
                            }}
                        >
                            {t("comparison.clearAll")}
                        </Button>
                    ) : null}
                </header>
                {renderState()}
            </section>
        </Layout>
    );
};

export default ProductComparisonPage;
