import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocationUpdate } from "../types";

interface MapComponentProps {
  location: LocationUpdate | null;
  status: "active" | "delivered" | "expired";
}

export default function MapComponent({ location, status }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const currentCoordsRef = useRef<[number, number] | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default starting coords if no location yet (Singapore/Center)
    const startLat = location?.latitude ?? 1.29027;
    const startLng = location?.longitude ?? 103.851959;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([startLat, startLng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    // Cleanup map on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Handle location changes and marker interpolation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;

    const targetLat = location.latitude;
    const targetLng = location.longitude;

    // Define a beautiful glowing/pulsing custom div icon for the Rider
    const riderIcon = L.divIcon({
      className: "custom-rider-icon",
      html: `
        <div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
          <div class="absolute w-8 h-8 rounded-full bg-indigo-500/30 animate-ping"></div>
          <div class="relative w-6 h-6 rounded-full bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center">
            <!-- Scooter / Delivery Bag SVG icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-truck">
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
              <path d="M19 18h2a1 1 0 0 0 1-1v-5.14a1 1 0 0 0-.293-.707l-4-4A1 1 0 0 0 17 7h-3v11"/>
              <circle cx="7" cy="18" r="2"/>
              <circle cx="17" cy="18" r="2"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    if (!riderMarkerRef.current) {
      // First time coordinate setup
      const marker = L.marker([targetLat, targetLng], { icon: riderIcon }).addTo(map);
      riderMarkerRef.current = marker;
      currentCoordsRef.current = [targetLat, targetLng];
      map.panTo([targetLat, targetLng]);
    } else {
      // Smooth linear interpolation animation to prevent marker snapping (GPS jitter)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const startLat = currentCoordsRef.current?.[0] ?? targetLat;
      const startLng = currentCoordsRef.current?.[1] ?? targetLng;
      const duration = 1200; // 1.2 seconds animation
      const startTime = performance.now();

      const animateMarker = (nowTime: number) => {
        const elapsed = nowTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease in-out quad function for smooth movement transition
        const ease = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentLat = startLat + (targetLat - startLat) * ease;
        const currentLng = startLng + (targetLng - startLng) * ease;

        if (riderMarkerRef.current) {
          riderMarkerRef.current.setLatLng([currentLat, currentLng]);
          currentCoordsRef.current = [currentLat, currentLng];
        }

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animateMarker);
        } else {
          // Snap map frame to end coordinates and zoom to active track
          map.panTo([targetLat, targetLng]);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animateMarker);
    }
  }, [location]);

  return (
    <div className="relative w-full h-[400px] md:h-[500px] rounded-2xl overflow-hidden border border-gray-100 shadow-inner">
      <div id="map-container" ref={mapContainerRef} className="w-full h-full z-10" />
      
      {/* Overlay controls or markers details */}
      <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-md border border-gray-100 flex items-center gap-2">
        <span className="flex h-2.5 w-2.5 relative">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        </span>
        <span className="text-xs font-semibold text-gray-700 capitalize font-sans">
          {status === 'active' ? 'Live Sharing Active' : `Delivery ${status}`}
        </span>
      </div>
    </div>
  );
}
