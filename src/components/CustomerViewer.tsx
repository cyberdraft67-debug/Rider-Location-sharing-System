import { useState, useEffect } from "react";
import { CheckCircle, AlertTriangle, RefreshCw, Clock, MapPin, Navigation, Signal } from "lucide-react";
import { TrackingLink, LocationUpdate } from "../types";
import MapComponent from "./MapComponent";

interface CustomerViewerProps {
  token: string;
  onGoBack: () => void;
}

export default function CustomerViewer({ token, onGoBack }: CustomerViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<TrackingLink | null>(null);
  const [location, setLocation] = useState<LocationUpdate | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("connecting");

  // Fetch token details initially
  const fetchDetails = async () => {
    try {
      setError(null);
      const res = await fetch(`/api/tracking/${token}`);
      if (!res.ok) {
        throw new Error(await res.text() || "Failed to validate tracking link");
      }
      const data = await res.json();
      setLinkData(data.link);
      setLocation(data.location);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [token]);

  // Real-time EventSource (SSE) Subscription - simulating Supabase Realtime
  useEffect(() => {
    if (loading || error || !linkData || linkData.status !== "active") return;

    setConnectionState("connecting");
    const eventSource = new EventSource(`/api/tracking/${token}/stream`);

    eventSource.onopen = () => {
      setConnectionState("live");
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "init") {
          if (payload.status) {
            setLinkData(prev => prev ? { ...prev, status: payload.status } : null);
          }
          if (payload.location) {
            setLocation(payload.location);
          }
        } else if (payload.type === "location_update") {
          setLocation(payload.location);
        } else if (payload.type === "status_change") {
          setLinkData(prev => prev ? { ...prev, status: payload.status } : null);
        }
      } catch (err) {
        console.error("Error parsing Realtime SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Connection error:", err);
      setConnectionState("offline");
    };

    return () => {
      eventSource.close();
    };
  }, [loading, token, linkData?.status]);

  // Handle ticking timer for "Last updated X seconds/minutes ago"
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (location?.updated_at) {
      const updateTimer = () => {
        const updatedTime = new Date(location.updated_at).getTime();
        const diffSeconds = Math.max(0, Math.floor((Date.now() - updatedTime) / 1000));
        setSecondsSinceUpdate(diffSeconds);
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setSecondsSinceUpdate(null);
    }
    return () => clearInterval(interval);
  }, [location]);

  const handleMarkDelivered = async () => {
    if (!confirm("Are you sure you have received your delivery? This will mark the order as complete.")) {
      return;
    }
    try {
      const res = await fetch(`/api/tracking/${token}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        fetchDetails(); // Reload state
      } else {
        alert("Failed to confirm delivery. Please try again.");
      }
    } catch (err) {
      alert("Network error. Please check your connection.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading live tracking map...</p>
      </div>
    );
  }

  if (error || !linkData) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-sm border border-red-100 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Delivery Tracker Closed</h2>
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

  // Format last updated text
  const formatLastUpdated = () => {
    if (secondsSinceUpdate === null) return "Waiting for rider to start location sharing...";
    if (secondsSinceUpdate < 10) return "Just now";
    if (secondsSinceUpdate < 60) return `${secondsSinceUpdate} seconds ago`;
    const mins = Math.floor(secondsSinceUpdate / 60);
    if (mins === 1) return "1 minute ago";
    return `${mins} minutes ago`;
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden font-sans">
      {/* Header section */}
      <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-start justify-between">
        <div>
          <span className="text-xs font-bold text-gray-500 tracking-wider uppercase font-display bg-gray-200/60 px-2.5 py-1 rounded-full">
            Customer Tracker
          </span>
          <h2 className="text-2xl font-bold text-gray-900 font-display mt-2">Order {linkData.order_id}</h2>
          <p className="text-xs text-gray-500 mt-1">Delivery Rider: <span className="font-semibold text-gray-700">{linkData.rider_id}</span></p>
        </div>
        <button onClick={onGoBack} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline shrink-0">
          Dashboard
        </button>
      </div>

      {/* Main active live panel */}
      {isExpiredOrDelivered ? (
        <div className="p-8 text-center bg-emerald-50/20">
          <CheckCircle className={`w-16 h-16 mx-auto mb-4 ${isDelivered ? "text-emerald-500" : "text-amber-500"}`} />
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            {isDelivered ? "Delivery Arrived!" : "Delivery Link Expired"}
          </h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">
            {isDelivered 
              ? "This delivery session is marked complete. Thank you for using Rider Location Tracker!" 
              : "This 3-hour live location link has expired for security reasons."}
          </p>
          <div className="border-t border-gray-100 pt-6">
            <button
              onClick={onGoBack}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-xl transition duration-150"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Live map viewport */}
          <div className="relative">
            {location ? (
              <MapComponent location={location} status={linkData.status} />
            ) : (
              <div className="w-full h-[300px] bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
                <MapPin className="w-10 h-10 text-gray-400 animate-bounce mb-3" />
                <h4 className="text-base font-bold text-gray-700">Waiting for Rider</h4>
                <p className="text-xs text-gray-500 max-w-xs mt-1">
                  The rider has received your link but hasn't activated their GPS sharing yet. Keep this window open, it will connect automatically.
                </p>
              </div>
            )}

            {/* SSE Live Connection state pill */}
            <div className="absolute bottom-4 left-4 z-20 bg-black/85 text-white backdrop-blur text-[11px] font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${
                connectionState === "live" ? "bg-emerald-400 animate-pulse" :
                connectionState === "connecting" ? "bg-amber-400 animate-ping" : "bg-rose-400"
              }`} />
              <span>
                {connectionState === "live" && "Connected to Rider Live Stream"}
                {connectionState === "connecting" && "Re-establishing connection..."}
                {connectionState === "offline" && "Lost connection. Reconnecting..."}
              </span>
            </div>
          </div>

          {/* Delivery progress details and action button */}
          <div className="p-6 space-y-6">
            {/* Live details info card */}
            <div className="flex gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/60">
              <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-indigo-950">Rider Position</h4>
                <p className="text-xs text-indigo-700/80 mt-1 font-medium flex items-center gap-1.5">
                  <Signal className="w-3 h-3 text-indigo-500" />
                  {formatLastUpdated()}
                </p>
              </div>
            </div>

            {/* Offline warning if connection drops */}
            {secondsSinceUpdate !== null && secondsSinceUpdate > 60 && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold text-amber-900">Rider Connection Idle</h5>
                  <p className="text-xs text-amber-700 mt-1">
                    No GPS signal received from the rider for over a minute. They might have locked their phone or have poor reception. We are still monitoring and displaying their last known location!
                  </p>
                </div>
              </div>
            )}

            {/* Main Action Button */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-sm font-bold text-gray-800 mb-3 text-center">Has your order arrived?</h4>
              <button
                onClick={handleMarkDelivered}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-2xl transition duration-150 shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Yes, Received
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
