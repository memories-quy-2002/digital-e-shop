import React, { useActionState, useEffect, useState } from "react";
import { BankIcon, CashStackIcon, ShieldIcon } from "../common/Icons";
import { useToast } from "../../context/ToastContext";

type AsideCartProps = {
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
};

type CouponActionState = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

const initialCouponState: CouponActionState = {
    status: "idle",
};

const paymentMethods = [
    {
        label: "Bank transfer",
        note: "Receipt friendly",
        icon: <BankIcon size={24} aria-hidden />,
    },
    {
        label: "Cash on delivery",
        note: "Pay at delivery",
        icon: <CashStackIcon size={24} aria-hidden />,
    },
    {
        label: "Secure checkout",
        note: "UTC order time",
        icon: <ShieldIcon size={24} aria-hidden />,
    },
];

const AsideCart = ({ totalPrice, discount, subtotal, applyDiscount }: AsideCartProps) => {
    const [discountCode, setDiscountCode] = useState<string>("");
    const { addToast } = useToast();
    const [couponState, submitCouponAction, isApplyingCoupon] = useActionState(
        async (_previousState: CouponActionState, formData: FormData): Promise<CouponActionState> => {
            const nextDiscountCode = String(formData.get("couponInput") ?? "").trim();

            if (!nextDiscountCode) {
                return {
                    status: "error",
                    title: "Applying Coupon",
                    message: "Please enter a coupon code before applying it.",
                };
            }

            return applyDiscount(nextDiscountCode, totalPrice);
        },
        initialCouponState,
    );

    const onChangeDiscountCode = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setDiscountCode(value);
    };

    useEffect(() => {
        if (couponState.status === "idle") {
            return;
        }

        addToast(couponState.title || "Coupon", couponState.message || "Coupon request finished.");
    }, [addToast, couponState]);

    return (
        <aside className="cart-summary">
            <div className="cart-summary__card">
                <form action={submitCouponAction} className="cart-summary__coupon">
                    <h3 className="cart-summary__coupon-title">Have coupon?</h3>
                    <p className="cart-summary__coupon-hint">
                        Enter your code and apply to see instant savings.
                    </p>
                    <div className="cart-summary__coupon-input">
                        <input
                            type="text"
                            aria-label="Discount or coupon code"
                            name="couponInput"
                            id="couponInput"
                            data-testid="coupon"
                            value={discountCode}
                            onChange={onChangeDiscountCode}
                            style={{
                                textTransform: "uppercase",
                            }}
                        />
                        <button type="submit" disabled={isApplyingCoupon}>
                            {isApplyingCoupon ? "Applying..." : "Apply"}
                        </button>
                    </div>
                </form>
                <hr />
                <div className="cart-summary__pricing">
                    <div className="cart-summary__pricing-row">
                        <span>Total price</span>
                        <strong>${totalPrice.toFixed(2)}</strong>
                    </div>
                    <div className="cart-summary__pricing-row">
                        <span>Discount</span>
                        <strong className="muted">-${discount.toFixed(2)}</strong>
                    </div>
                    <div className="cart-summary__pricing-row cart-summary__pricing-row--total">
                        <span>Subtotal</span>
                        <strong>${subtotal.toFixed(2)}</strong>
                    </div>
                </div>
                <hr />
                <div className="cart-summary__payment">
                    <h3>Payment method</h3>
                    <p>Choose your payment option in the next checkout step.</p>
                    <ul className="cart-summary__payment-list">
                        {paymentMethods.map((method) => (
                            <li key={method.label} className="cart-summary__payment-item">
                                <span className="cart-summary__payment-icon">{method.icon}</span>
                                <div>
                                    <strong>{method.label}</strong>
                                    <small>{method.note}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </aside>
    );
};

export default AsideCart;
