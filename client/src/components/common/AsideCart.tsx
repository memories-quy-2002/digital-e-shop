import { BsBank } from "react-icons/bs";
import { FaBitcoin, FaCcVisa } from "react-icons/fa";
import React, { useState } from "react";
type AsideCartProps = {
    totalPrice: number;
    discount: number;
    subtotal: number;
    error: string;
    applyDiscount: (discountCode: string, totalPrice: number) => void;
};

const paymentIcon: any = [<BsBank size={36} />, <FaCcVisa size={36} />, <FaBitcoin size={36} />];

const AsideCart = ({ totalPrice, discount, subtotal, error, applyDiscount }: AsideCartProps) => {
    const [discountCode, setDiscountCode] = useState<string>("");
    const onChangeDiscountCode = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setDiscountCode(value);
    };
    return (
        <aside className="cart__container__box__aside">
            <div className="cart__container__box__aside__box">
                <div className="cart__container__box__aside__box__coupon">
                    <h4 className="cart__container__box__aside__box__coupon__title">Have coupon?</h4>
                    <p className="cart__container__box__aside__box__coupon__hint">
                        Enter your code and apply to see instant savings.
                    </p>
                    <div className="cart__container__box__aside__box__coupon__input">
                        <input
                            type="text"
                            aria-label="couponInput"
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
                    <p className="cart__container__box__aside__box__coupon__error">{error}</p>
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
                    <h4>Payment method</h4>
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
                            {paymentIcon.map((icon, index) => (
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
