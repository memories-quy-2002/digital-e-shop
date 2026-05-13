import React, { useState } from "react";
import { BankIcon, CashStackIcon, ShieldIcon } from "../common/Icons";

type AsideCartProps = {
    totalPrice: number;
    discount: number;
    subtotal: number;
    applyDiscount: (discountCode: string, totalPrice: number) => void;
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
    const onChangeDiscountCode = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setDiscountCode(value);
    };

    return (
        <aside className="cart__container__box__aside">
            <div className="cart__container__box__aside__box">
                <div className="cart__container__box__aside__box__coupon">
                    <h3 className="cart__container__box__aside__box__coupon__title">Have coupon?</h3>
                    <p className="cart__container__box__aside__box__coupon__hint">
                        Enter your code and apply to see instant savings.
                    </p>
                    <div className="cart__container__box__aside__box__coupon__input">
                        <input
                            type="text"
                            aria-label="Discount or coupon code"
                            name="couponInput"
                            id="couponInput"
                            data-testid="coupon"
                            onChange={onChangeDiscountCode}
                            style={{
                                textTransform: "uppercase",
                            }}
                        />
                        <button type="button" onClick={() => applyDiscount(discountCode, totalPrice)}>
                            Apply
                        </button>
                    </div>
                </div>
                <hr />
                <div className="cart__container__box__aside__box__price">
                    <div className="cart__container__box__aside__box__price__row">
                        <span>Total price</span>
                        <strong>${totalPrice.toFixed(2)}</strong>
                    </div>
                    <div className="cart__container__box__aside__box__price__row">
                        <span>Discount</span>
                        <strong className="muted">-${discount.toFixed(2)}</strong>
                    </div>
                    <div className="cart__container__box__aside__box__price__row total">
                        <span>Subtotal</span>
                        <strong>${subtotal.toFixed(2)}</strong>
                    </div>
                </div>
                <hr />
                <div className="cart__container__box__aside__box__payment">
                    <h3>Payment method</h3>
                    <p>Choose your payment option in the next checkout step.</p>
                    <ul>
                        {paymentMethods.map((method) => (
                            <li key={method.label}>
                                <span>{method.icon}</span>
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
