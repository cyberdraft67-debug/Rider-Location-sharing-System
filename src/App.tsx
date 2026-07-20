import { useState, useEffect } from "react";
import { Navigation, Heart } from "lucide-react";
import AdminDashboard from "./components/AdminDashboard";
import RiderTracker from "./components/RiderTracker";
import CustomerViewer from "./components/CustomerViewer";

type ViewState = 
  | { type: "dashboard" }
  | { type: "rider"; token: string }
  | { type: "customer"; token: string };

export default function App() {
  const [view, setView] = useState<ViewState>({ type: "dashboard" });

  // Handle browser routing (support deep linking for both path-based /track/token and query-based /?view=token)
  useEffect(() => {
    const handleRoute = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      
      const queryPage = searchParams.get("page");
      const queryToken = searchParams.get("token");

      if (queryPage === "track" && queryToken) {
        setView({ type: "rider", token: queryToken });
      } else if (queryPage === "view" && queryToken) {
        setView({ type: "customer", token: queryToken });
      } else if (path.startsWith("/track/")) {
        const token = path.replace("/track/", "");
        if (token) setView({ type: "rider", token });
      } else if (path.startsWith("/view/")) {
        const token = path.replace("/view/", "");
        if (token) setView({ type: "customer", token });
      } else {
        setView({ type: "dashboard" });
      }
    };

    handleRoute();
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, []);

  // Safe navigation wrapper that updates state and pushState
  const navigateTo = (newView: ViewState) => {
    setView(newView);
    if (newView.type === "dashboard") {
      window.history.pushState({}, "", "/");
    } else if (newView.type === "rider") {
      window.history.pushState({}, "", `/?page=track&token=${newView.token}`);
    } else if (newView.type === "customer") {
      window.history.pushState({}, "", `/?page=view&token=${newView.token}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between font-sans selection:bg-indigo-100">
      
      {/* Main active view stage */}
      <main className="flex-1 py-8">
        {view.type === "dashboard" && (
          <AdminDashboard
            onSelectRider={(token) => navigateTo({ type: "rider", token })}
            onSelectCustomer={(token) => navigateTo({ type: "customer", token })}
          />
        )}

        {view.type === "rider" && (
          <RiderTracker
            token={view.token}
            onGoBack={() => navigateTo({ type: "dashboard" })}
          />
        )}

        {view.type === "customer" && (
          <CustomerViewer
            token={view.token}
            onGoBack={() => navigateTo({ type: "dashboard" })}
          />
        )}
      </main>

      {/* Aesthetic human-friendly developer footer */}
      <footer className="bg-white border-t border-gray-100 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span>Built with React, Express & Leaflet</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Full-stack Delivery Mapping Service</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
