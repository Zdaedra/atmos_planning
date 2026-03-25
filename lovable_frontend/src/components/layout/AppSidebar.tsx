import { LayoutDashboard, Calendar, CheckSquare, Users, LogOut, BarChart3, BrainCircuit } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import atmosLogo from "@/assets/atmos-logo.jpg";

const navItems = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Staff", path: "/stats", icon: BarChart3 },
  { label: "AI Review", path: "/ai", icon: BrainCircuit },
];

export function AppSidebar() {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[260px] bg-black border-r border-border/10 flex-col z-30">
      <div className="px-4 pt-4 pb-6">
        <img src={atmosLogo} alt="Atmos" className="w-full rounded-xl object-cover" />
        <p className="text-center text-xs font-semibold tracking-widest uppercase text-white/50 mt-3">
          Control Center
        </p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
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
