import type { ChangeEvent } from "react";
import { useT } from "../../../hooks/useT";
import DeliveryQuoteForm from "../../shipping/components/DeliveryQuoteForm";
import type { DeliveryAddress, InternalDeliveryQuote } from "../../shipping/types";
import type { CustomerAddress } from "../../users/types";
import type { RecentOrderAddress } from "../shippingAddress";
import type { CheckoutCartItem } from "../types";

export type DeliveryAddressPrefill = {
    key: string;
    recipientName?: string;
    recipientPhone?: string;
    addressLine: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
};

type Props = {
    uid: string;
    cart: CheckoutCartItem[];
    discountCode: string | null;
    savedAddresses: CustomerAddress[];
    recentAddresses: RecentOrderAddress[];
    savedAddressesError: boolean;
    recentAddressesError: boolean;
    savedAddressPrefill: DeliveryAddressPrefill | null;
    recentAddressPrefill: DeliveryAddressPrefill | null;
    resetKey: number;
    onSavedAddressChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onRecentAddressChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onQuoteChange: (address: DeliveryAddress | null, quote: InternalDeliveryQuote | null) => void;
};

const CheckoutDeliverySection = ({
    uid,
    cart,
    discountCode,
    savedAddresses,
    recentAddresses,
    savedAddressesError,
    recentAddressesError,
    savedAddressPrefill,
    recentAddressPrefill,
    resetKey,
    onSavedAddressChange,
    onRecentAddressChange,
    onQuoteChange,
}: Props) => {
    const t = useT();

    return (
        <section className="checkout__card">
            <div className="checkout__card__header">
                <h2><span>02</span>{t("checkout.shipping")}</h2>
                <p>{t("checkout.shippingDescription")}</p>
            </div>
            {uid && (savedAddresses.length > 0 || savedAddressesError) ? (
                <label className="checkout__address-reuse">
                    {t("checkout.savedAddressLabel")}
                    <select
                        aria-label={t("checkout.savedAddressLabel")}
                        value={savedAddressPrefill?.key.startsWith("saved:") ? savedAddressPrefill.key.slice("saved:".length) : ""}
                        onChange={onSavedAddressChange}
                    >
                        <option value="">{t("checkout.savedAddressPlaceholder")}</option>
                        {savedAddresses.map((address) => (
                            <option key={address.id} value={address.id}>{address.label}: {address.address_line}</option>
                        ))}
                    </select>
                </label>
            ) : null}
            {uid && (recentAddresses.length > 0 || recentAddressesError) ? (
                <label className="checkout__address-reuse">
                    {t("checkout.recentAddressLabel")}
                    <select
                        aria-label={t("checkout.recentAddressLabel")}
                        value={recentAddressPrefill?.key.startsWith("recent:") ? recentAddressPrefill.key.slice("recent:".length) : ""}
                        onChange={onRecentAddressChange}
                    >
                        <option value="">{t("checkout.recentAddressPlaceholder")}</option>
                        {recentAddresses.map((address) => (
                            <option key={address.orderId} value={address.orderId}>#{address.orderId}: {address.address}</option>
                        ))}
                    </select>
                </label>
            ) : null}
            {savedAddressesError ? <p role="status" aria-live="polite">{t("checkout.savedAddressesError")}</p> : null}
            {recentAddressesError ? <p role="status" aria-live="polite">{t("checkout.recentAddressesError")}</p> : null}
            <DeliveryQuoteForm
                cart={cart.map(({ productId, quantity, price, sale_price }) => ({
                    productId,
                    quantity,
                    price,
                    salePrice: sale_price,
                }))}
                discountCode={discountCode}
                guest={!uid}
                addressPrefill={savedAddressPrefill || recentAddressPrefill}
                resetKey={resetKey}
                onQuoteChange={onQuoteChange}
            />
        </section>
    );
};

export default CheckoutDeliverySection;
