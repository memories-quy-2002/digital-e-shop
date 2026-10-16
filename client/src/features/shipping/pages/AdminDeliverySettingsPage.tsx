import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import { useT } from "../../../hooks/useT";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { fetchAdminDeliverySettings, updateAdminDeliverySettings } from "../api";
import type { DeliverySettingsConfig, RoadPoint } from "../types";
import DeliveryMapPicker from "../components/DeliveryMapPicker";
import "../../../styles/features/shipping/_shipping.scss";

type Draft = {
    storeAddress: string;
    storeLatitude: number | null;
    storeLongitude: number | null;
    fee5To20Vnd: string;
    feeOver20Vnd: string;
    routingEndpoint: string;
    tileUrl: string;
    tileAttribution: string;
};

const DEFAULT_MAP_CENTER: RoadPoint = { latitude: 16, longitude: 106 };
const EMPTY_ROUTE: Array<[longitude: number, latitude: number]> = [];

const createDraft = (config: DeliverySettingsConfig): Draft => {
    const settings = config.settings;
    return {
        storeAddress: settings?.storeAddress || "",
        storeLatitude: settings?.storeLatitude ?? null,
        storeLongitude: settings?.storeLongitude ?? null,
        fee5To20Vnd: settings ? String(settings.fee5To20Vnd) : "",
        feeOver20Vnd: settings ? String(settings.feeOver20Vnd) : "",
        routingEndpoint: settings && config.allowedRoutingEndpoints.includes(settings.routingEndpoint)
            ? settings.routingEndpoint : config.allowedRoutingEndpoints[0] || "",
        tileUrl: settings && config.allowedTileUrls.includes(settings.tileUrl)
            ? settings.tileUrl : config.allowedTileUrls[0] || "",
        tileAttribution: settings?.tileAttribution || "",
    };
};

