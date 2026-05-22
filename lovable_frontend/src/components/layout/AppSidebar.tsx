import { useState } from "react";
import { LayoutDashboard, Calendar, CheckSquare, LogOut, BarChart3, BrainCircuit, Bell, Flame, ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import atmosLogo from "@/assets/atmos-logo.jpg";

const navItems = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Staff", path: "/stats", icon: BarChart3 },
  { label: "AI Review", path: "/ai", icon: BrainCircuit },
  { label: "AI Alerts", path: "/settings/alerts", icon: Bell },
];

const steamItems = [
  { label: "Schedule", path: "/steam/schedule" },
  { label: "Bookings", path: "/steam/bookings" },
  { label: "Staff",    path: "/steam/staff" },
  { label: "Settings", path: "/steam/settings" },
];

export function AppSidebar() {
  const location = useLocation();
  const steamActive = location.pathname.startsWith("/steam");
  const [steamOpen, setSteamOpen] = useState(steamActive);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[260px] bg-black border-r border-border/10 flex-col z-30">
      <div className="px-4 pt-4 pb-6">
        <img src={atmosLogo} alt="Atmos" className="w-full rounded-xl object-cover" />
        <p className="text-center text-xs font-semibold tracking-widest uppercase text-white/50 mt-3">
          Control Center
        </p>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors duration-100",
                isActive
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )
            }
          >
            <item.icon className="w-5 h-5" strokeWidth={2} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setSteamOpen((v) => !v)}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors duration-100 w-full text-left",
            steamActive
              ? "bg-white/10 text-white font-medium"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          )}
        >
          <Flame className="w-5 h-5" strokeWidth={2} />
          <span className="flex-1">Steam</span>
          <ChevronRight className={cn("w-4 h-4 transition-transform", steamOpen && "rotate-90")} />
        </button>

        {steamOpen && (
          <div className="ml-2 pl-4 border-l border-white/10 space-y-1">
            {steamItems.map((s) => (
              <NavLink
                key={s.path}
                to={s.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center px-4 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-white/10 text-white font-medium"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  )
                }
              >
                {s.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="px-4 pb-6">
        <button
          onClick={() => {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5" strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
