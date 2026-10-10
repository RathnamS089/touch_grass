import { ArrowLeft, Check, Copy, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OutdoorPlace } from "@/types/grounded";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface OutdoorRecommendationProps {
  place: OutdoorPlace;
  onBack: () => void;
  onReset: () => void;
}

export function OutdoorRecommendation({ place, onBack, onReset }: OutdoorRecommendationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const hasCoords = typeof place.lat === "number" && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90
    && typeof place.lon === "number" && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180;

  useEffect(() => {
    setCopyStatus("idle");
    if (!hasCoords || !containerRef.current) return;
    setMapStatus("loading");
    const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: false })
      .setView([place.lat!, place.lon!], 15);
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    let failed = false;
    tiles.on("loading", () => { failed = false; });
    tiles.on("tileerror", () => { failed = true; setMapStatus("error"); });
    tiles.on("load", () => setMapStatus(failed ? "error" : "ready"));
    tiles.addTo(map);
    const label = document.createElement("span");
    label.textContent = place.name;
    L.marker([place.lat!, place.lon!], {
      title: place.name,
      alt: place.name,
      icon: L.divIcon({ className: "recommendation-marker", html: '<span class="map-pin"><span></span></span>', iconSize: [36, 44], iconAnchor: [18, 42] }),
    }).addTo(map).bindTooltip(label, { direction: "top", offset: [0, -38] });
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(containerRef.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, [hasCoords, place.lat, place.lon, place.name]);

  const copyLocation = async () => {
    try {
      await navigator.clipboard.writeText(`${place.name}\nhttps://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${place.lat}/${place.lon}`);
      setCopyStatus("copied");
    } catch { setCopyStatus("error"); }
  };

  return (
    <section className="recommendation-page page-enter" aria-labelledby="place-name">
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Back to Grounded</button>
      <header className="page-header">
        <p className="eyebrow">A little time outside</p>
        <h1 id="place-name">{place.name}</h1>
        <p className="place-card__meta"><MapPin size={16} /> {place.category} · {place.distance}</p>
      </header>
      <article className="place-card">
        {hasCoords ? (
          <div className="place-map">
            <div ref={containerRef} className="place-map__canvas" role="region" aria-label={`Map showing ${place.name}`} />
            <button className="map-recenter" type="button" aria-label="Recenter on recommended place" onClick={() => mapRef.current?.setView([place.lat!, place.lon!], 15)}><LocateFixed size={17} /> Recenter</button>
            {mapStatus !== "ready" && <p className="map-status" role="status">{mapStatus === "error" ? "Map tiles couldn’t load. Check your connection or copy the location." : "Loading map…"}</p>}
          </div>
        ) : <div className="map-unavailable"><MapPin size={24} /><p>A map isn’t available for this place yet.</p></div>}
        <div className="place-card__body">
          <p className="eyebrow">Your next breath of fresh air</p>
          <p className="place-card__description">{place.description}</p>
          <div className="place-card__actions">
            {hasCoords && <button className="button button--primary" type="button" onClick={copyLocation}>{copyStatus === "copied" ? <Check size={17} /> : <Copy size={17} />}{copyStatus === "copied" ? "Location copied" : "Copy location"}</button>}
            <button className="button button--quiet" type="button" onClick={onReset}>Back to Grounded</button>
          </div>
          <p className="place-card__help" role="status">{copyStatus === "error" ? `Couldn’t copy. Coordinates: ${place.lat}, ${place.lon}` : copyStatus === "copied" ? "Paste the link into your browser or share it." : "Take a break at your own pace."}</p>
        </div>
      </article>
    </section>
  );
}
