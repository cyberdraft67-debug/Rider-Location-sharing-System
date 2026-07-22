import { useState, useEffect, useRef } from "react";
import { Play, Square, CheckCircle, Navigation, AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { TrackingLink, LocationUpdate } from "../types";
import { supabase } from "../supabaseClient";
import MapComponent from "./MapComponent";

// Helper to parse any date string safely as UTC if it doesn't specify a timezone offset
const parseAsUTC = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  let formatted = dateStr;
  if (formatted.includes(" ") && !formatted.includes("T")) {
    formatted = formatted.replace(" ", "T");
  }
  // If it doesn't contain Z or an explicit timezone offset like +08 or -05, append Z to force UTC
  if (!formatted.endsWith("Z") && !/[+-]\d{2}(:?\d{2})?$/.test(formatted)) {
    formatted += "Z";
  }
  return new Date(formatted);
};

// Haversine formula to compute distance in meters
const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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
};

interface RiderTrackerProps {
  token: string;
  onGoBack: () => void;
}

export default function RiderTracker({ token, onGoBack }: RiderTrackerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<TrackingLink | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "sending" | "success" | "offline">("idle");
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);

  const [hasConfirmed, setHasConfirmed] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastSentCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Fetch token details directly from Supabase
  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: link, error: linkError } = await supabase
        .from("tracking_links")
        .select("*")
        .eq("token", token)
        .single();

      if (linkError || !link) {
        throw new Error(linkError?.message || "Tracking link not found or invalid");
      }

      // Check if expired and update on demand (using safe parseAsUTC helper)
      const now = new Date();
      if (link.status === "active" && parseAsUTC(link.expires_at).getTime() < now.getTime()) {
        const { error: updateError } = await supabase
          .from("tracking_links")
          .update({ status: "expired" })
          .eq("id", link.id);
        
        if (!updateError) {
          link.status = "expired";
        }
      }

      setLinkData(link);

      // Fetch any existing location update
      const { data: loc, error: locError } = await supabase
        .from("location_updates")
        .select("*")
        .eq("order_id", link.order_id)
        .maybeSingle();

      if (loc) {
        setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      }
    } catch (err: any) {
      console.error("Failed to fetch tracking details from Supabase:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    return () => {
      stopLocationSharing();
    };
  }, [token]);

  // Tick timer to track how long since the last location update was pushed
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSharing && lastUpdateTime) {
      timer = setInterval(() => {
        setSecondsSinceLastUpdate(Math.floor((Date.now() - lastUpdateTime) / 1000));
      }, 1000);
    } else {
      setSecondsSinceLastUpdate(0);
    }
    return () => clearInterval(timer);
  }, [isSharing, lastUpdateTime]);

  // Heartbeat timer: when sharing is active, periodically re-send the current coordinates 
  // every 5 seconds to Supabase. This updates the "updated_at" database timestamp, 
  // ensuring the customer's "last synced" indicator remains fresh and alive even when stationary.
  useEffect(() => {
    if (!isSharing) return;

    const heartbeat = setInterval(() => {
      if (lastSentCoordsRef.current) {
        console.log("[GPS Heartbeat] Stationary heartbeat sync...");
        sendLocation(lastSentCoordsRef.current.latitude, lastSentCoordsRef.current.longitude);
      }
    }, 5000);

    return () => clearInterval(heartbeat);
  }, [isSharing]);

  // Function to send coordinates to Supabase
  const sendLocation = async (lat: number, lng: number) => {
    if (!linkData) return;
    
    if (linkData.status !== "active") {
      stopLocationSharing();
      return;
    }
    
    setUpdateStatus("sending");
    try {
      const { error: upsertError } = await supabase
        .from("location_updates")
        .upsert({
          order_id: linkData.order_id,
          latitude: Number(lat),
          longitude: Number(lng),
          updated_at: new Date().toISOString(),
        });

      if (upsertError) throw upsertError;

      setLastUpdateTime(Date.now());
      setUpdateStatus("success");
    } catch (err) {
      console.error("Failed to send location update to Supabase:", err);
      setUpdateStatus("offline");
    }
  };

  // Start reading GPS and sending updates directly to Supabase
  const startLocationSharing = () => {
    if (!("geolocation" in navigator)) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsSharing(true);
    setUpdateStatus("sending");

    // Immediately trigger an initial position fetch
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log(`[GPS] Initial GPS reading accepted: [${latitude}, ${longitude}]`);
        lastSentCoordsRef.current = { latitude, longitude };
        setCoords({ latitude, longitude });
        sendLocation(latitude, longitude);
      },
      (error) => {
        console.error("Initial GPS reading failed:", error);
        alert(`Failed to get initial GPS location: ${error.message}. Please verify GPS settings.`);
        setIsSharing(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    // Watch position in real-time, sending updates to Supabase whenever it changes
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log(`[GPS] Live GPS coordinate update received: [${latitude}, ${longitude}]`);
        lastSentCoordsRef.current = { latitude, longitude };
        setCoords({ latitude, longitude });
        sendLocation(latitude, longitude);
      },
      (error) => {
        console.error("GPS Watch error:", error);
        setUpdateStatus("offline");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const stopLocationSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastSentCoordsRef.current = null; // Clear on pause
    setIsSharing(false);
    setUpdateStatus("idle");
  };

  const handleStartDelivery = () => {
    setHasConfirmed(true);
    startLocationSharing();
  };

  const handleMarkComplete = async () => {
    if (!confirm("Are you sure you want to end location sharing?")) {
      return;
    }
    stopLocationSharing();
    try {
      const { error: updateError } = await supabase
        .from("tracking_links")
        .update({ status: "delivered" })
        .eq("id", linkData!.id);

      if (updateError) throw updateError;
      
      await fetchDetails(); // Reload status
    } catch (err: any) {
      console.error("Failed to mark delivery as complete in Supabase:", err);
      alert("Failed to complete order. Please try again.");
    }
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Validating rider token...</p>
      </div>
    );
  }

  if (error || !linkData) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-sm border border-red-100 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Tracking Link</h2>
        <p className="text-gray-600 mb-6">{error || "This tracking link does not exist, has expired, or is invalid."}</p>
        <button
          onClick={onGoBack}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-xl transition duration-150"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isDelivered = linkData.status === "delivered";
  const isExpired = linkData.status === "expired";
  const isExpiredOrDelivered = isDelivered || isExpired;

  const isDirectRiderLink = window.location.pathname.startsWith("/track/");

  if (linkData.status === "active" && !hasConfirmed) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden font-sans transition-colors duration-200">
        {/* Header section with assigned notification */}
        <div className="p-6 bg-indigo-50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 text-center space-y-3 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase font-display bg-indigo-100 dark:bg-indigo-900/60 px-2.5 py-1 rounded-full">
              New Assignment
            </span>
            {!isDirectRiderLink && (
              <button onClick={onGoBack} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium underline">
                Dashboard
              </button>
            )}
          </div>
          
          <div className="mx-auto inline-flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
            <Navigation className="h-6 w-6 text-indigo-600 dark:text-indigo-400 animate-pulse animate-bounce" />
          </div>
          
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">Order Assigned</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-normal">
            You've been assigned <strong>Order #{linkData.order_id}</strong>
          </p>
        </div>

        {/* Info panel */}
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-xs space-y-2.5 font-medium transition-colors duration-200">
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500">Order ID:</span>
                <span className="font-bold text-slate-900 dark:text-white">{linkData.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500">Rider ID:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{linkData.rider_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500">Customer ID:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{linkData.customer_id}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 flex flex-col gap-1 text-left">
                <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold tracking-wider">Delivery Destination:</span>
                <span className="text-slate-700 dark:text-slate-300 leading-normal text-xs">{linkData.address || "Not specified"}</span>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              Tapping below will request GPS location permissions to start sharing your live position with the customer in real-time.
            </div>
          </div>

          <button
            onClick={handleStartDelivery}
            className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-4 rounded-2xl transition duration-150 shadow-md shadow-indigo-100/10 dark:shadow-none text-sm"
          >
            <Play className="w-5 h-5 fill-current" />
            Start Delivery & Share Location
          </button>
        </div>
      </div>
    );
  }

  const mapLocation: LocationUpdate | null = coords ? {
    order_id: linkData.order_id,
    latitude: coords.latitude,
    longitude: coords.longitude,
    updated_at: new Date().toISOString()
  } : null;

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden font-sans transition-colors duration-200">
      {/* Header section */}
      <div className="p-6 bg-indigo-50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 transition-colors duration-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase font-display bg-indigo-100 dark:bg-indigo-900/60 px-2.5 py-1 rounded-full">
            Rider Console
          </span>
          {!isDirectRiderLink && (
            <button onClick={onGoBack} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium underline">
              Dashboard
            </button>
          )}
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display">Order {linkData.order_id}</h2>
        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
          <div><span className="font-semibold text-slate-700 dark:text-slate-300">Rider:</span> {linkData.rider_id}</div>
          <div><span className="font-semibold text-slate-700 dark:text-slate-300">Customer:</span> {linkData.customer_id}</div>
          {linkData.address && (
            <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium mt-1 bg-white/60 dark:bg-slate-900/60 px-2 py-1.5 rounded-lg border border-indigo-100/40 dark:border-indigo-950/40">
              <span className="font-bold">📍 Destination:</span> {linkData.address}
            </div>
          )}
        </div>
      </div>

      {/* Main console content */}
      <div className="p-6">
        {isExpiredOrDelivered ? (
          <div className="text-center py-8">
            <CheckCircle className={`w-16 h-16 mx-auto mb-4 ${isDelivered ? "text-emerald-500" : "text-amber-500"}`} />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              {isDelivered ? "Delivery Complete!" : "Delivery Link Expired"}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto">
              {isDelivered 
                ? "Excellent job! The tracking link is now closed and location is no longer visible to the customer." 
                : "The 3-hour session window for this tracking link has expired."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Live Map View */}
            {isSharing && coords && (
              <div className="overflow-hidden rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm">
                <MapComponent
                  location={mapLocation}
                  status={linkData.status}
                  destinationAddress={linkData.address}
                />
              </div>
            )}

            {/* Status indicators */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 transition-colors duration-200">
              <h4 className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 tracking-wider uppercase mb-3">Live Status</h4>
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  {isSharing && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${isSharing ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}></span>
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {isSharing ? "Broadcasting GPS Location" : "Location Sharing Offline"}
                </span>
              </div>

              {isSharing && coords && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Latitude:</span> {coords.latitude.toFixed(5)}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Longitude:</span> {coords.longitude.toFixed(5)}
                  </div>
                </div>
              )}
            </div>

            {/* Warning banner if location hasn't been updated for 60 seconds */}
            {isSharing && secondsSinceLastUpdate > 60 && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl flex gap-3 items-start animate-pulse transition-colors duration-200">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold text-amber-900 dark:text-amber-200">Background App Warning</h5>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    No GPS updates sent for <strong>{secondsSinceLastUpdate} seconds</strong>. Please keep this tab active and open in your phone browser to prevent iOS/Android from sleeping the tracker!
                  </p>
                </div>
              </div>
            )}

            {/* Offline notification if API failed */}
            {updateStatus === "offline" && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl flex gap-3 items-start transition-colors duration-200">
                <CloudOff className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold text-rose-900 dark:text-rose-200">Network Connection Dropped</h5>
                  <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                    Experiencing poor signal or network disconnect. Don't close the tab! The app will automatically resume sharing as soon as the network connects.
                  </p>
                </div>
              </div>
            )}

            {/* Interactive console action controls */}
            <div className="flex flex-col gap-3">
              {!isSharing ? (
                <button
                  onClick={startLocationSharing}
                  className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 shadow-md shadow-indigo-100/10 dark:shadow-none"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Start Sharing Location
                </button>
              ) : (
                <button
                  onClick={stopLocationSharing}
                  className="flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 shadow-md shadow-amber-100/10 dark:shadow-none"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Pause Sharing
                </button>
              )}

              <button
                onClick={handleMarkComplete}
                className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 shadow-md shadow-emerald-100/10 dark:shadow-none"
              >
                <CheckCircle className="w-5 h-5" />
                Mark Delivery Complete
              </button>
            </div>

            {/* Dynamic visual dashboard footer */}
            <div className="text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span>
                {updateStatus === "sending" && "Syncing coordinates..."}
                {updateStatus === "success" && `Synced successfully ${secondsSinceLastUpdate}s ago`}
                {updateStatus === "idle" && "Ready to start delivery session"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
