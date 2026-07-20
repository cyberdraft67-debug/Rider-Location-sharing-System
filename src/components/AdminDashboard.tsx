import { useState, useEffect, FormEvent } from "react";
import { Plus, Link, Navigation, User, ShoppingBag, Eye, RefreshCw, Clock, CheckCircle, ExternalLink, ShieldCheck, HelpCircle } from "lucide-react";
import { TrackingLink } from "../types";

interface AdminDashboardProps {
  onSelectRider: (token: string) => void;
  onSelectCustomer: (token: string) => void;
}

export default function AdminDashboard({ onSelectRider, onSelectCustomer }: AdminDashboardProps) {
  const [orders, setOrders] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create order form state
  const [orderId, setOrderId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Fetch all orders/links
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to fetch orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Handle auto simulation triggers
  useEffect(() => {
    if (!simulatingToken) return;

    const interval = setInterval(async () => {
      const nextIdx = (simulationCoordsIdx + 1) % SIMULATION_ROUTE.length;
      setSimulationCoordsIdx(nextIdx);
      const coord = SIMULATION_ROUTE[nextIdx];

      try {
        await fetch(`/api/tracking/${simulatingToken}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: coord.lat, longitude: coord.lng }),
        });
        // Reload local list
        const res = await fetch("/api/orders");
        if (res.ok) {
          const data = await res.json();
          setOrders(data);
        }
      } catch (err) {
        console.error("Simulation error", err);
      }
    }, 4000); // Send updates every 4 seconds for immediate visual feedback!

    return () => clearInterval(interval);
  }, [simulatingToken, simulationCoordsIdx]);

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!orderId || !riderId || !customerId) {
      setFormError("All fields are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          rider_id: riderId,
          customer_id: customerId,
        }),
      });

      if (res.ok) {
        setOrderId("");
        setRiderId("");
        setCustomerId("");
        fetchOrders();
      } else {
        const txt = await res.text();
        setFormError(txt || "Failed to create tracking link");
      }
    } catch (err) {
      setFormError("Network error. Could not reach local Express backend.");
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto px-4 py-6 font-sans">
      
      {/* LEFT: Order assignment form & system architecture */}
      <div className="lg:col-span-5 space-y-6">
        
        {/* Create Tracking Link Form */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900 font-display">Assign New Order</h2>
          </div>
          
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Order ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="e.g. ORD-9012"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Rider ID / Name
                </label>
                <input
                  type="text"
                  value={riderId}
                  onChange={(e) => setRiderId(e.target.value)}
                  placeholder="e.g. Rider-Tom"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Customer ID / Name
                </label>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="e.g. Cust-Emma"
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm transition"
                />
              </div>
            </div>

            {formError && (
              <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-2 text-sm"
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

        {/* GitHub Integration Info */}
        <div className="bg-gradient-to-br from-gray-900 to-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10">
            <svg viewBox="0 0 24 24" width="160" height="160" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          
          <div className="flex items-center gap-2.5 mb-3">
            <div className="bg-white/10 p-1.5 rounded-lg">
              <ExternalLink className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="font-bold text-base font-display">Export to GitHub</h3>
          </div>
          
          <p className="text-gray-300 text-xs leading-relaxed mb-4">
            Connect your workspace directly to a personal or organizational GitHub repository to instantly sync code:
          </p>
          
          <ol className="text-xs space-y-2.5 text-gray-300 list-decimal pl-4">
            <li>
              Click the <strong className="text-white">Settings Icon (⚙️)</strong> in the top menu bar of the Google AI Studio page.
            </li>
            <li>
              Navigate to the <strong className="text-white">GitHub Connection</strong> or export option inside the panel.
            </li>
            <li>
              Authenticate with your GitHub account, pick your target repository, and the system will automatically push all commits there!
            </li>
          </ol>
        </div>
      </div>

      {/* RIGHT: Live list of generated tracking links */}
      <div className="lg:col-span-7 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col min-h-[500px]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900 font-display">Active Tracking Links</h2>
          </div>
          <button
            onClick={fetchOrders}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition"
            title="Refresh database"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mb-3" />
            <p className="text-gray-400 text-xs">Polling generated delivery orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
            <Link className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-gray-600 font-semibold text-sm">No Active Delivery Sessions</p>
            <p className="text-gray-400 text-xs max-w-xs mt-1">
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
                  className={`p-4 border rounded-2xl transition duration-150 relative overflow-hidden ${
                    isThisSimulating ? "border-indigo-400 bg-indigo-50/10" : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 font-display text-sm">{link.order_id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isActive ? "bg-emerald-100 text-emerald-800" :
                          isDelivered ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {link.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400" /> Rider: {link.rider_id}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400" /> Cust: {link.customer_id}
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
                            className="bg-gray-800 text-white hover:bg-gray-900 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
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
                  <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => onSelectRider(link.token)}
                      className="bg-white border border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20 text-xs font-semibold text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-xl flex items-center gap-1.5 transition flex-1 justify-center min-w-[120px]"
                    >
                      <Navigation className="w-3.5 h-3.5 text-indigo-500" />
                      Rider Console
                    </button>

                    <button
                      onClick={() => onSelectCustomer(link.token)}
                      className="bg-white border border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20 text-xs font-semibold text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-xl flex items-center gap-1.5 transition flex-1 justify-center min-w-[120px]"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
                      Customer View
                    </button>
                  </div>

                  {/* Token path info text */}
                  <div className="mt-2 text-[10px] font-mono text-gray-400/80 truncate px-1">
                    Secure Token: {link.token}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
