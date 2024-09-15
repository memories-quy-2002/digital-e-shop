import { BsBank } from "react-icons/bs";
import { FaBitcoin, FaCcVisa } from "react-icons/fa";
import { useState } from "react";
import { useToast } from "../../context/ToastContext";
type AsideCartProps = {
    totalPrice: number;
    discount: number;
    subtotal: number;
    error: string;
    applyDiscount: (discountCode: string, totalPrice: number) => void;
};

const paymentMethods: any[] = [<BsBank size={36} />, <FaCcVisa size={36} />, <FaBitcoin size={36} />];

const AsideCart = ({ totalPrice, discount, subtotal, error, applyDiscount }: AsideCartProps) => {
    const [discountCode, setDiscountCode] = useState<string>("");
    const onChangeDiscountCode = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setDiscountCode(value);
    };
    return (
        <div className="cart__container__box__aside">
            <div className="cart__container__box__aside__box">
                <div className="cart__container__box__aside__box__coupon">
                    <h4 className="cart__container__box__aside__box__coupon__title">Have coupon?</h4>
                    <div className="cart__container__box__aside__box__coupon__input">
                        <input
                            type="text"
                            name="coupon"
                            id="coupon"
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
                    <p className="text-danger mb-2">{error}</p>
                </div>
                <hr />
                <div className="cart__container__box__aside__box__price">
                    <ul className="cart__container__box__aside__box__price__list">
                        <li>
                            <p>Total price: </p>
                            <p>${totalPrice.toFixed(2)}</p>
                        </li>
                        <li>
                            <p>Discount: </p>
                            <p>${discount.toFixed(2)}</p>
                        </li>
                        <li
                            style={{
                                fontWeight: "bold",
                                fontSize: "18px",
                            }}
                        >
                            <p>Subtotal: </p>
                            <p>${subtotal.toFixed(2)}</p>
                        </li>
                    </ul>
                </div>
                <hr />
                <div className="cart__container__box__aside__box__payment">
                    <h6>Payment method</h6>
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
                            {paymentMethods.map((icon, index) => (
                                <li style={{ cursor: "pointer" }} key={index}>
                                    {icon}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AsideCart;
