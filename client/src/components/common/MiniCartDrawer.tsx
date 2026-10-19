import { Link } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useT } from "../../hooks/useT";
import { formatCurrency } from "../../utils/currency";
import {
  getProductImageUrl,
  normalizeProductImageName,
} from "../../utils/images";
import { CartIcon } from "./Icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import "../../styles/components/_mini-cart.scss";

type MiniCartDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MiniCartDrawer = ({ open, onOpenChange }: MiniCartDrawerProps) => {
  const t = useT();
  const { items, totalPrice, discount, subtotal, isLoading, error, fetchCart } =
    useCart();
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="mini-cart-drawer"
        side="right"
        motion
        className="mini-cart"
        closeLabel={t("cart.closePreview")}
        aria-label={t("cart.title")}
      >
        <SheetHeader className="mini-cart__header">
          <div className="mini-cart__heading-row">
            <SheetTitle>{t("cart.title")}</SheetTitle>
            <span className="mini-cart__count">
              {t("cart.itemsCount", itemCount)}
            </span>
          </div>
          <SheetDescription>{t("cart.previewDescription")}</SheetDescription>
        </SheetHeader>

        <div className="mini-cart__body">
          {isLoading && items.length === 0 ? (
            <p className="mini-cart__status" role="status">
              {t("cart.previewLoading")}
            </p>
          ) : error && items.length === 0 ? (
            <div className="mini-cart__empty">
              <p>{t("cart.loadError")}</p>
              <button
                type="button"
                className="mini-cart__text-button"
                onClick={() => void fetchCart()}
              >
                {t("cart.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="mini-cart__empty">
              <span className="mini-cart__empty-icon" aria-hidden="true">
                <CartIcon size={23} />
              </span>
              <h3>{t("cart.empty")}</h3>
              <p>{t("cart.emptyDescription")}</p>
              <Link
                className="mini-cart__view-cart"
                to="/cart"
                onClick={() => onOpenChange(false)}
              >
                {t("cart.viewCart")}
              </Link>
              <button
                type="button"
                className="mini-cart__text-button"
                onClick={() => onOpenChange(false)}
              >
                {t("cart.continueShopping")}
              </button>
            </div>
          ) : (
            <ul className="mini-cart__items">
              {items.map((item) => {
                const imageUrl = getProductImageUrl(
                  normalizeProductImageName(item.main_image),
                );
                const unitPrice = item.sale_price ?? item.price;
                return (
                  <li className="mini-cart__item" key={item.cartItemId}>
                    <Link
                      className="mini-cart__image"
                      to={`/product?id=${item.productId}`}
                      onClick={() => onOpenChange(false)}
                      aria-label={t("product.viewProduct")}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      ) : (
                        <span aria-hidden="true">
                          <CartIcon size={20} />
                        </span>
                      )}
                    </Link>
                    <div className="mini-cart__item-copy">
                      <span className="mini-cart__brand">{item.brand}</span>
                      <Link
                        className="mini-cart__name"
                        to={`/product?id=${item.productId}`}
                        onClick={() => onOpenChange(false)}
                      >
                        {item.productName}
                      </Link>
                      <div className="mini-cart__item-meta">
                        <span>
                          {t("cart.qty")}: {item.quantity}
                        </span>
                        <strong>
                          {formatCurrency(unitPrice * item.quantity)}
                        </strong>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <div className="mini-cart__footer">
            <p>
              <span>{t("cart.itemsSubtotal")}</span>
              <strong>{formatCurrency(totalPrice)}</strong>
            </p>
            {discount > 0 ? (
              <p className="mini-cart__discount">
                <span>{t("cart.discount")}</span>
                <strong>−{formatCurrency(discount)}</strong>
              </p>
            ) : null}
            <p className="mini-cart__total">
              <span>{t("cart.estimatedTotal")}</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </p>
            <Link
              className="mini-cart__view-cart"
              to="/cart"
              onClick={() => onOpenChange(false)}
            >
              {t("cart.viewCart")}
            </Link>
            <button
              type="button"
              className="mini-cart__continue"
              onClick={() => onOpenChange(false)}
            >
              {t("cart.continueShopping")}
            </button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

export default MiniCartDrawer;
