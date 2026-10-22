import {
    CartIcon,
    HeartIcon,
    PersonIcon,
    SpeedometerIcon,
} from "../common/Icons";
import { Link } from "react-router-dom";
import type { CustomerNotification } from "../../features/users/api";
import { formatUtcDateTime } from "../../utils/dateTime";
import { CUSTOMER_ROUTES } from "../../routes/customerRoutes";
import type { Translator } from "../../hooks/useT";

type HeaderAccountMenusProps = {
    isNotificationMenuOpen: boolean;
    isProfileMenuOpen: boolean;
    isNotificationsLoading: boolean;
    notifications: CustomerNotification[];
    unreadNotifications: number;
    hasUserData: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    t: Translator;
    onCloseNotifications: () => void;
    onCloseProfile: () => void;
    onAdminNavigation: () => void;
    onAccountAction: () => void;
    onRequireLogin: (place: string) => void;
    onCartNavigation: () => void;
    onLogout: () => void;
};

const CUSTOMER_NOTIFICATIONS_TARGET = CUSTOMER_ROUTES.notifications;

/** Notification and account popovers are deferred until a user opens one. */
export default function HeaderAccountMenus({
    isNotificationMenuOpen,
    isProfileMenuOpen,
    isNotificationsLoading,
    notifications,
    unreadNotifications,
    hasUserData,
    isAuthenticated,
    isAdmin,
    t,
    onCloseNotifications,
    onCloseProfile,
    onAdminNavigation,
    onAccountAction,
    onRequireLogin,
    onCartNavigation,
    onLogout,
}: HeaderAccountMenusProps) {
    return (
        <>
            {isNotificationMenuOpen ? (
                <div
                    id="header-notifications-menu"
                    className="header__notifications__menu"
                    role="dialog"
                    aria-label={t("common.notifications")}
                >
                    <div className="header__notifications__header">
                        <div>
                            <strong>{t("common.notifications")}</strong>
                            {unreadNotifications > 0 ? (
                                <span>{t("header.unreadNotifications", unreadNotifications)}</span>
                            ) : null}
                        </div>
                        <Link to={CUSTOMER_NOTIFICATIONS_TARGET} onClick={onCloseNotifications}>
                            {t("common.viewAll")}
                        </Link>
                    </div>
                    <div className="header__notifications__list">
                        {isNotificationsLoading ? (
                            <p className="header__notifications__status">{t("header.loadingNotifications")}</p>
                        ) : notifications.length > 0 ? (
                            notifications.slice(0, 5).map((notification) => (
                                <Link
                                    key={notification.id}
                                    to={notification.link || CUSTOMER_NOTIFICATIONS_TARGET}
                                    className={notification.is_read
                                        ? "header__notifications__item"
                                        : "header__notifications__item is-unread"}
                                    onClick={onCloseNotifications}
                                >
                                    <span className="header__notifications__item__topline">
                                        <strong>{notification.title}</strong>
                                        <small>{formatUtcDateTime(notification.created_at)}</small>
                                    </span>
                                    <p>{notification.message}</p>
                                </Link>
                            ))
                        ) : (
                            <p className="header__notifications__status">{t("header.noNotifications")}</p>
                        )}
                    </div>
                </div>
            ) : null}

            {isProfileMenuOpen ? (
                <div className="header__profile__menu">
                    {isAdmin ? (
                        <button
                            type="button"
                            className="header__profile__item header__profile__item--admin"
                            onClick={onAdminNavigation}
                        >
                            <SpeedometerIcon size={18} />
                            <span>{t("header.backToAdmin")}</span>
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="header__profile__item"
                        onClick={() => {
                            onAccountAction();
                            onCloseProfile();
                        }}
                    >
                        <PersonIcon size={18} />
                        <span>{hasUserData ? t("common.account") : t("common.login")}</span>
                    </button>
                    <button
                        type="button"
                        className="header__profile__item"
                        onClick={() => {
                            onRequireLogin("/wishlist");
                            onCloseProfile();
                        }}
                    >
                        <HeartIcon size={18} />
                        <span>{t("common.wishlist")}</span>
                    </button>
                    <button
                        type="button"
                        className="header__profile__item"
                        onClick={() => {
                            onCartNavigation();
                            onCloseProfile();
                        }}
                    >
                        <CartIcon size={18} />
                        <span>{t("common.cart")}</span>
                    </button>
                    {isAuthenticated ? (
                        <button
                            type="button"
                            className="header__profile__item header__profile__item--danger"
                            onClick={() => {
                                onLogout();
                                onCloseProfile();
                            }}
                        >
                            <span>{t("common.logout")}</span>
                        </button>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
