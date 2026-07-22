import { useState, useEffect, FormEvent } from "react";
import { Plus, Link, Navigation, User, ShoppingBag, Eye, RefreshCw, Clock, CheckCircle, ShieldCheck, HelpCircle, Copy, Check } from "lucide-react";
import { TrackingLink } from "../types";
import { supabase } from "../supabaseClient";

interface AdminDashboardProps {
  onSelectRider: (token: string) => void;
  onSelectCustomer: (token: string) => void;
}

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

export default function AdminDashboard({ onSelectRider, onSelectCustomer }: AdminDashboardProps) {
  const [orders, setOrders] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assign" | "links">("links");
  
  // Create order form state
  const [orderId, setOrderId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States for copy feedback and newly created order links
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [newlyCreatedLink, setNewlyCreatedLink] = useState<TrackingLink | null>(null);
  const [modalCopied, setModalCopied] = useState(false);

  // Simulation status for active orders
  const [simulatingToken, setSimulatingToken] = useState<string | null>(null);
  const [simulationCoordsIdx, setSimulationCoordsIdx] = useState(0);

  // Singapore route simulation coordinates for realistic demo testing
  const SIMULATION_ROUTE = [
    { lat: 1.290270, lng: 103.851959 }, // Start (Marina Bay)
    { lat: 1.292500, lng: 103.852800 },
    { lat: 1.295000, lng: 103.854000 },
    { lat: 1.296500, lng: 103.851000 },
    { lat: 1.298000, lng: 103.848000 },
    { lat: 1.300500, lng: 103.845000 },
    { lat: 1.302000, lng: 103.841000 }, // Central shopping district
    { lat: 1.304000, lng: 103.839000 },
    { lat: 1.306500, lng: 103.835000 },
    { lat: 1.309000, lng: 103.832000 }, // End
  ];

  // Fetch all orders/links directly from Supabase
  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Fetch tracking links ordered by created_at descending
      const { data: links, error: linksError } = await supabase
        .from("tracking_links")
        .select("*")
        .order("created_at", { ascending: false });

      if (linksError) throw linksError;

      if (links) {
        const now = new Date();
        // Client-side auto-expiry background check & DB sync (with timezone safety)
        const expiredLinks = links.filter((link) => {
          if (link.status !== "active") return false;
          const expiryTime = parseAsUTC(link.expires_at);
          const isExpired = expiryTime.getTime() < now.getTime();
          console.log(`[Order Expiry Check] ID: ${link.order_id} | Raw Expires At: ${link.expires_at} | Parsed Expiry (UTC): ${expiryTime.toISOString()} | Current Client (UTC): ${now.toISOString()} | Is Expired?: ${isExpired}`);
          return isExpired;
        });

        if (expiredLinks.length > 0) {
          await Promise.all(
            expiredLinks.map(async (link) => {
              await supabase
                .from("tracking_links")
                .update({ status: "expired" })
                .eq("id", link.id);
              link.status = "expired";
            })
          );
        }

        // Fetch location updates to map against order_id
        const { data: locations, error: locationsError } = await supabase
          .from("location_updates")
          .select("*");

        if (locationsError) {
          console.error("Failed to fetch location updates from Supabase", locationsError);
        }

        const enriched = links.map((link) => {
          const loc = locations?.find((l) => l.order_id === link.order_id) || null;
          return {
            ...link,
            location: loc,
          };
        });

        setOrders(enriched);
      }
    } catch (err) {
      console.error("Failed to fetch orders from Supabase:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Set an interval to run the client-side check for expired active links
    const interval = setInterval(() => {
      fetchOrders();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Helper to generate a random 32-char hex token if needed
  const generateRandomToken = (): string => {
    const chars = "abcdef0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
  };

  // Handle auto simulation triggers directly on Supabase
  useEffect(() => {
    if (!simulatingToken) return;

    const interval = setInterval(async () => {
      const nextIdx = (simulationCoordsIdx + 1) % SIMULATION_ROUTE.length;
      setSimulationCoordsIdx(nextIdx);
      const coord = SIMULATION_ROUTE[nextIdx];

      const targetOrder = orders.find((o) => o.token === simulatingToken);
      if (!targetOrder) return;

      // Status lock: stop simulation updates if complete/expired
      if (targetOrder.status !== "active") {
        setSimulatingToken(null);
        return;
      }

      try {
        const { error } = await supabase
          .from("location_updates")
          .upsert({
            order_id: targetOrder.order_id,
            latitude: coord.lat,
            longitude: coord.lng,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;

        // Fetch and refresh the active order tracking list
        fetchOrders();
      } catch (err) {
        console.error("Supabase simulation update error:", err);
      }
    }, 4000); // Send updates every 4 seconds for immediate visual feedback!

    return () => clearInterval(interval);
  }, [simulatingToken, simulationCoordsIdx, orders]);

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!orderId || !riderId || !customerId || !address) {
      setFormError("All fields are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from creation
      const token = generateRandomToken();

      const newLinkObj: TrackingLink = {
        id: orderId.trim(),
        token: token,
        order_id: orderId.trim(),
        rider_id: riderId.trim(),
        customer_id: customerId.trim(),
        address: address.trim(),
        status: "active",
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const { error } = await supabase
        .from("tracking_links")
        .insert({
          order_id: newLinkObj.order_id,
          rider_id: newLinkObj.rider_id,
          customer_id: newLinkObj.customer_id,
          address: newLinkObj.address,
          token: newLinkObj.token,
          status: newLinkObj.status,
          created_at: newLinkObj.created_at,
          expires_at: newLinkObj.expires_at,
        });

      if (error) {
        throw error;
      }

      setOrderId("");
      setRiderId("");
      setCustomerId("");
      setAddress("");
      await fetchOrders();
      setNewlyCreatedLink(newLinkObj);
      setActiveTab("links");
    } catch (err: any) {
      console.error("Failed to insert tracking link:", err);
      setFormError(err.message || "Failed to create tracking link in Supabase");
    } finally {
      setIsSubmitting(false);
    }
  };


  const startSimulation = (token: string) => {
    setSimulatingToken(token);
    setSimulationCoordsIdx(0);
  };

  const stopSimulation = () => {
    setSimulatingToken(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 font-sans">
      
      {/* Newly Created Order/Rider Tracking Link Success Modal */}
      {newlyCreatedLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-xl max-w-md w-full p-6 text-center space-y-4 transition-colors duration-200">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-2">
              <CheckCircle className="h-6 w-6" />
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white font-display">Tracking Link Generated!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This secure link is ready to be sent to your rider.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 text-left text-xs space-y-2 border border-slate-100 dark:border-slate-800/80 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500">Order ID:</span>
                <span className="font-bold text-slate-900 dark:text-white">{newlyCreatedLink.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500">Rider:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{newlyCreatedLink.rider_id}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex flex-col gap-1">
                <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold tracking-wider">Delivery Address:</span>
                <span className="text-slate-700 dark:text-slate-300 leading-normal">{newlyCreatedLink.address}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Rider Secure Link</label>
              <div className="flex items-center gap-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-2.5">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/track/${newlyCreatedLink.token}`}
                  className="bg-transparent border-none outline-none text-xs font-mono text-indigo-700 dark:text-indigo-300 flex-1 select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/track/${newlyCreatedLink.token}`);
                    setModalCopied(true);
                    setTimeout(() => setModalCopied(false), 2000);
                  }}
                  className={`p-2 rounded-lg transition shrink-0 ${
                    modalCopied ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                  title="Copy Rider Link"
                >
                  {modalCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setNewlyCreatedLink(null);
                setModalCopied(false);
              }}
              className="w-full py-3 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition"
            >
              Done & Return to Dashboard
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile-Friendly Tab Switcher: Only visible on mobile/tablet viewports */}
      <div className="flex lg:hidden bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-6 max-w-md mx-auto transition-colors duration-200">
        <button
          onClick={() => setActiveTab("links")}
          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition duration-150 flex items-center justify-center gap-2 ${
            activeTab === "links"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Active Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab("assign")}
          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition duration-150 flex items-center justify-center gap-2 ${
            activeTab === "assign"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Assign New Order
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Order assignment form */}
        <div className={`lg:col-span-5 space-y-6 ${activeTab === "assign" ? "block" : "hidden lg:block"}`}>
          
          {/* Create Tracking Link Form */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm transition-colors duration-200">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">Assign New Order</h2>
            </div>
            
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Order ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="e.g. ORD-9012"
                    className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition-colors duration-150"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Rider ID / Name
                </label>
                <input
                  type="text"
                  value={riderId}
                  onChange={(e) => setRiderId(e.target.value)}
                  placeholder="e.g. Rider-Tom"
                  className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition-colors duration-150"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Customer ID / Name
                </label>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="e.g. Cust-Emma"
                  className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition-colors duration-150"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Delivery Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 10 Bayfront Ave, Singapore 018956"
                  className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition-colors duration-150"
                />
              </div>

              {formError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900/30">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition shadow-md shadow-indigo-100/10 dark:shadow-none flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Generate Secure Tracking Link
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Live list of generated tracking links */}
        <div className={`lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm flex flex-col min-h-[500px] transition-colors duration-200 ${activeTab === "links" ? "block" : "hidden lg:block"}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">Active Tracking Links</h2>
            </div>
            <button
              onClick={fetchOrders}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              title="Refresh database"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mb-3" />
              <p className="text-slate-400 text-xs">Polling generated delivery orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
              <Link className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-slate-600 dark:text-slate-400 font-semibold text-sm">No Active Delivery Sessions</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs max-w-xs mt-1">
                Assign an order on the left panel to instantly generate secure browser-to-browser tracking links!
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
              {orders.map((link) => {
                const isActive = link.status === "active";
                const isDelivered = link.status === "delivered";
                const isExpired = link.status === "expired";
                const isThisSimulating = simulatingToken === link.token;

                return (
                  <div
                    key={link.id}
                    className={`p-4 border rounded-2xl transition-all duration-150 relative overflow-hidden ${
                      isThisSimulating 
                        ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10" 
                        : "border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white font-display text-sm">{link.order_id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300" :
                            isDelivered ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300" : "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                          }`}>
                            {link.status}
                          </span>
                        </div>
                        {link.address && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">To:</span> {link.address}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Rider: {link.rider_id}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Cust: {link.customer_id}
                          </span>
                        </div>
                      </div>

                      {/* Simulation Widget */}
                      {isActive && (
                        <div>
                          {isThisSimulating ? (
                            <button
                              onClick={stopSimulation}
                              className="bg-indigo-600 text-white hover:bg-indigo-700 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-pulse transition"
                            >
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Stop Simulating
                            </button>
                          ) : (
                            <button
                              onClick={() => startSimulation(link.token)}
                              className="bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                              title="Emulate rider movement around Singapore"
                            >
                              <Navigation className="w-3 h-3 text-emerald-400" />
                              Simulate Movement
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tracking link routes shortcut buttons */}
                    <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-850/60">
                      <button
                        onClick={() => onSelectRider(link.token)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-xl flex items-center gap-1.5 transition flex-1 justify-center min-w-[120px]"
                      >
                        <Navigation className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                        Rider Console
                      </button>

                      <button
                        onClick={() => onSelectCustomer(link.token)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-xl flex items-center gap-1.5 transition flex-1 justify-center min-w-[120px]"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        Customer View
                      </button>

                      <button
                        onClick={() => {
                          const riderLink = `${window.location.origin}/track/${link.token}`;
                          navigator.clipboard.writeText(riderLink);
                          setCopiedToken(link.token);
                          setTimeout(() => setCopiedToken(null), 2000);
                        }}
                        className={`text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition flex-1 justify-center min-w-[120px] ${
                          copiedToken === link.token
                            ? "bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
                            : "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300"
                        }`}
                        title="Copy secure link for WhatsApp/SMS"
                      >
                        {copiedToken === link.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-450" />
                            Copied Link!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-450" />
                            Copy Rider Link
                          </>
                        )}
                      </button>
                    </div>

                     {/* Token path info text */}
                    <div className="mt-2 text-[10px] font-mono text-slate-400/80 dark:text-slate-500 truncate px-1 flex justify-between items-center">
                      <span>Secure Token: {link.token}</span>
                    </div>

                    {/* Expiry Debug & Diagnostics */}
                    <div className="mt-2.5 pt-2 border-t border-dashed border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/40 p-2.5 rounded-xl space-y-1 transition-colors duration-200">
                      <div className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> Timezone Diagnostics
                      </div>
                      <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                        <div><span className="font-semibold text-slate-700 dark:text-slate-300">Expires At (DB raw):</span></div>
                        <div className="text-right text-slate-850 dark:text-slate-200 break-all">{link.expires_at}</div>

                        <div><span className="font-semibold text-slate-700 dark:text-slate-300">Parsed Expiry (UTC):</span></div>
                        <div className="text-right text-slate-850 dark:text-slate-200">{parseAsUTC(link.expires_at).toISOString()}</div>

                        <div><span className="font-semibold text-slate-700 dark:text-slate-300">Current Client (UTC):</span></div>
                        <div className="text-right text-slate-850 dark:text-slate-200">{new Date().toISOString()}</div>

                        <div><span className="font-semibold text-slate-700 dark:text-slate-300">Remaining Time:</span></div>
                        <div className="text-right font-bold text-indigo-600 dark:text-indigo-400">
                          {Math.round((parseAsUTC(link.expires_at).getTime() - Date.now()) / (60 * 1000))} mins
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
