import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { useT } from "../../../hooks/useT";
import type { RoadPoint } from "../types";
import "leaflet/dist/leaflet.css";
import "../../../styles/features/shipping/_shipping.scss";

type Props = {
    store: RoadPoint;
    storeAddress: string;
    destination: RoadPoint | null;
    route: Array<[longitude: number, latitude: number]>;
    tileUrl: string;
    tileAttribution: string;
    onDestinationChange: (point: RoadPoint | null) => void;
    initialZoom?: number;
    showStoreMarker?: boolean;
    pinKind?: "store" | "destination";
    destinationLabel?: string;
    mapTitle?: string;
    instruction?: string;
};

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] || character);

const DeliveryMapPicker = ({
    store,
    storeAddress,
    destination,
    route,
    tileUrl,
    tileAttribution,
    onDestinationChange,
    initialZoom = 13,
    showStoreMarker = true,
    pinKind = "destination",
    destinationLabel,
    mapTitle,
    instruction,
}: Props) => {
    const t = useT();
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Leaflet.Map | null>(null);
    const destinationMarkerRef = useRef<Leaflet.Marker | null>(null);
    const routeRef = useRef<Leaflet.Polyline | null>(null);
    const onDestinationChangeRef = useRef(onDestinationChange);
    const [latitudeInput, setLatitudeInput] = useState(destination ? String(destination.latitude) : "");
    const [longitudeInput, setLongitudeInput] = useState(destination ? String(destination.longitude) : "");
    const [mapReady, setMapReady] = useState(false);

    onDestinationChangeRef.current = onDestinationChange;

    useEffect(() => {
        setLatitudeInput(destination ? String(destination.latitude) : "");
        setLongitudeInput(destination ? String(destination.longitude) : "");
    }, [destination]);

    useEffect(() => {
        const container = mapContainerRef.current;
        if (!container) return;
        let disposed = false;
        let map: Leaflet.Map | null = null;

        void import("leaflet").then((L) => {
            if (disposed || !mapContainerRef.current) return;
            map = L.map(container, { keyboard: true, zoomControl: true, attributionControl: true })
                .setView([store.latitude, store.longitude], initialZoom);
            L.tileLayer(tileUrl, { attribution: escapeHtml(tileAttribution), maxZoom: 19 }).addTo(map);
            if (showStoreMarker) {
                L.marker([store.latitude, store.longitude], {
                    keyboard: true,
                    title: storeAddress,
                    alt: t("shipping.storeMarker"),
                    icon: L.divIcon({ className: "delivery-map__marker delivery-map__marker--store", html: "", iconSize: [24, 24], iconAnchor: [12, 12] }),
                }).addTo(map);
            }

            map.on("click", (event: Leaflet.LeafletMouseEvent) => {
                onDestinationChangeRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng });
            });
            mapRef.current = map;
            setMapReady(true);
        }).catch(() => {
            if (!disposed) setMapReady(false);
        });

        return () => {
            disposed = true;
            if (map) {
                map.off();
                map.remove();
            }
            destinationMarkerRef.current?.off();
            routeRef.current?.remove();
            mapRef.current = null;
            destinationMarkerRef.current = null;
            routeRef.current = null;
            setMapReady(false);
        };
    }, [initialZoom, showStoreMarker, store.latitude, store.longitude, storeAddress, tileUrl, tileAttribution, t]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        void import("leaflet").then((L) => {
            if (mapRef.current !== map) return;
            if (destination) {
                if (!destinationMarkerRef.current) {
                    const marker = L.marker([destination.latitude, destination.longitude], {
                        draggable: true,
                        keyboard: true,
                        title: destinationLabel || t("shipping.destinationMarker"),
                        alt: destinationLabel || t("shipping.destinationMarker"),
                        icon: L.divIcon({ className: `delivery-map__marker delivery-map__marker--${pinKind}`, html: "", iconSize: [24, 24], iconAnchor: [12, 12] }),
                    }).addTo(map);
                    marker.on("dragend", () => {
                        const point = marker.getLatLng();
                        onDestinationChangeRef.current({ latitude: point.lat, longitude: point.lng });
                    });
                    destinationMarkerRef.current = marker;
                } else {
                    destinationMarkerRef.current.setLatLng([destination.latitude, destination.longitude]);
                }
            } else {
                destinationMarkerRef.current?.off();
                destinationMarkerRef.current?.remove();
                destinationMarkerRef.current = null;
            }

            const routePoints = route.map(([longitude, latitude]) => [latitude, longitude] as Leaflet.LatLngTuple);
            if (routePoints.length > 1) {
                if (!routeRef.current) {
                    routeRef.current = L.polyline(routePoints, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(map);
                } else {
                    routeRef.current.setLatLngs(routePoints);
                }
                map.fitBounds(L.latLngBounds(routePoints).pad(0.15), { maxZoom: 15 });
            } else {
                routeRef.current?.remove();
                routeRef.current = null;
            }
        });
    }, [destination, destinationLabel, mapReady, pinKind, route, t]);

    const updateCoordinate = (axis: "latitude" | "longitude", value: string) => {
        if (axis === "latitude") setLatitudeInput(value);
        else setLongitudeInput(value);

        const latitudeText = axis === "latitude" ? value : latitudeInput;
        const longitudeText = axis === "longitude" ? value : longitudeInput;
        const latitude = Number(latitudeText);
        const longitude = Number(longitudeText);
        if (!latitudeText.trim() || !longitudeText.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            onDestinationChange(null);
            return;
        }
        onDestinationChange({ latitude, longitude });
    };

    return (
        <div className="delivery-map" role="region" aria-labelledby="delivery-map-title">
            <div className="delivery-map__header">
                <div>
                    <h4 id="delivery-map-title">{mapTitle || t("shipping.mapTitle")}</h4>
                    <p>{instruction || t("shipping.mapInstruction")}</p>
                </div>
                {showStoreMarker ? <span className="delivery-map__legend">
                    <i className="delivery-map__legend-dot delivery-map__legend-dot--store" />
                    <span><strong>{t("shipping.storeMarker")}</strong><small>{storeAddress}</small></span>
                </span> : null}
            </div>
            <div
                ref={mapContainerRef}
                className="delivery-map__canvas"
                role="application"
                aria-label={t("shipping.mapCanvas")}
                tabIndex={0}
            />
            <p className="delivery-map__attribution">{tileAttribution}</p>
            <div className="delivery-map__coordinates">
                <label>
                    <span>{t("shipping.latitude")}</span>
                    <input type="number" inputMode="decimal" step="any" min={-90} max={90} value={latitudeInput} onChange={(event) => updateCoordinate("latitude", event.target.value)} />
                </label>
                <label>
                    <span>{t("shipping.longitude")}</span>
                    <input type="number" inputMode="decimal" step="any" min={-180} max={180} value={longitudeInput} onChange={(event) => updateCoordinate("longitude", event.target.value)} />
                </label>
            </div>
            <p className="delivery-map__status" role="status" aria-live="polite">
                {destination
                    ? t("shipping.pinSelected").replace("{latitude}", destination.latitude.toFixed(5)).replace("{longitude}", destination.longitude.toFixed(5))
                    : t("shipping.choosePin")}
            </p>
        </div>
    );
};

export default DeliveryMapPicker;
