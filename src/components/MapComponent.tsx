import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocationUpdate } from "../types";

interface MapComponentProps {
  location: LocationUpdate | null;
  status: "active" | "delivered" | "expired";
  destinationAddress?: string;
  destinationCoords?: [number, number] | null;
}

// Haversine formula to compute distance in meters
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate bearing/heading between two coordinates in degrees (0 = North)
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = Math.atan2(y, x);
  brng = (brng * 180) / Math.PI;
  return (brng + 360) % 360;
}

export default function MapComponent({ location, status, destinationAddress, destinationCoords }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routePolylineGlowRef = useRef<L.Polyline | null>(null);

  const currentCoordsRef = useRef<[number, number] | null>(null);
  const destinationCoordsRef = useRef<[number, number] | null>(null);
  const headingRef = useRef<number>(0);
  const hasFittedBoundsRef = useRef<boolean>(false);
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

  // Fetch Destination Coordinates (Nominatim Geocoder fallback or via prop)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setupDestination = async () => {
      if (destinationCoords) {
        console.log(`[Map View] Using provided destination coordinates: [${destinationCoords[0]}, ${destinationCoords[1]}]`);
        destinationCoordsRef.current = destinationCoords;
      } else if (destinationAddress) {
        try {
          console.log(`[Geocoding] Querying Nominatim for address: "${destinationAddress}"`);
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationAddress)}&limit=1`
          );
          const data = await response.json();
          
          let destLat = 0;
          let destLng = 0;

          if (data && data.length > 0) {
            destLat = parseFloat(data[0].lat);
            destLng = parseFloat(data[0].lon);
            console.log(`[Geocoding] Success: Resolved "${destinationAddress}" to [${destLat}, ${destLng}]`);
          } else {
            // If geocoding yields no results, place destination at a slight offset from starting coords
            const startLat = location?.latitude ?? 1.29027;
            const startLng = location?.longitude ?? 103.851959;
            destLat = startLat + 0.008;
            destLng = startLng + 0.008;
            console.warn(`[Geocoding] No results found for "${destinationAddress}". Using default offset fallback: [${destLat}, ${destLng}]`);
          }

          destinationCoordsRef.current = [destLat, destLng];
        } catch (err) {
          console.error("[Geocoding] Error resolving address:", err);
          return;
        }
      } else {
        return;
      }

      const [destLat, destLng] = destinationCoordsRef.current;

      // Custom Crimson Destination Pin Icon
      const destIcon = L.divIcon({
        className: "custom-dest-icon",
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px;">
            <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background-color: rgba(244, 63, 94, 0.2); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
            <div style="position: relative; width: 28px; height: 28px; border-radius: 9999px; background-color: #f43f5e; border: 2px solid #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      // Add or move destination marker
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setLatLng([destLat, destLng]);
      } else {
        destinationMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b>Destination</b><br/>${destinationAddress || "Selected Address"}`);
      }

      // Trigger map bounds fitting if we have both coordinates
      fitMapBounds();
    };

    setupDestination();
  }, [destinationAddress, destinationCoords]);

  // Fit bounds to show both rider and destination
  const fitMapBounds = () => {
    const map = mapRef.current;
    if (!map || hasFittedBoundsRef.current) return;

    const riderCoords = currentCoordsRef.current;
    const destCoords = destinationCoordsRef.current;

    if (riderCoords && destCoords) {
      const bounds = L.latLngBounds([riderCoords, destCoords]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      hasFittedBoundsRef.current = true;
    }
  };

  // Fetch actual OSRM road path from Rider to Destination and draw/update line
  const updateRouteLine = async (riderLat: number, riderLng: number) => {
    const map = mapRef.current;
    const dest = destinationCoordsRef.current;
    if (!map || !dest) return;

    const [destLat, destLng] = dest;
    let routeCoords: [number, number][] = [
      [riderLat, riderLng],
      [destLat, destLng],
    ];

    try {
      // Call public free OSRM (Open Source Routing Machine) API for real street route geometry
      const url = `https://router.project-osrm.org/route/v1/driving/${riderLng},${riderLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const rawCoords = data.routes[0].geometry.coordinates;
          // OSRM coordinates are [lng, lat], convert to [lat, lng] for Leaflet
          routeCoords = rawCoords.map((coord: [number, number]) => [coord[1], coord[0]]);
        }
      }
    } catch (err) {
      console.warn("[Route Line] OSRM route fetch failed, drawing straight line instead:", err);
    }

    // Draw main colored street polyline path
    if (routePolylineRef.current) {
      routePolylineRef.current.setLatLngs(routeCoords);
    } else {
      routePolylineRef.current = L.polyline(routeCoords, {
        color: "#4f46e5", // Elegant Indigo Blue line
        weight: 6,
        opacity: 0.8,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }

    // Draw secondary transparent soft outer glow polyline path below it
    if (routePolylineGlowRef.current) {
      routePolylineGlowRef.current.setLatLngs(routeCoords);
    } else {
      routePolylineGlowRef.current = L.polyline(routeCoords, {
        color: "#4f46e5",
        weight: 12,
        opacity: 0.15,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }
  };

  // Handle location changes and marker interpolation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;

    const targetLat = location.latitude;
    const targetLng = location.longitude;

    // Check if we already have current coordinates
    const startLat = currentCoordsRef.current?.[0] ?? targetLat;
    const startLng = currentCoordsRef.current?.[1] ?? targetLng;

    // Calculate heading/bearing based on movement if distance is notable (> 8m)
    const movementDistance = getHaversineDistance(startLat, startLng, targetLat, targetLng);
    const isFirstTime = !riderMarkerRef.current;

    // Keep the distance filter ONLY for deciding whether to redraw/move the marker position.
    // If the phone hasn't actually moved meaningfully (less than 8m), keep the arrow's
    // last known rotation instead of recalculating it from near-identical/noisy coordinates.
    if (!isFirstTime && movementDistance < 8) {
      console.log(`[Map View] Minor noise/jitter change ignored visually (${movementDistance.toFixed(1)}m). Marker stays stationary.`);
      return;
    }

    if (!isFirstTime && movementDistance >= 8) {
      headingRef.current = getBearing(startLat, startLng, targetLat, targetLng);
      console.log(`[Map View] Movement detected (${movementDistance.toFixed(1)}m). Rotating arrow to ${headingRef.current.toFixed(1)}° and animating marker...`);
    }

    // Helper to get a beautiful rotating Navigation Arrow custom div icon
    const getRiderIcon = (heading: number) => L.divIcon({
      className: "custom-rider-icon",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
          <!-- Glowing wave shadow -->
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background-color: rgba(79, 70, 229, 0.2); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <!-- Arrow container rotating -->
          <div class="rider-arrow-container" style="transition: transform 0.3s ease-out; transform: rotate(${heading}deg); width: 28px; height: 28px; border-radius: 9999px; background-color: #4f46e5; border: 2px solid #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center;">
            <!-- Navigation Arrow SVG rotated -45deg so it points straight North at 0deg -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(-45deg);">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    if (isFirstTime) {
      // First time coordinate setup
      const marker = L.marker([targetLat, targetLng], { icon: getRiderIcon(headingRef.current) }).addTo(map);
      riderMarkerRef.current = marker;
      currentCoordsRef.current = [targetLat, targetLng];
      map.setView([targetLat, targetLng], 15);
      
      // Update route line immediately
      updateRouteLine(targetLat, targetLng);
    } else {
      // Smooth linear interpolation animation to prevent marker snapping over ~1 second
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Update marker icon to reflect new rotation
      riderMarkerRef.current.setIcon(getRiderIcon(headingRef.current));

      const duration = 1000; // Exact 1.0 second movement animation
      const startTime = performance.now();

      const animateMarker = (nowTime: number) => {
        const elapsed = nowTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out Quad function for visual deceleration towards the destination coordinate
        const ease = progress * (2 - progress);

        const currentLat = startLat + (targetLat - startLat) * ease;
        const currentLng = startLng + (targetLng - startLng) * ease;

        if (riderMarkerRef.current) {
          riderMarkerRef.current.setLatLng([currentLat, currentLng]);
          currentCoordsRef.current = [currentLat, currentLng];

          // Rotate arrow dynamically using DOM selector for instantaneous response
          const riderElement = riderMarkerRef.current.getElement()?.querySelector(".rider-arrow-container") as HTMLElement;
          if (riderElement) {
            riderElement.style.transform = `rotate(${headingRef.current}deg)`;
          }

          // Live update route line beginning coordinate so line always flows cleanly from moving rider icon
          if (routePolylineRef.current) {
            const currentLatLngs = routePolylineRef.current.getLatLngs() as L.LatLng[];
            if (currentLatLngs.length > 0) {
              currentLatLngs[0] = L.latLng(currentLat, currentLng);
              routePolylineRef.current.setLatLngs(currentLatLngs);
            }
          }
          if (routePolylineGlowRef.current) {
            const currentGlowLatLngs = routePolylineGlowRef.current.getLatLngs() as L.LatLng[];
            if (currentGlowLatLngs.length > 0) {
              currentGlowLatLngs[0] = L.latLng(currentLat, currentLng);
              routePolylineGlowRef.current.setLatLngs(currentGlowLatLngs);
            }
          }
        }

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animateMarker);
        } else {
          // Snap map camera framing to the settled coordinates
          map.panTo([targetLat, targetLng]);
          // Refresh route line completely to align perfectly with OSRM roads
          updateRouteLine(targetLat, targetLng);
          // Try to fit bounds if it has not happened yet
          fitMapBounds();
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

