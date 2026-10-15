import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../../../utils/currency";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { fetchShippingProvinces, fetchShippingServices, fetchShippingWards, requestShippingQuote } from "../api";
import type { CarrierProvince, CarrierService, CarrierWard, DeliveryAddress, ShippingQuote } from "../types";
import "../../../styles/features/shipping/_shipping.scss";

type Props = {
    cart: Array<{ productId: number; quantity: number; price?: number; salePrice?: number | null }>;
    discountCode?: string | null;
    guest: boolean;
    addressPrefill?: { key: string; recipientName?: string; recipientPhone?: string; addressLine: string } | null;
    resetKey?: number;
    onQuoteChange: (address: DeliveryAddress | null, quote: ShippingQuote | null) => void;
};

const DeliveryQuoteForm = ({ cart, discountCode, guest, addressPrefill, resetKey = 0, onQuoteChange }: Props) => {
    const t = useT();
    const { locale } = useLocale();
    const [provinces, setProvinces] = useState<CarrierProvince[]>([]);
    const [wards, setWards] = useState<CarrierWard[]>([]);
    const [services, setServices] = useState<CarrierService[]>([]);
    const [provinceCode, setProvinceCode] = useState("");
    const [wardCode, setWardCode] = useState("");
    const [recipientName, setRecipientName] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");
    const [addressLine, setAddressLine] = useState("");
    const [serviceTypeId, setServiceTypeId] = useState("");
    const [quote, setQuote] = useState<ShippingQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const province = provinces.find((item) => item.code === provinceCode);
    const ward = wards.find((item) => item.code === wardCode);
    const cartKey = useMemo(() => JSON.stringify(cart.map(({ productId, quantity, price, salePrice }) => [productId, quantity, price, salePrice])), [cart]);
    const quoteInputKey = JSON.stringify([guest, recipientName, recipientPhone, addressLine, provinceCode, wardCode, serviceTypeId, discountCode, cartKey]);
    const quoteInputKeyRef = useRef(quoteInputKey);
    quoteInputKeyRef.current = quoteInputKey;

    useEffect(() => {
        if (!addressPrefill) return;
        setRecipientName(addressPrefill.recipientName || "");
        setRecipientPhone(addressPrefill.recipientPhone || "");
        setAddressLine(addressPrefill.addressLine);
        setProvinceCode("");
        setWardCode("");
        setServiceTypeId("");
    }, [addressPrefill, resetKey]);

    useEffect(() => {
        if (resetKey === 0) return;
        setQuote(null);
        onQuoteChange(null, null);
    }, [resetKey, onQuoteChange]);

    useEffect(() => {
        let active = true;
        void fetchShippingProvinces().then((items) => { if (active) setProvinces(items); }).catch(() => { if (active) setError(t("shipping.locationLoadError")); });
        return () => { active = false; };
    }, [t]);

    useEffect(() => {
        let active = true;
        setWards([]);
        setWardCode("");
        if (provinceCode) void fetchShippingWards(provinceCode).then((items) => { if (active) setWards(items); }).catch(() => { if (active) setError(t("shipping.locationLoadError")); });
        return () => { active = false; };
    }, [provinceCode, t]);

    useEffect(() => {
        let active = true;
        setServices([]);
        setServiceTypeId("");
        void fetchShippingServices().then((items) => { if (active) setServices(items); }).catch(() => { if (active) setError(t("shipping.servicesLoadError")); });
        return () => { active = false; };
    }, [t]);

    useEffect(() => {
        setQuote(null);
        onQuoteChange(null, null);
    }, [guest, recipientName, recipientPhone, addressLine, provinceCode, wardCode, serviceTypeId, discountCode, cartKey, onQuoteChange]);

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

    const handleQuote = async () => {
        setError("");
        if (!province || !ward || !recipientName.trim() || recipientPhone.trim().length < 7 || !addressLine.trim() || !serviceTypeId) {
            setError(t("shipping.completeAddress"));
            return;
        }
        const address: DeliveryAddress = {
            recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(), addressLine: addressLine.trim(),
            provinceCode: province.code, provinceName: province.name, wardCode: ward.code, wardName: ward.name,
            country: "VN",
        };
        setLoading(true);
        const requestKey = quoteInputKeyRef.current;
        try {
            const next = await requestShippingQuote({ address, locale, serviceTypeId: Number(serviceTypeId), discountCode: discountCode || undefined, ...(guest ? { cart: cart.map(({ productId, quantity }) => ({ productId, quantity })) } : {}) }, guest);
            if (requestKey !== quoteInputKeyRef.current) return;
            setQuote(next);
            onQuoteChange(address, next);
        } catch {
            if (requestKey !== quoteInputKeyRef.current) return;
            setError(t("shipping.quoteError"));
            setQuote(null);
            onQuoteChange(null, null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="shipping-quote" aria-labelledby="shipping-quote-title">
            <h3 id="shipping-quote-title">{t("shipping.deliveryDetails")}</h3>
            <div className="shipping-quote__grid">
                <label>{t("shipping.recipientName")}<input autoComplete="name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></label>
                <label>{t("shipping.recipientPhone")}<input type="tel" autoComplete="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} /></label>
                <label className="shipping-quote__wide">{t("shipping.addressLine")}<input autoComplete="street-address" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} /></label>
                <label>{t("shipping.province")}<select value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}><option value="">{t("shipping.selectProvince")}</option>{provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                <label>{t("shipping.ward")}<select value={wardCode} onChange={(event) => setWardCode(event.target.value)} disabled={!provinceCode}><option value="">{t("shipping.selectWard")}</option>{wards.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                <label>{t("shipping.service")}<select value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)}><option value="">{t("shipping.selectService")}</option>{services.map((item) => <option key={item.serviceTypeId} value={item.serviceTypeId}>{item.name}</option>)}</select></label>
            </div>
            {error ? <p className="shipping-quote__error" role="alert">{error}</p> : null}
            <button type="button" onClick={() => void handleQuote()} disabled={loading || !cart.length}>
                {loading ? t("shipping.quoting") : quote ? t("shipping.refreshQuote") : t("shipping.getQuote")}
            </button>
            {quote ? <div className="shipping-quote__result" role="status" aria-live="polite">
                <span>{t("shipping.merchandiseTotal")}: <strong>{formatCurrency(quote.pricing.itemsSubtotal)}</strong></span>
                <span>{t("shipping.merchandiseDiscount")}: <strong>−{formatCurrency(quote.pricing.merchandiseDiscount)}</strong></span>
                <span>{t("shipping.shippingFee")}: <strong>{formatCurrency(quote.pricing.shippingFee)}</strong></span>
                <span>{t("shipping.payableTotal")}: <strong>{formatCurrency(quote.pricing.payableTotal)}</strong></span>
                <small>{quote.sandbox ? t("shipping.sandboxQuote") : t("shipping.quoteExpires").replace("{time}", new Date(quote.expiresAt).toLocaleTimeString())}</small>
            </div> : <p className="shipping-quote__hint">{t("shipping.quoteRequired")}</p>}
        </section>
    );
};

export default DeliveryQuoteForm;
