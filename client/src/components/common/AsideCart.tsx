import React, { useActionState, useEffect, useState } from "react";
import { ArrowRightIcon, BankIcon, CashStackIcon, ShieldIcon } from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import { formatCurrency } from "../../utils/currency";
import { useT } from "../../hooks/useT";

type AsideCartProps = {
    itemCount: number;
    totalPrice: number;
    discount: number;
    subtotal: number;
    applyDiscount: (
        discountCode: string,
        totalPrice: number,
    ) => Promise<{
        status: "idle" | "success" | "error";
        title?: string;
        message?: string;
    }>;
    onCheckout: () => void;
    isCheckoutDisabled?: boolean;
    isCheckingOut?: boolean;
};

type CouponActionState = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

const initialCouponState: CouponActionState = {
    status: "idle",
};

const AsideCart = ({
    itemCount,
    totalPrice,
    discount,
    subtotal,
    applyDiscount,
    onCheckout,
    isCheckoutDisabled = false,
    isCheckingOut = false,
}: AsideCartProps) => {
    const [discountCode, setDiscountCode] = useState<string>("");
    const { addToast } = useToast();
    const t = useT();
    const [couponState, submitCouponAction, isApplyingCoupon] = useActionState(
        async (_previousState: CouponActionState, formData: FormData): Promise<CouponActionState> => {
            const nextDiscountCode = String(formData.get("couponInput") ?? "").trim();

            if (!nextDiscountCode) {
                return {
                    status: "error",
                    title: t("cart.couponErrorTitle"),
                    message: t("cart.couponEmpty"),
                };
            }

            return applyDiscount(nextDiscountCode, totalPrice);
        },
        initialCouponState,
    );

    useEffect(() => {
        if (couponState.status === "idle") {
            return;
        }

        addToast(couponState.title || t("cart.couponLabel"), couponState.message || t("cart.couponFinished"));
    }, [addToast, couponState, t]);

    return (
        <aside className="cart-summary" aria-labelledby="cart-summary-title">
            <div className="cart-summary__card">
                <div className="cart-summary__header">
                    <div>
                        <span className="cart-summary__eyebrow">{t("cart.summaryEyebrow")}</span>
                        <h2 id="cart-summary-title">{t("cart.orderSummary")}</h2>
                    </div>
                    <span className="cart-summary__count">{t("cart.itemsCount", itemCount)}</span>
                </div>

                <form action={submitCouponAction} className="cart-summary__coupon">
                    <label className="cart-summary__coupon-label" htmlFor="couponInput">
                        {t("cart.couponLabel")}
                    </label>
                    <p className="cart-summary__coupon-hint" id="couponHint">
                        {t("cart.couponHint")}
                    </p>
                    <div className="cart-summary__coupon-input">
                        <input
                            type="text"
                            aria-describedby="couponHint"
                            aria-label={t("cart.couponLabel")}
                            name="couponInput"
                            id="couponInput"
                            data-testid="coupon"
                            placeholder={t("cart.couponPlaceholder")}
                            autoComplete="off"
                            value={discountCode}
                            onChange={(event) => setDiscountCode(event.target.value)}
                        />
                        <button type="submit" disabled={isApplyingCoupon}>
                            {isApplyingCoupon ? t("cart.couponApplying") : t("cart.couponApply")}
                        </button>
                    </div>
                    {couponState.status !== "idle" ? (
                        <p
                            className={"cart-summary__coupon-feedback cart-summary__coupon-feedback--" + couponState.status}
                            role={couponState.status === "error" ? "alert" : "status"}
                            aria-live="polite"
                        >
                            {couponState.message || t("cart.couponFinished")}
                        </p>
                    ) : null}
                </form>

                <hr />

                <div className="cart-summary__pricing" aria-label={t("cart.orderSummary")}>
                    <div className="cart-summary__pricing-row">
                        <span>{t("cart.itemsSubtotal")}</span>
                        <strong>{formatCurrency(totalPrice)}</strong>
                    </div>
                    <div className="cart-summary__pricing-row cart-summary__pricing-row--discount">
                        <span>{t("cart.discount")}</span>
                        <strong>{discount > 0 ? "-" : ""}{formatCurrency(discount)}</strong>
                    </div>
                    <div className="cart-summary__pricing-row cart-summary__pricing-row--shipping">
                        <span>{t("cart.shipping")} {t("cart.calculatedAtCheckout")}</span>
                        <strong>—</strong>
                    </div>
                    <div className="cart-summary__pricing-row cart-summary__pricing-row--total">
                        <span>{t("cart.amountDue")}</span>
                        <strong>{formatCurrency(subtotal)}</strong>
                    </div>
                </div>

                <div className="cart-summary__payment">
                    <div className="cart-summary__payment-heading">
                        <div>
                            <h3>{t("cart.paymentOptions")}</h3>
                            <p>{t("cart.paymentOptionsDescription")}</p>
                        </div>
                        <ShieldIcon size={20} aria-hidden />
                    </div>
                    <ul className="cart-summary__payment-list">
                        <li className="cart-summary__payment-item">
                            <span className="cart-summary__payment-icon"><BankIcon size={22} aria-hidden /></span>
                            <div>
                                <strong>{t("cart.payos")}</strong>
                                <small>{t("cart.payosNote")}</small>
                            </div>
                        </li>
                        <li className="cart-summary__payment-item">
                            <span className="cart-summary__payment-icon"><BankIcon size={22} aria-hidden /></span>
                            <div>
                                <strong>{t("cart.bankTransfer")}</strong>
                                <small>{t("cart.bankTransferNote")}</small>
                            </div>
                        </li>
                        <li className="cart-summary__payment-item">
                            <span className="cart-summary__payment-icon"><CashStackIcon size={22} aria-hidden /></span>
                            <div>
                                <strong>{t("cart.cashOnDelivery")}</strong>
                                <small>{t("cart.cashOnDeliveryNote")}</small>
                            </div>
                        </li>
                    </ul>
                </div>

                <div className="cart-summary__trust">
                    <ShieldIcon size={18} aria-hidden />
                    <div>
                        <strong>{t("cart.secureCheckout")}</strong>
                        <small>{t("cart.secureCheckoutNote")}</small>
                    </div>
                </div>

                <button
                    type="button"
                    className="cart-summary__checkout"
                    onClick={onCheckout}
                    disabled={itemCount === 0 || isCheckoutDisabled || isCheckingOut}
                    aria-busy={isCheckingOut}
                >
                    {isCheckingOut ? t("cart.checkingStock") : t("cart.proceed")}
                    <ArrowRightIcon size={18} aria-hidden />
                </button>
            </div>
        </aside>
    );
};

export default AsideCart;
