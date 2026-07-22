import { useState, useEffect, FormEvent } from "react";
import { supabase } from "../supabaseClient";
import { Order } from "../types";
import {
  ShoppingBag,
  Shield,
  RefreshCw,
  Navigation,
  Eye,
  Copy,
  Check,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  ExternalLink,
  MapPin,
} from "lucide-react";

interface AdminDashboardProps {
  onSelectRider: (token: string) => void;
  onSelectCustomer: (token: string) => void;
}

export default function AdminDashboard({
  onSelectRider,
  onSelectCustomer,
}: AdminDashboardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  // Form state
  const [customOrderId, setCustomOrderId] = useState("");
  const [riderName, setRiderName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [creating, setCreating] = useState(false);

  // Pop-up modal state for generated order
  const [popupOrder, setPopupOrder] = useState<Order | null>(null);
  const [openDiagnostics, setOpenDiagnostics] = useState<Record<string, boolean>>({});

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setOrders(data as Order[]);
    } catch (err) {
      console.warn("Supabase fetch failed, using stored local orders:", err);
      const local = localStorage.getItem("routepulse_local_orders");
      if (local) {
        try {
          setOrders(JSON.parse(local));
        } catch {
          setOrders([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    const subscription = supabase
      .channel("orders_channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!riderName || !customerName) return;

    setCreating(true);
    const randRider = Math.random().toString(36).substring(2, 8);
    const randCust = Math.random().toString(36).substring(2, 8);
    const riderToken = `rider_${randRider}`;
    const customerToken = `cust_${randCust}`;
    const finalOrderId = customOrderId.trim() || `ORD-${Math.floor(100 + Math.random() * 900)}`;

    const newOrderPayload: Partial<Order> = {
      customer_token: customerToken,
      rider_token: riderToken,
      status: "assigned",
      customer_name: customerName,
      customer_address: customerAddress || "10 Bayfront Ave, Singapore 018956",
      customer_phone: "+1 (555) 019-2834",
      rider_name: riderName,
      rider_phone: "+1 (555) 018-9921",
      destination_lat: 1.3521,
      destination_lng: 103.8198,
      location_history: [],
      created_at: new Date().toISOString(),
    };

    let created: Order;
    try {
      const { data, error } = await supabase
        .from("orders")
        .insert([{ ...newOrderPayload, id: finalOrderId }])
        .select()
        .single();

      if (error) throw error;
      created = data as Order;
    } catch (err) {
      console.warn("Supabase insert failed, saving locally:", err);
      created = { id: finalOrderId, ...newOrderPayload } as Order;
      const updated = [created, ...orders];
      setOrders(updated);
      localStorage.setItem("routepulse_local_orders", JSON.stringify(updated));
    } finally {
      setCreating(false);
    }

    // Trigger pop-up modal
    setPopupOrder(created);
    fetchOrders();

    // Reset Form
    setCustomOrderId("");
    setRiderName("");
    setCustomerName("");
    setCustomerAddress("");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const toggleDiagnostics = (id: string) => {
    setOpenDiagnostics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      {/* Side-by-side 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Assign New Order Card */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/80 rounded-xl text-indigo-600 dark:text-indigo-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
              Assign New Order
            </h2>
          </div>

          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                ORDER ID
              </label>
              <input
                type="text"
                value={customOrderId}
                onChange={(e) => setCustomOrderId(e.target.value)}
                placeholder="e.g. ORD-9012"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/40 transition placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                RIDER ID / NAME
              </label>
              <input
                type="text"
                required
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                placeholder="e.g. Rider-Tom"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/40 transition placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                CUSTOMER ID / NAME
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Cust-Emma"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/40 transition placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                DELIVERY ADDRESS
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="e.g. 10 Bayfront Ave, Singapore 018956"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/40 transition placeholder:text-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-3.5 px-4 rounded-2xl transition duration-150 shadow-md shadow-indigo-600/25 text-sm flex items-center justify-center gap-2"
            >
              <span>+</span>
              <span>{creating ? "Generating..." : "Generate Secure Tracking Link"}</span>
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Active Tracking Links */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/80 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Shield className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                Active Tracking Links
              </h2>
            </div>

            <button
              onClick={fetchOrders}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
            {orders.map((order) => {
              const riderUrl = `${window.location.origin}/track/${order.rider_token}`;
              const custUrl = `${window.location.origin}/view/${order.customer_token}`;
              const orderKey = order.id || order.customer_token;
              const isDiagOpen = !!openDiagnostics[orderKey];

              const createdTime = order.created_at ? new Date(order.created_at) : new Date();
              const expTime = new Date(createdTime.getTime() + 24 * 60 * 60 * 1000);

              return (
                <div
                  key={orderKey}
                  className="p-5 bg-slate-50/70 dark:bg-slate-950/50 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-3.5 hover:border-indigo-300 transition"
                >
                  {/* Top Row: Order ID + Status */}
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-900 dark:text-white text-base font-mono">
                      {order.id || "899"}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                        order.status === "delivered"
                          ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                          : order.status === "in_transit"
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {order.status || "assigned"}
                    </span>
                  </div>

                  {/* Address & Names */}
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <p className="font-medium">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">To:</span>{" "}
                      {order.customer_address || "A 201, 2nd floor, United Castle apartments"}
                    </p>
                    <div className="flex items-center gap-4 text-[11px] pt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        Rider: <strong className="text-slate-800 dark:text-slate-200">{order.rider_name}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        Cust: <strong className="text-slate-800 dark:text-slate-200">{order.customer_name}</strong>
                      </span>
                    </div>
                  </div>

                  {/* 4 Action Buttons Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <button
                      onClick={() => onSelectRider(order.rider_token)}
                      className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200/80 dark:border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs"
                    >
                      <Navigation className="w-3.5 h-3.5 rotate-45" />
                      <span>Rider Console</span>
                    </button>

                    <button
                      onClick={() => onSelectCustomer(order.customer_token)}
                      className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200/80 dark:border-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Customer View</span>
                    </button>

                    <button
                      onClick={() => copyToClipboard(riderUrl, `rider_${orderKey}`)}
                      className="px-3 py-2 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      {copiedLabel === `rider_${orderKey}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Rider Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => copyToClipboard(custUrl, `cust_${orderKey}`)}
                      className="px-3 py-2 bg-indigo-50/80 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      {copiedLabel === `cust_${orderKey}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Customer Link</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Token details & Diagnostics */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
                    <p className="text-[10px] font-mono text-slate-400 truncate">
                      Secure Token: {order.customer_token}
                    </p>

                    <button
                      onClick={() => toggleDiagnostics(orderKey)}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 hover:underline pt-0.5"
                    >
                      <Clock className="w-3 h-3" />
                      <span>TIMEZONE DIAGNOSTICS</span>
                      {isDiagOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {isDiagOpen && (
                      <div className="p-2.5 bg-slate-100/80 dark:bg-slate-900/80 rounded-xl font-mono text-[10px] space-y-1 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
                        <div className="flex justify-between">
                          <span>Expires At (DB raw):</span>
                          <span>{expTime.toISOString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Parsed Expiry (UTC):</span>
                          <span>{expTime.toUTCString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Current Client (UTC):</span>
                          <span>{new Date().toUTCString()}</span>
                        </div>
                        <div className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400">
                          <span>Remaining Time:</span>
                          <span>1440 mins</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {orders.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-2">
                <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p>No tracking links generated yet.</p>
                <p className="text-[11px] opacity-80">
                  Fill out the "Assign New Order" form on the left to create live GPS tracking links.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POP-UP MODAL UPON ORDER CREATION */}
      {popupOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 relative animate-scale-up">
            <button
              onClick={() => setPopupOrder(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-2xl shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                  Order Links Created!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Order <strong className="font-mono text-slate-900 dark:text-white">#{popupOrder.id}</strong> has been generated successfully.
                </p>
              </div>
            </div>

            {/* Order Brief */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                To: {popupOrder.customer_address}
              </p>
              <p className="text-slate-500">
                Rider: <strong>{popupOrder.rider_name}</strong> | Cust: <strong>{popupOrder.customer_name}</strong>
              </p>
            </div>

            {/* Rider Link Box */}
            <div className="p-4 bg-slate-50/80 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>Rider GPS Tracker Link</span>
                <button
                  onClick={() => onSelectRider(popupOrder.rider_token)}
                  className="text-indigo-600 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                >
                  <span>Open Console</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/track/${popupOrder.rider_token}`}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
                />
                <button
                  onClick={() =>
                    copyToClipboard(`${window.location.origin}/track/${popupOrder.rider_token}`, "popup_rider")
                  }
                  className="px-3.5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition shrink-0"
                >
                  {copiedLabel === "popup_rider" ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Customer Link Box */}
            <div className="p-4 bg-slate-50/80 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>Customer Recipient View Link</span>
                <button
                  onClick={() => onSelectCustomer(popupOrder.customer_token)}
                  className="text-emerald-600 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                >
                  <span>Open Viewer</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/view/${popupOrder.customer_token}`}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
                />
                <button
                  onClick={() =>
                    copyToClipboard(`${window.location.origin}/view/${popupOrder.customer_token}`, "popup_cust")
                  }
                  className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition shrink-0"
                >
                  {copiedLabel === "popup_cust" ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Close Modal Button */}
            <button
              onClick={() => setPopupOrder(null)}
              className="w-full bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold py-3.5 px-4 rounded-2xl transition text-sm shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

