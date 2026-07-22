import { useState, useEffect } from "react";
import { Navigation, Sun, Moon } from "lucide-react";
import AdminDashboard from "./components/AdminDashboard";
import RiderTracker from "./components/RiderTracker";
import CustomerViewer from "./components/CustomerViewer";

type ViewState = 
  | { type: "dashboard" }
  | { type: "rider"; token: string }
  | { type: "customer"; token: string };

export default function App() {
  const [view, setView] = useState<ViewState>({ type: "dashboard" });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") return saved;
    }
    return "light";
  });

  // Handle browser routing:
  // 1. / -> Full Dashboard
  // 2. /track/[token] -> RiderTracker
  // 3. /view/[token] -> CustomerViewer
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
        else setView({ type: "dashboard" });
      } else if (path.startsWith("/view/")) {
        const token = path.replace("/view/", "");
        if (token) setView({ type: "customer", token });
        else setView({ type: "dashboard" });
      } else {
        setView({ type: "dashboard" });
      }
    };

    handleRoute();
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const navigateTo = (newView: ViewState) => {
    setView(newView);
    if (newView.type === "dashboard") {
      window.history.pushState({}, "", "/");
    } else if (newView.type === "rider") {
      window.history.pushState({}, "", `/track/${newView.token}`);
    } else if (newView.type === "customer") {
      window.history.pushState({}, "", `/view/${newView.token}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between font-sans selection:bg-indigo-100 dark:selection:bg-indigo-950 transition-colors duration-200">
      
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 py-4 px-6 transition-colors duration-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => navigateTo({ type: "dashboard" })}>
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <Navigation className="w-5 h-5 rotate-45" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 dark:text-white font-display">RoutePulse</h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-wide uppercase">RIDER LOCATION TRACKER</p>
            </div>
          </div>
          
          <button
            onClick={toggleTheme}
            className="p-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 transition-all shadow-sm border border-slate-200/40 dark:border-slate-700/50 flex items-center gap-2 text-xs font-bold"
            aria-label="Toggle Theme"
          >
            {theme === "light" ? (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span>Dark Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Light Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-6 sm:py-8">
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

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 py-6 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-1.5">
            <span>RoutePulse Location Tracking Service</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Real-time GPS Delivery Stream</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
