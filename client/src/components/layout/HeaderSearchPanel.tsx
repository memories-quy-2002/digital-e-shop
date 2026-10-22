import { useDeferredValue, useEffect, useState } from "react";
import type { Product } from "../../types/product";
import { searchProducts } from "../../features/products/api";
import { getProductImageUrl, normalizeProductImageName } from "../../utils/images";
import { formatCurrency } from "../../utils/currency";
import type { Translator } from "../../hooks/useT";

type HeaderSearchPanelProps = {
    searchTerm: string;
    recentSearches: string[];
    onClearRecent: () => void;
    onSubmitSearch: (term: string) => void;
    onSelectProduct: (product: Product) => void;
    t: Translator;
};

/** Search results and recent-search UI load only after the search panel is opened. */
export default function HeaderSearchPanel({
    searchTerm,
    recentSearches,
    onClearRecent,
    onSubmitSearch,
    onSelectProduct,
    t,
}: HeaderSearchPanelProps) {
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (normalizedSearchTerm.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = window.setTimeout(() => {
            searchProducts(normalizedSearchTerm, 6)
                .then(setSearchResults)
                .catch(() => setSearchResults([]))
                .finally(() => setIsSearching(false));
        }, 220);

        return () => window.clearTimeout(timer);
    }, [normalizedSearchTerm]);

    if (normalizedSearchTerm.length > 1) {
        return (
            <div className="header__search__results">
                {searchResults.length > 0 ? (
                    searchResults.map((product) => {
                        const hasSale = product.sale_price !== null && product.sale_price < product.price;
                        const activePrice = hasSale ? product.sale_price : product.price;

                        return (
                            <button
                                key={product.id}
                                type="button"
                                className="header__search__result"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onSelectProduct(product)}
                            >
                                <span className="header__search__result__image">
                                    <img
                                        src={getProductImageUrl(normalizeProductImageName(product.main_image))}
                                        alt=""
                                        width={44}
                                        height={44}
                                        loading="lazy"
                                    />
                                </span>
                                <span className="header__search__result__body">
                                    <span className="header__search__result__top">
                                        <strong>{product.name}</strong>
                                        {hasSale ? <span className="header__search__result__badge">{t("header.sale")}</span> : null}
                                    </span>
                                    <span>
                                        {product.brand} - {product.category}
                                    </span>
                                </span>
                                <span className="header__search__result__price">{formatCurrency(activePrice)}</span>
                            </button>
                        );
                    })
                ) : isSearching ? (
                    <div className="header__search__empty">{t("header.searching")}</div>
                ) : (
                    <div className="header__search__empty">{t("header.searchNoResults")}</div>
                )}
                <div className="header__search__shortcut">{t("header.searchShortcutHint")}</div>
            </div>
        );
    }

    if (normalizedSearchTerm.length < 2 && recentSearches.length > 0) {
        return (
            <div className="header__search__results">
                <div className="header__search__history">
                    <span>{t("header.recentSearches")}</span>
                    <button type="button" className="header__search__history-clear" onClick={onClearRecent}>
                        {t("header.clearRecentSearches")}
                    </button>
                </div>
                <div style={{ padding: "0.5rem 0.6rem" }}>
                    {recentSearches.map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            className="header__search__history-chip"
                            onClick={() => onSubmitSearch(entry)}
                        >
                            {entry}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return null;
}
