import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "./model";

export default function DeliveryMap({ origin, point, onChange }: { origin: Point; point: Point | null; onChange: (point: Point) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(() => {
    if (!root.current) return;
    const map = L.map(root.current, { scrollWheelZoom: false }).setView([origin.latitude, origin.longitude], 13);
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    L.circleMarker([origin.latitude, origin.longitude], { radius: 7, color: "#244B3B", fillOpacity: 1 }).addTo(map).bindTooltip("Mây · Điểm xuất phát");
    const pick = (e: L.LeafletMouseEvent) => changeRef.current({ latitude: Number(e.latlng.lat.toFixed(6)), longitude: Number(e.latlng.lng.toFixed(6)) });
    map.on("click", pick);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [origin.latitude, origin.longitude]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!point) return;
    markerRef.current = L.circleMarker([point.latitude, point.longitude], { radius: 10, color: "#AA4930", fillColor: "#EF916E", fillOpacity: 1, weight: 3 }).addTo(map).bindTooltip("Điểm giao của bạn").openTooltip();
    map.panTo([point.latitude, point.longitude], { animate: false });
  }, [point]);
  return <div ref={root} className="may-map" role="region" aria-label="Chọn điểm giao trên bản đồ. Có thể dùng ô tọa độ bên dưới thay thế." />;
}
