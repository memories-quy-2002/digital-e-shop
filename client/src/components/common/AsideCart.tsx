import { BsBank, BsCreditCard2Front, BsCurrencyBitcoin } from "react-icons/bs";
import React, { useState } from "react";

type AsideCartProps = {
    totalPrice: number;
    discount: number;
    subtotal: number;
    applyDiscount: (discountCode: string, totalPrice: number) => void;
};

const paymentIcon: React.ReactNode[] = [
    <BsBank key="bank" size={36} aria-hidden />,
    <BsCreditCard2Front key="card" size={36} aria-hidden />,
    <BsCurrencyBitcoin key="crypto" size={36} aria-hidden />,
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
                    <div>
                        <ul
                            style={{
                                listStyleType: "none",
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-around",
                                padding: "0",
                            }}
                        >
                            {paymentIcon.map((icon: any, index: number) => (
                                <li style={{ cursor: "pointer" }} key={index}>
                                    {icon}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default AsideCart;
