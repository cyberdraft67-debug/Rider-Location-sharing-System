import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocationUpdate } from '../types';

interface MapComponentProps {
  riderLocation?: LocationUpdate | null;
  destinationLocation?: { lat: number; lng: number } | null;
  locationHistory?: LocationUpdate[];
  height?: string;
  zoom?: number;
}

export default function MapComponent({
  riderLocation,
  destinationLocation,
  locationHistory = [],
  height = '400px',
  zoom = 15,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMapRef.current) {
      const initialLat = riderLocation?.latitude || destinationLocation?.lat || 1.3521;
      const initialLng = riderLocation?.longitude || destinationLocation?.lng || 103.8198;

      const map = L.map(mapRef.current, {
        zoomControl: false,
      }).setView([initialLat, initialLng], zoom);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update Rider Marker, Polyline and Map Bounds
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // 1. Destination Marker
    if (destinationLocation && destinationLocation.lat && destinationLocation.lng) {
      const destPos: L.LatLngExpression = [destinationLocation.lat, destinationLocation.lng];
      if (!destMarkerRef.current) {
        const destIcon = L.divIcon({
          className: 'custom-dest-icon',
          html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 4px 12px rgba(239,68,68,0.4);border:2px solid white;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        destMarkerRef.current = L.marker(destPos, { icon: destIcon }).addTo(map);
      } else {
        destMarkerRef.current.setLatLng(destPos);
      }
    }

    // 2. Rider Marker with Directional Heading Arrow
    if (riderLocation && riderLocation.latitude && riderLocation.longitude) {
      const riderPos: L.LatLngExpression = [riderLocation.latitude, riderLocation.longitude];
      const heading = riderLocation.heading || 0;

      const arrowHtml = `
        <div style="transform: rotate(${heading}deg); transition: transform 0.3s ease-out; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
          <div style="background:#4f46e5; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; box-shadow: 0 4px 16px rgba(79, 70, 229, 0.5); border:3px solid white;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
        </div>
      `;

      const riderIcon = L.divIcon({
        className: 'rider-heading-marker',
        html: arrowHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (!riderMarkerRef.current) {
        riderMarkerRef.current = L.marker(riderPos, { icon: riderIcon }).addTo(map);
      } else {
        riderMarkerRef.current.setLatLng(riderPos);
        riderMarkerRef.current.setIcon(riderIcon);
      }
    }

    // 3. Polyline for Location History
    if (locationHistory.length > 1) {
      const points: L.LatLngExpression[] = locationHistory.map((loc) => [loc.latitude, loc.longitude]);
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(points, {
          color: '#6366f1',
          weight: 4,
          opacity: 0.8,
          dashArray: '8, 8',
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(points);
      }
    }

    // Auto-fit bounds if both rider and destination are available
    if (riderLocation && destinationLocation && destinationLocation.lat) {
      const bounds = L.latLngBounds([
        [riderLocation.latitude, riderLocation.longitude],
        [destinationLocation.lat, destinationLocation.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (riderLocation) {
      map.panTo([riderLocation.latitude, riderLocation.longitude]);
    }
  }, [riderLocation, destinationLocation, locationHistory]);

  return (
    <div
      ref={mapRef}
      style={{ height, width: '100%' }}
      className="rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 z-0"
    />
  );
}
