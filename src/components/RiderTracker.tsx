import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Order, LocationUpdate } from "../types";
import MapComponent from "./MapComponent";
import {
  Truck,
  Play,
  Square,
  ArrowLeft,
  Navigation,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Share2,
} from "lucide-react";

interface RiderTrackerProps {
  token: string;
  onGoBack: () => void;
}

export default function RiderTracker({ token, onGoBack }: RiderTrackerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationUpdate | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const watchIdRef = useRef<number | null>(null);

  // Load Order details by rider token
  useEffect(() => {
    const fetchOrderByRiderToken = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("rider_token", token)
          .single();

        if (error) throw error;
        if (data) setOrder(data as Order);
      } catch (err) {
        console.warn("Could not load order from Supabase:", err);
        // Fallback local search
        const local = localStorage.getItem("routepulse_local_orders");
        if (local) {
          try {
            const list: Order[] = JSON.parse(local);
            const found = list.find((o) => o.rider_token === token);
            if (found) setOrder(found);
          } catch {
            /* ignore */
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOrderByRiderToken();
  }, [token]);

  // Start GPS geolocation watcher
  const startTracking = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setIsTracking(true);
    setErrorMsg(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const update: LocationUpdate = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: new Date().toISOString(),
        };

        setCurrentLocation(update);

        // Broadcast to Supabase
        if (order) {
          const updatedHistory = [...(order.location_history || []), update];
          try {
            await supabase
              .from("orders")
              .update({
                last_lat: update.latitude,
                last_lng: update.longitude,
                last_heading: update.heading || 0,
                last_speed: update.speed || 0,
                last_updated: update.timestamp,
                status: "in_transit",
                location_history: updatedHistory,
              })
              .eq("id", order.id);
          } catch (err) {
            console.warn("Supabase update error:", err);
          }
        }
      },
      (err) => {
        setErrorMsg(`GPS Error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  const markDelivered = async () => {
    stopTracking();
    if (order) {
      try {
        await supabase.from("orders").update({ status: "delivered" }).eq("id", order.id);
        setOrder((prev) => (prev ? { ...prev, status: "delivered" } : null));
      } catch (err) {
        console.warn("Error marking delivered:", err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-slate-500 font-bold text-sm">
        Loading Rider Telemetry Portal...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white dark:bg-slate-900 rounded-3xl text-center space-y-4 border border-slate-200 dark:border-slate-800">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Invalid Rider Token</h2>
        <p className="text-xs text-slate-500">The rider link you followed does not correspond to an active order.</p>
        <button
          onClick={onGoBack}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs"
        >
          Return to Admin
        </button>
      </div>
    );
  }

  const customerViewerUrl = `${window.location.origin}/view/${order.customer_token}`;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      {/* Back Button Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onGoBack}
          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Admin Dashboard</span>
        </button>

        <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase">
          Rider Mode
        </span>
      </div>

      {/* Main Order Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-600" />
              Delivery for {order.customer_name}
            </h1>
            <p className="text-xs text-slate-500">{order.customer_address}</p>
          </div>

          <div className="flex items-center gap-2">
            {!isTracking ? (
              <button
                onClick={startTracking}
                disabled={order.status === "delivered"}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Live Tracking</span>
              </button>
            ) : (
              <button
                onClick={stopTracking}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md shadow-amber-600/20"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Pause GPS Broadcast</span>
              </button>
            )}

            {order.status !== "delivered" && (
              <button
                onClick={markDelivered}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Delivered</span>
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 text-xs rounded-xl font-medium">
            {errorMsg}
          </div>
        )}

        {/* Live Map Visualization */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Rider Live Navigation & Position</span>
            {isTracking && (
              <span className="text-emerald-500 flex items-center gap-1 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Broadcasting GPS Stream
              </span>
            )}
          </div>

          <MapComponent
            riderLocation={currentLocation || (order.last_lat ? {
              latitude: order.last_lat,
              longitude: order.last_lng || 0,
              heading: order.last_heading,
              speed: order.last_speed,
              timestamp: order.last_updated || new Date().toISOString()
            } : null)}
            destinationLocation={{
              lat: order.destination_lat || 1.3521,
              lng: order.destination_lng || 103.8198
            }}
            height="320px"
          />
        </div>

        {/* Share Customer Link Card */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-indigo-500 shrink-0" />
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">Customer Shareable Tracking Link</p>
              <p className="text-[11px] text-slate-500">Send this link to recipient to view live arrival progress.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                navigator.clipboard.writeText(customerViewerUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-1 text-xs shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? "Copied!" : "Copy Link"}</span>
            </button>
            <a
              href={customerViewerUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 bg-slate-200 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-bold shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
