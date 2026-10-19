import type { ChangeEvent } from "react";
import { useT } from "../../../hooks/useT";
import DeliveryQuoteForm from "../../shipping/components/DeliveryQuoteForm";
import type { DeliveryAddress, InternalDeliveryQuote, RoadPoint } from "../../shipping/types";
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
    invalidateQuoteKey: number;
    onAddressChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onQuoteChange: (address: DeliveryAddress | null, quote: InternalDeliveryQuote | null) => void;
    onCoordinatesConfirmed?: (point: RoadPoint, addressLine: string, city: string) => Promise<boolean>;
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
    invalidateQuoteKey,
    onAddressChange,
    onQuoteChange,
    onCoordinatesConfirmed,
}: Props) => {
    const t = useT();

    return (
        <section className="checkout__card">
            <div className="checkout__card__header">
                <h2><span>02</span>{t("checkout.shipping")}</h2>
                <p>{t("checkout.shippingDescription")}</p>
            </div>
            {uid && (savedAddresses.length > 0 || savedAddressesError || recentAddresses.length > 0 || recentAddressesError) ? (
                <div className="checkout__address-reuse-grid">
                    <label className="checkout__address-reuse">
                        {t("checkout.deliveryAddressLabel")}
                        <select
                            aria-label={t("checkout.deliveryAddressLabel")}
                            value={savedAddressPrefill?.key.startsWith("saved:")
                                ? `saved:${savedAddressPrefill.key.slice("saved:".length)}`
                                : recentAddressPrefill?.key.startsWith("recent:")
                                    ? `recent:${recentAddressPrefill.key.slice("recent:".length)}`
                                    : ""}
                            onChange={onAddressChange}
                        >
                            <option value="">{t("checkout.deliveryAddressPlaceholder")}</option>
                            {savedAddresses.length ? (
                                <optgroup label={t("checkout.savedAddressLabel")}>
                                    {savedAddresses.map((address) => (
                                        <option key={`saved:${address.id}`} value={`saved:${address.id}`}>{address.label}: {address.address_line}</option>
                                    ))}
                                </optgroup>
                            ) : null}
                            {recentAddresses.length ? (
                                <optgroup label={t("checkout.recentAddressLabel")}>
                                    {recentAddresses.map((address) => (
                                        <option key={`recent:${address.orderId}`} value={`recent:${address.orderId}`}>#{address.orderId}: {address.address}</option>
                                    ))}
                                </optgroup>
                            ) : null}
                        </select>
                    </label>
                </div>
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
                invalidateQuoteKey={invalidateQuoteKey}
                onQuoteChange={onQuoteChange}
                onCoordinatesConfirmed={onCoordinatesConfirmed}
            />
        </section>
    );
};

export default CheckoutDeliverySection;