const AdminDeliverySettingsPage = () => {
    const t = useT();
    const [config, setConfig] = useState<DeliverySettingsConfig | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadSettings = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const result = await fetchAdminDeliverySettings();
            setConfig(result);
            setDraft(createDraft(result));
        } catch {
            setConfig(null);
            setDraft(null);
            setError(t("shipping.settingsLoadError"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { void loadSettings(); }, [loadSettings]);

    const handlePinChange = (point: RoadPoint | null) => {
        setDraft((current) => current ? {
            ...current,
            storeLatitude: point?.latitude ?? null,
            storeLongitude: point?.longitude ?? null,
        } : current);
    };

    const handleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!draft || draft.storeLatitude === null || draft.storeLongitude === null) {
            setError(t("shipping.chooseStorePin"));
            return;
        }
        const middleFee = Number(draft.fee5To20Vnd);
        const highFee = Number(draft.feeOver20Vnd);
        if (!Number.isSafeInteger(middleFee) || !Number.isSafeInteger(highFee) || middleFee < 0 || highFee <= middleFee) {
            setError(t("shipping.invalidFeeBands"));
            return;
        }
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const saved = await updateAdminDeliverySettings({
                storeAddress: draft.storeAddress.trim(),
                storeLatitude: draft.storeLatitude,
                storeLongitude: draft.storeLongitude,
                fee5To20Vnd: Number(draft.fee5To20Vnd),
                feeOver20Vnd: Number(draft.feeOver20Vnd),
                routingEndpoint: draft.routingEndpoint,
                tileUrl: draft.tileUrl,
                tileAttribution: draft.tileAttribution.trim(),
            });
            setConfig((current) => current ? { ...current, settings: saved } : current);
            setNotice(t("shipping.settingsSaved"));
        } catch (failure) {
            setError(getApiErrorMessage(failure, t("shipping.settingsSaveError")));
        } finally {
            setSaving(false);
        }
    };

    return <AdminLayout>
        <Helmet><title>{t("shipping.settingsTitle")}</title></Helmet>
        <main className="admin__page shipping-admin">
            <header className="admin__page__header">
                <div>
                    <span className="admin__page__eyebrow">{t("shipping.fulfillment")}</span>
                    <h1 className="admin__page__title">{t("shipping.settingsTitle")}</h1>
                    <p className="admin__page__subtitle">{t("shipping.settingsDescription")}</p>
                </div>
                <button type="button" className="admin__button admin__button--ghost" onClick={() => void loadSettings()} disabled={loading || saving}>{t("shipping.refresh")}</button>
            </header>
            {notice ? <p className="shipping-admin__notice" role="status">{notice}</p> : null}
            {error ? <div className="shipping-admin__notice shipping-admin__notice--error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadSettings()} disabled={loading}>{t("shipping.retry")}</button></div> : null}
            {loading ? <p role="status" aria-live="polite">{t("shipping.settingsLoading")}</p> : null}
            {draft && config && !loading ? <form className="delivery-settings" onSubmit={handleSave}>
                <fieldset disabled={saving}>
                    <legend>{t("shipping.storeLocation")}</legend>
                    <label>
                        {t("shipping.storeAddress")}
                        <input required maxLength={255} value={draft.storeAddress} onChange={(event) => setDraft({ ...draft, storeAddress: event.target.value })} />
                    </label>
                    {config.allowedTileUrls.length > 0 && draft.tileAttribution.trim() ? <DeliveryMapPicker
                        store={config.settings ? { latitude: config.settings.storeLatitude, longitude: config.settings.storeLongitude } : DEFAULT_MAP_CENTER}
                        storeAddress={draft.storeAddress || t("shipping.chooseStorePin")}
                        destination={draft.storeLatitude !== null && draft.storeLongitude !== null
                            ? { latitude: draft.storeLatitude, longitude: draft.storeLongitude }
                            : null}
                        route={EMPTY_ROUTE}
                        tileUrl={draft.tileUrl || config.allowedTileUrls[0]}
                        tileAttribution={draft.tileAttribution || ""}
                        onDestinationChange={handlePinChange}
                        initialZoom={config.settings ? 13 : 6}
                        showStoreMarker={false}
                        pinKind="store"
                        destinationLabel={t("shipping.storePin")}
                        mapTitle={t("shipping.storePin")}
                        instruction={t("shipping.storePinInstruction")}
                    /> : config.allowedTileUrls.length === 0
                        ? <p role="alert">{t("shipping.noAllowedTileUrls")}</p>
                        : <p role="status">{t("shipping.mapPreviewNeedsAttribution")}</p>}
                    <p className="shipping-admin__help">{t("shipping.settingsAllowlistHelp")}</p>
                </fieldset>
                <fieldset disabled={saving}>
                    <legend>{t("shipping.deliveryPricing")}</legend>
                    <div className="delivery-settings__grid">
                        <label>
                            {t("shipping.fee5To20")}
                            <input type="number" min="0" step="1" required value={draft.fee5To20Vnd} onChange={(event) => setDraft({ ...draft, fee5To20Vnd: event.target.value })} />
                        </label>
                        <label>
                            {t("shipping.feeOver20")}
                            <input type="number" min="0" step="1" required value={draft.feeOver20Vnd} onChange={(event) => setDraft({ ...draft, feeOver20Vnd: event.target.value })} />
                        </label>
                    </div>
                    <p>{t("shipping.freeUnder5")}</p>
                </fieldset>
                <fieldset disabled={saving}>
                    <legend>{t("shipping.mapAndRouting")}</legend>
                    <div className="delivery-settings__grid">
                        <label>
                            {t("shipping.routingEndpoint")}
                            <select required value={draft.routingEndpoint} onChange={(event) => setDraft({ ...draft, routingEndpoint: event.target.value })}>
                                {config.allowedRoutingEndpoints.map((endpoint) => <option key={endpoint} value={endpoint}>{endpoint}</option>)}
                            </select>
                        </label>
                        <label>
                            {t("shipping.tileUrl")}
                            <select required value={draft.tileUrl} onChange={(event) => setDraft({ ...draft, tileUrl: event.target.value })}>
                                {config.allowedTileUrls.map((url) => <option key={url} value={url}>{url}</option>)}
                            </select>
                        </label>
                    </div>
                    <label>
                        {t("shipping.tileAttribution")}
                        <input required maxLength={512} value={draft.tileAttribution} onChange={(event) => setDraft({ ...draft, tileAttribution: event.target.value })} />
                    </label>
                </fieldset>
                <button className="admin__button admin__button--primary" type="submit" disabled={saving || config.allowedRoutingEndpoints.length === 0 || config.allowedTileUrls.length === 0}>
                    {saving ? t("shipping.settingsSaving") : t("shipping.saveSettings")}
                </button>
            </form> : null}
        </main>
    </AdminLayout>;
};

export default AdminDeliverySettingsPage;
