import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Order, LocationUpdate } from "../types";
import MapComponent from "./MapComponent";
import {
  MapPin,
  Clock,
  ArrowLeft,
  Truck,
  CheckCircle2,
  Navigation,
  AlertCircle,
  Phone,
  Building,
} from "lucide-react";

interface CustomerViewerProps {
  token: string;
  onGoBack: () => void;
}

export default function CustomerViewer({ token, onGoBack }: CustomerViewerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomerOrder = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_token", token)
        .single();

      if (error) throw error;
      if (data) setOrder(data as Order);
    } catch (err) {
      console.warn("Could not load order from Supabase:", err);
      // Local fallback
      const local = localStorage.getItem("routepulse_local_orders");
      if (local) {
        try {
          const list: Order[] = JSON.parse(local);
          const found = list.find((o) => o.customer_token === token);
          if (found) setOrder(found);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerOrder();

    // Subscribe to realtime updates for this specific customer order
    const subscription = supabase
      .channel(`cust_${token}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          if (payload.new && payload.new.customer_token === token) {
            setOrder(payload.new as Order);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-slate-500 font-bold text-sm">
        Loading Delivery Live Location...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white dark:bg-slate-900 rounded-3xl text-center space-y-4 border border-slate-200 dark:border-slate-800">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Order Tracking Not Found</h2>
        <p className="text-xs text-slate-500">Please verify your tracking token or link.</p>
        <button
          onClick={onGoBack}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs"
        >
          Return Home
        </button>
      </div>
    );
  }

  const riderLoc: LocationUpdate | null = order.last_lat
    ? {
        latitude: order.last_lat,
        longitude: order.last_lng || 0,
        heading: order.last_heading,
        speed: order.last_speed,
        timestamp: order.last_updated || new Date().toISOString(),
      }
    : null;

  const destLoc = {
    lat: order.destination_lat || 1.3521,
    lng: order.destination_lng || 103.8198,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      {/* Back Button Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onGoBack}
          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Landing Page</span>
        </button>

        <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase">
          Live Customer View
        </span>
      </div>

      {/* Main Order Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 space-y-6 shadow-sm">
        {/* Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Truck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                  Delivery for {order.customer_name}
                </h1>
                <p className="text-xs text-slate-500 font-mono">Token: {order.customer_token}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider ${
                order.status === "delivered"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 animate-pulse"
              }`}
            >
              {order.status === "delivered" ? "Delivered" : "Rider In Transit"}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-1 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
              <Building className="w-4 h-4 text-indigo-500" />
              <span>Destination Address</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium">{order.customer_address}</p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-1 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
              <Truck className="w-4 h-4 text-indigo-500" />
              <span>Assigned Driver</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium">
              {order.rider_name || "Assigned Driver"} ({order.rider_phone || "Phone hidden"})
            </p>
          </div>
        </div>

        {/* Live Interactive Map */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Rider Live GPS Map</span>
            <span className="text-slate-400 font-normal">
              Last updated: {order.last_updated ? new Date(order.last_updated).toLocaleTimeString() : "Awaiting signal"}
            </span>
          </div>

          <MapComponent
            riderLocation={riderLoc}
            destinationLocation={destLoc}
            locationHistory={order.location_history || []}
            height="360px"
          />
        </div>
      </div>
    </div>
  );
}
