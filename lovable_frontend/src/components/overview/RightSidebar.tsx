import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "@/lib/api";
import { AlertTriangle, Circle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function RightSidebar() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData
  });

  const staffOnShift = data?.active_shifts || [];
  const aiAlerts = data?.missed_yesterday_daily || [];

  return (
    <aside className="hidden xl:flex flex-col w-[320px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto p-6 space-y-6">
      {/* On Shift Today */}
      <div className="card-atmos">
        <h3 className="text-sm font-semibold text-foreground mb-4">On Shift Today</h3>
        <div className="space-y-4">
          {staffOnShift.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">Nobody currently on shift.</p>}
          {staffOnShift.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                    {(s.user_name || "Unknown").split(" ").map((n: string) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <Circle
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${s.online ? "text-success fill-success" : "text-muted-foreground fill-muted-foreground"}`}
                  strokeWidth={2}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.user_name}</p>
                <p className="text-xs text-muted-foreground">{s.role} • {s.tasks_completed_today}/{s.tasks_assigned_today} tasks</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Alerts */}
      <div className="rounded-[20px] bg-primary/10 border border-primary/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Alerts: Missed Yesterday</h3>
        </div>
        <div className="space-y-3">
          {aiAlerts.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No missed tasks! Great job.</p>}
          {aiAlerts.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{a.template?.name || `Task #${a.id}`}</p>
                <p className="text-xs text-muted-foreground">Due By: {a.template?.time_of_day}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
