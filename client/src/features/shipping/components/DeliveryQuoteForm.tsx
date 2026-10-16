import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../../../utils/currency";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { fetchDeliveryMapConfig, requestInternalDeliveryQuote } from "../api";
import type { DeliveryAddress, DeliveryMapConfig, InternalDeliveryQuote, RoadPoint } from "../types";
import DeliveryMapPicker from "./DeliveryMapPicker";
import "../../../styles/features/shipping/_shipping.scss";

type AddressPrefill = {
    key: string;
    recipientName?: string;
    recipientPhone?: string;
    addressLine: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
};

type Props = {
    cart: Array<{ productId: number; quantity: number; price?: number; salePrice?: number | null }>;
    discountCode?: string | null;
    guest: boolean;
    addressPrefill?: AddressPrefill | null;
    resetKey?: number;
    onQuoteChange: (address: DeliveryAddress | null, quote: InternalDeliveryQuote | null) => void;
};

const EMPTY_ROUTE: InternalDeliveryQuote["routeGeometry"] = [];

const DeliveryQuoteForm = ({ cart, discountCode, guest, addressPrefill, resetKey = 0, onQuoteChange }: Props) => {
    const t = useT();
    const { locale } = useLocale();
    const [recipientName, setRecipientName] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");
    const [addressLine, setAddressLine] = useState("");
    const [city, setCity] = useState("");
    const [destination, setDestination] = useState<RoadPoint | null>(null);
    const [mapConfig, setMapConfig] = useState<DeliveryMapConfig | null>(null);
    const [mapConfigLoading, setMapConfigLoading] = useState(true);
    const [mapConfigError, setMapConfigError] = useState("");
    const [quote, setQuote] = useState<InternalDeliveryQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const requestSequence = useRef(0);

    const cartKey = useMemo(() => JSON.stringify(cart.map(({ productId, quantity, price, salePrice }) => [productId, quantity, price, salePrice])), [cart]);
    const quoteInputKey = JSON.stringify([guest, recipientName, recipientPhone, addressLine, city, destination, discountCode, cartKey]);
    const quoteInputKeyRef = useRef(quoteInputKey);
    quoteInputKeyRef.current = quoteInputKey;

    const loadMapConfig = useCallback(async () => {
        setMapConfigLoading(true);
        setMapConfigError("");
        try {
            const config = await fetchDeliveryMapConfig();
            if (!config) throw new Error("Delivery map is not configured");
            setMapConfig(config);
        } catch {
            setMapConfig(null);
            setMapConfigError(t("shipping.mapUnavailable"));
        } finally {
            setMapConfigLoading(false);
        }
    }, [t]);

    useEffect(() => { void loadMapConfig(); }, [loadMapConfig]);

    useEffect(() => {
        if (!addressPrefill) return;
        setRecipientName(addressPrefill.recipientName || "");
        setRecipientPhone(addressPrefill.recipientPhone || "");
        setAddressLine(addressPrefill.addressLine);
        setCity(addressPrefill.city || "");
        const hasCoordinates = addressPrefill.latitude != null && addressPrefill.longitude != null;
        setDestination(hasCoordinates ? { latitude: Number(addressPrefill.latitude), longitude: Number(addressPrefill.longitude) } : null);
    }, [addressPrefill, resetKey]);

    useEffect(() => {
        requestSequence.current += 1;
        setLoading(false);
        setQuote(null);
        setError("");
        onQuoteChange(null, null);
    }, [quoteInputKey, onQuoteChange]);

    useEffect(() => {
        if (resetKey === 0) return;
        setQuote(null);
        onQuoteChange(null, null);
    }, [resetKey, onQuoteChange]);

    useEffect(() => {
        if (!quote) return;
        const delay = Date.parse(quote.expiresAt) - Date.now();
        if (delay <= 0) {
            setQuote(null);
            onQuoteChange(null, null);
            return;
        }
        const timeout = window.setTimeout(() => {
            setQuote(null);
            onQuoteChange(null, null);
        }, delay);
        return () => window.clearTimeout(timeout);
    }, [quote, onQuoteChange]);

    const handleDestinationChange = useCallback((point: RoadPoint | null) => {
        setDestination(point);
    }, []);

    const handleQuote = async () => {
        setError("");
        if (!recipientName.trim() || recipientPhone.trim().length < 7 || !addressLine.trim() || !city.trim()) {
            setError(t("shipping.completeAddress"));
            return;
        }
        if (!destination) {
            setError(t("shipping.chooseMapPin"));
            return;
        }
        if (!mapConfig) {
            setError(mapConfigError || t("shipping.mapUnavailable"));
            return;
        }

        const address: DeliveryAddress = {
            recipientName: recipientName.trim(),
            recipientPhone: recipientPhone.trim(),
            addressLine: addressLine.trim(),
            city: city.trim(),
            country: "VN",
            latitude: destination.latitude,
            longitude: destination.longitude,
        };
        const requestId = ++requestSequence.current;
        const requestKey = quoteInputKeyRef.current;
        setLoading(true);
        try {
            const next = await requestInternalDeliveryQuote({
                address,
                locale,
                discountCode: discountCode || undefined,
                ...(guest ? { cart: cart.map(({ productId, quantity }) => ({ productId, quantity })) } : {}),
            }, guest);
            if (requestId !== requestSequence.current || requestKey !== quoteInputKeyRef.current) return;
            setQuote(next);
            onQuoteChange(address, next);
        } catch {
            if (requestId !== requestSequence.current || requestKey !== quoteInputKeyRef.current) return;
            setError(t("shipping.quoteError"));
            setQuote(null);
            onQuoteChange(null, null);
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    };

    const mapDestination = quote?.destination ?? destination;
    const route = quote?.routeGeometry ?? EMPTY_ROUTE;
    const tileUrl = quote?.tileUrl ?? mapConfig?.tileUrl;
    const tileAttribution = quote?.tileAttribution ?? mapConfig?.tileAttribution;

    return (
        <section className="shipping-quote" aria-labelledby="shipping-quote-title">
            <h3 id="shipping-quote-title">{t("shipping.deliveryDetails")}</h3>
            <div className="shipping-quote__grid">
                <label>
                    <span>{t("shipping.recipientName")}</span>
                    <input autoComplete="name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
                </label>
                <label>
                    <span>{t("shipping.recipientPhone")}</span>
                    <input type="tel" autoComplete="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} />
                </label>
                <label className="shipping-quote__wide">
                    <span>{t("shipping.addressLine")}</span>
                    <input autoComplete="street-address" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} />
                </label>
                <label className="shipping-quote__wide">
                    <span>{t("shipping.city")}</span>
                    <input autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} />
                </label>
            </div>
            {mapConfigLoading ? <p role="status" aria-live="polite">{t("shipping.mapLoading")}</p> : null}
            {mapConfigError ? (
                <div className="shipping-quote__map-error">
                    <p role="alert">{mapConfigError}</p>
                    <button type="button" className="shipping-quote__secondary" onClick={() => void loadMapConfig()} disabled={mapConfigLoading}>
                        {t("shipping.retryMap")}
                    </button>
                </div>
            ) : null}
            {mapConfig && tileUrl && tileAttribution ? (
                <DeliveryMapPicker
                    store={quote?.origin ?? mapConfig.origin}
                    storeAddress={mapConfig.storeAddress}
                    destination={mapDestination}
                    route={route}
                    tileUrl={tileUrl}
                    tileAttribution={tileAttribution}
                    onDestinationChange={handleDestinationChange}
                />
            ) : null}
            {error ? <p className="shipping-quote__error" role="alert">{error}</p> : null}
            <button type="button" onClick={() => void handleQuote()} disabled={loading || mapConfigLoading || !mapConfig || !cart.length}>
                {loading ? t("shipping.quoting") : quote ? t("shipping.refreshQuote") : t("shipping.getQuote")}
            </button>
            {quote ? <div className="shipping-quote__result" role="status" aria-live="polite">
                <span>{t("shipping.roadDistance")}: <strong>{(quote.distanceMeters / 1000).toFixed(1)} km</strong></span>
                <span>{t("shipping.merchandiseTotal")}: <strong>{formatCurrency(quote.pricing.itemsSubtotal)}</strong></span>
                <span>{t("shipping.merchandiseDiscount")}: <strong>−{formatCurrency(quote.pricing.merchandiseDiscount)}</strong></span>
                <span>{t("shipping.shippingFee")}: <strong>{formatCurrency(quote.pricing.shippingFee)}</strong></span>
                <span>{t("shipping.payableTotal")}: <strong>{formatCurrency(quote.pricing.payableTotal)}</strong></span>
                <small>{t("shipping.quoteExpires").replace("{time}", new Date(quote.expiresAt).toLocaleTimeString())}</small>
            </div> : <p className="shipping-quote__hint">{t("shipping.quoteRequired")}</p>}
        </section>
    );
};

export default DeliveryQuoteForm;
