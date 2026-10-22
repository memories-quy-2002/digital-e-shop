import { useEffect, type RefObject } from "react";
import { Link } from "react-router-dom";
import { BellIcon, CartIcon, HeartIcon, PersonIcon, SpeedometerIcon } from "../common/Icons";
import ColorSchemeDropdown from "../common/ColorSchemeDropdown";
import LanguageDropdown from "../common/LanguageDropdown";
import type { Translator } from "../../hooks/useT";

type HeaderLink = { label: string; to: string };

type HeaderMobileContentProps = {
    links: HeaderLink[];
    searchInputRef: RefObject<HTMLInputElement | null>;
    searchTerm: string;
    focusSearchOnMount: boolean;
    isAdmin: boolean;
    isAuthenticated: boolean;
    cartItemCount: number;
    t: Translator;
    onSearchTermChange: (value: string) => void;
    onMobileSearchFocused: () => void;
    onSubmitSearch: () => void;
    onClose: () => void;
    onAdminNavigation: () => void;
    onAccountAction: () => void;
    onRequireLogin: (place: string) => void;
    onNotificationsNavigation: () => void;
    onCartNavigation: () => void;
    onLogout: () => void;
};

/** Mobile menu content is fetched with the sheet after the menu is requested. */
export default function HeaderMobileContent({
    links,
    searchInputRef,
    searchTerm,
    focusSearchOnMount,
    isAdmin,
    isAuthenticated,
    cartItemCount,
    t,
    onSearchTermChange,
    onMobileSearchFocused,
    onSubmitSearch,
    onClose,
    onAdminNavigation,
    onAccountAction,
    onRequireLogin,
    onNotificationsNavigation,
    onCartNavigation,
    onLogout,
}: HeaderMobileContentProps) {
    useEffect(() => {
        if (!focusSearchOnMount) return;
        searchInputRef.current?.focus();
        onMobileSearchFocused();
    }, [focusSearchOnMount, onMobileSearchFocused, searchInputRef]);

    return (
        <>
            <div className="header__mobile__search" role="search">
                <label className="header__sr-only" htmlFor="header_mobile_search">
                    {t("common.search")}
                </label>
                <input
                    ref={searchInputRef}
                    type="text"
                    id="header_mobile_search"
                    placeholder={t("header.searchMobilePlaceholder")}
                    value={searchTerm}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            onSubmitSearch();
                            onClose();
                        }
                    }}
                />
                <button
                    type="button"
                    onClick={() => {
                        onSubmitSearch();
                        onClose();
                    }}
                >
                    {t("common.search")}
                </button>
            </div>

            <nav className="header__mobile__links" aria-label={t("header.mobileNavigation")}>
                {links.map((link) => (
                    <Link key={link.to} to={link.to} onClick={onClose}>
                        {t(`header.nav.${link.label.toLowerCase()}`)}
                    </Link>
                ))}
            </nav>

            <div className="header__mobile__actions">
                {isAdmin ? (
                    <button
                        type="button"
                        className="header__profile__item--admin header__mobile__admin-link"
                        onClick={onAdminNavigation}
                    >
                        <SpeedometerIcon size={18} />
                        {t("header.backToAdmin")}
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={() => {
                        onAccountAction();
                        onClose();
                    }}
                >
                    <PersonIcon size={18} />
                    {isAuthenticated ? t("common.account") : t("common.login")}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onRequireLogin("/wishlist");
                        onClose();
                    }}
                >
                    <HeartIcon size={18} />
                    {t("common.wishlist")}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onNotificationsNavigation();
                        onClose();
                    }}
                >
                    <BellIcon size={18} />
                    {t("common.notifications")}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onCartNavigation();
                        onClose();
                    }}
                >
                    <CartIcon size={18} />
                    {t("common.cart")}
                    {cartItemCount > 0 ? ` (${cartItemCount})` : ""}
                </button>
                <LanguageDropdown />
                <ColorSchemeDropdown />
                {isAuthenticated ? (
                    <button
                        type="button"
                        onClick={() => {
                            onLogout();
                            onClose();
                        }}
                    >
                        {t("common.logout")}
                    </button>
                ) : null}
            </div>
        </>
    );
}
