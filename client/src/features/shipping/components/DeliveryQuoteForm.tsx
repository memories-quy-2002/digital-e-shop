import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../../../utils/currency";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { fetchDeliveryMapConfig, findDeliveryAddressLocations, requestInternalDeliveryQuote, type DeliveryAddressSuggestion } from "../api";
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
    invalidateQuoteKey?: number;
    onQuoteChange: (address: DeliveryAddress | null, quote: InternalDeliveryQuote | null) => void;
    onCoordinatesConfirmed?: (point: RoadPoint, addressLine: string, city: string) => Promise<boolean>;
};

const EMPTY_ROUTE: InternalDeliveryQuote["routeGeometry"] = [];

const DeliveryQuoteForm = ({ cart, discountCode, guest, addressPrefill, resetKey = 0, invalidateQuoteKey = 0, onQuoteChange, onCoordinatesConfirmed }: Props) => {
    const t = useT();
    const { locale } = useLocale();
    const [recipientName, setRecipientName] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");
    const [addressLine, setAddressLine] = useState("");
    const [city, setCity] = useState("");
    const [addressInput, setAddressInput] = useState("");
    const [destination, setDestination] = useState<RoadPoint | null>(null);
    const [mapConfig, setMapConfig] = useState<DeliveryMapConfig | null>(null);
    const [mapConfigLoading, setMapConfigLoading] = useState(true);
    const [mapConfigError, setMapConfigError] = useState("");
    const [mapConfigNeedsRetry, setMapConfigNeedsRetry] = useState(false);
    const [quote, setQuote] = useState<InternalDeliveryQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [locationSuggestions, setLocationSuggestions] = useState<DeliveryAddressSuggestion[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [locationSearchError, setLocationSearchError] = useState("");
    const [locationSaveMessage, setLocationSaveMessage] = useState("");
    const [manualMapOpen, setManualMapOpen] = useState(false);
    const requestSequence = useRef(0);
    const locationRequestSequence = useRef(0);

    const cartKey = useMemo(() => JSON.stringify(cart.map(({ productId, quantity, price, salePrice }) => [productId, quantity, price, salePrice])), [cart]);
    const quoteInputKey = JSON.stringify([guest, recipientName, recipientPhone, addressInput, addressLine, city, destination, discountCode, cartKey]);
    const quoteInputKeyRef = useRef(quoteInputKey);
    quoteInputKeyRef.current = quoteInputKey;

    const loadMapConfig = useCallback(async () => {
        setMapConfigLoading(true);
        setMapConfigError("");
        setMapConfigNeedsRetry(false);
        try {
            const config = await fetchDeliveryMapConfig();
            if (!config) {
                setMapConfig(null);
                setMapConfigError(t("shipping.mapNotConfigured"));
                return;
            }
            setMapConfig(config);
        } catch {
            setMapConfig(null);
            setMapConfigError(t("shipping.mapUnavailable"));
            setMapConfigNeedsRetry(true);
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
        setAddressInput([addressPrefill.addressLine, addressPrefill.city].filter(Boolean).join(", "));
        const hasCoordinates = addressPrefill.latitude != null && addressPrefill.longitude != null;
        setDestination(hasCoordinates ? { latitude: Number(addressPrefill.latitude), longitude: Number(addressPrefill.longitude) } : null);
        setLocationSuggestions([]);
        setLocationSearchError("");
        setLocationSaveMessage("");
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
        if (invalidateQuoteKey === 0) return;
        requestSequence.current += 1;
        setLoading(false);
        setQuote(null);
        setError(t("shipping.quoteInvalidated"));
        onQuoteChange(null, null);
    }, [invalidateQuoteKey, onQuoteChange, t]);

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
        if (point) {
            setAddressLine((current) => current || addressInput.trim());
            const typedLocality = addressInput.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
            setCity((current) => current || typedLocality || addressPrefill?.city || "Vietnam");
        }
    }, [addressInput, addressPrefill?.city]);

    useEffect(() => {
        const query = addressInput.trim();
        const requestId = ++locationRequestSequence.current;
        if (query.length < 3 || destination) {
            setLocationSuggestions([]);
            setLocationSearchError("");
            setLocationSearchLoading(false);
            return;
        }
        setLocationSearchError("");
        const timeout = window.setTimeout(async () => {
            setLocationSearchLoading(true);
            try {
                const suggestions = await findDeliveryAddressLocations({ addressLine: query, city: "", locale });
                if (requestId !== locationRequestSequence.current) return;
                setLocationSuggestions(suggestions);
                if (!suggestions.length) setLocationSearchError(t("shipping.locationNoResults"));
            } catch {
                if (requestId === locationRequestSequence.current) setLocationSearchError(t("shipping.locationLookupError"));
            } finally {
                if (requestId === locationRequestSequence.current) setLocationSearchLoading(false);
            }
        }, 450);
        return () => window.clearTimeout(timeout);
    }, [addressInput, destination, locale, t]);

    const selectAddressLocation = async (suggestion: DeliveryAddressSuggestion) => {
        locationRequestSequence.current += 1;
        const point = { latitude: suggestion.latitude, longitude: suggestion.longitude };
        const typedLocality = addressInput.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
        const selectedCity = suggestion.city || suggestion.state || typedLocality || addressPrefill?.city || "Vietnam";
        setAddressInput(suggestion.label);
        setAddressLine(suggestion.label);
        setCity(selectedCity);
        setDestination(point);
        setLocationSuggestions([]);
        setLocationSearchError("");
        setLocationSaveMessage("");
        setManualMapOpen(true);
        if (!guest && onCoordinatesConfirmed) {
            try {
                const saved = await onCoordinatesConfirmed(point, suggestion.label, selectedCity);
                setLocationSaveMessage(t(saved ? "shipping.locationSaved" : "shipping.locationSessionOnly"));
            } catch {
                setLocationSaveMessage(t("shipping.locationSaveError"));
            }
        }
    };

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
                <label className="shipping-quote__grid-wide">
                    <span>{t("shipping.deliveryAddress")}</span>
                    <input autoComplete="street-address" value={addressInput} aria-autocomplete="list" aria-controls="delivery-address-suggestions" aria-expanded={locationSuggestions.length > 0} onChange={(event) => { setAddressInput(event.target.value); setAddressLine(""); setCity(""); setDestination(null); setLocationSuggestions([]); setLocationSearchError(""); setLocationSaveMessage(""); }} />
                </label>
            </div>
            {!destination && addressInput.trim().length >= 3 ? (
                <div className="shipping-quote__location-lookup">
                    <p>{t("shipping.locationLookupPrivacy")}</p>
                    {locationSearchLoading ? <p className="shipping-quote__location-status" role="status" aria-live="polite">{t("shipping.locationSearching")}</p> : null}
                    {locationSearchError ? <p role={locationSearchError === t("shipping.locationLookupError") ? "alert" : "status"}>{locationSearchError}</p> : null}
                    {locationSuggestions.length ? (
                        <div id="delivery-address-suggestions" className="shipping-quote__location-results" role="listbox" aria-label={t("shipping.locationSuggestions")}>
                            {locationSuggestions.map((suggestion, index) => (
                                <button key={`${suggestion.latitude}:${suggestion.longitude}:${index}`} type="button" role="option" aria-selected="false" onClick={() => void selectAddressLocation(suggestion)}>
                                    <span>{suggestion.label}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {locationSaveMessage ? <p role="status">{locationSaveMessage}</p> : null}
                </div>
            ) : locationSaveMessage ? <p className="shipping-quote__location-status" role="status">{locationSaveMessage}</p> : null}
            {mapConfigLoading ? <p role="status" aria-live="polite">{t("shipping.mapLoading")}</p> : null}
            {mapConfigError ? (
                <div className="shipping-quote__map-error">
                    <p role="alert">{mapConfigError}</p>
                    {mapConfigNeedsRetry ? (
                        <button type="button" className="shipping-quote__secondary" onClick={() => void loadMapConfig()} disabled={mapConfigLoading}>
                            {t("shipping.retryMap")}
                        </button>
                    ) : null}
                </div>
            ) : null}
            {mapConfig && tileUrl && tileAttribution ? (
                <details className="shipping-quote__manual-location" open={manualMapOpen} onToggle={(event) => setManualMapOpen(event.currentTarget.open)}>
                    <summary>{t("shipping.locationManualAdjust")}</summary>
                <DeliveryMapPicker
                    store={quote?.origin ?? mapConfig.origin}
                    storeAddress={mapConfig.storeAddress}
                    destination={mapDestination}
                    route={route}
                    tileUrl={tileUrl}
                    tileAttribution={tileAttribution}
                    onDestinationChange={handleDestinationChange}
                />
                </details>
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
            </div> : !mapConfigError ? <p className="shipping-quote__hint">{t("shipping.quoteRequired")}</p> : null}
        </section>
    );
};

export default DeliveryQuoteForm;
