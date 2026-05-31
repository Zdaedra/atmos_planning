import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, isToday, parseISO } from "date-fns";
import { fetchDashboardData } from "@/lib/api";
import { AlertTriangle, Circle, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AlertTask {
  task_id: number;
  task_name: string;
  scheduled_date: string | null;
  assigned_user_name: string | null;
  alert_threshold: number;
  repeat_type?: string | null;
}

interface FeedResponse {
  as_of: string;
  daily: AlertTask[];
  planned: AlertTask[];
}

async function fetchFeed(dateKey: string): Promise<FeedResponse> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`https://api.atmos-steam.com/ai/review-feed?date=${dateKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load alerts");
  return res.json();
}

export function RightSidebar({ dateKey }: { dateKey?: string }) {
  // Staff-on-shift block stays bound to "today" — it's a live indicator.
  const { data: dashData } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => fetchDashboardData(),
  });

  const effectiveDate = dateKey || format(new Date(), "yyyy-MM-dd");
  const { data: feed, isLoading: alertsLoading } = useQuery({
    queryKey: ["aiReviewFeed", effectiveDate],
    queryFn: () => fetchFeed(effectiveDate),
  });

  const staffOnShift = dashData?.active_shifts || [];
  const allAlerts: AlertTask[] = [...(feed?.daily || []), ...(feed?.planned || [])];
  const dayLabel = isToday(parseISO(effectiveDate)) ? "сегодня" : format(parseISO(effectiveDate), "d MMM");

  return (
    <aside className="hidden xl:flex flex-col w-[320px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto p-6 space-y-6">
      {/* On Shift Today */}
      <div className="card-atmos">
        <h3 className="text-sm font-semibold text-foreground mb-4">On Shift Today</h3>
        <div className="space-y-4">
          {staffOnShift.length === 0 && (
            <p className="text-sm text-muted-foreground">Nobody currently on shift.</p>
          )}
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
                <p className="text-xs text-muted-foreground">
                  {s.role} • {s.tasks_completed_today}/{s.tasks_assigned_today} tasks
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Alerts (matches /ai/review-feed for the selected day) */}
      <div className="rounded-[20px] bg-primary/10 border border-primary/20 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI Alerts · {dayLabel}</h3>
          </div>
          <Link
            to="/ai"
            className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            title="Open full AI Review feed"
          >
            All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {alertsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : allAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Алертов нет — всё в норме.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-3">
              Сработало: {feed?.daily.length || 0} daily · {feed?.planned.length || 0} project
            </p>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {allAlerts.slice(0, 10).map((a) => (
                <div key={a.task_id} className="flex items-start gap-2" title={a.task_name}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug break-words line-clamp-2">
                      {a.task_name}
                    </p>
                    {(a.scheduled_date || a.assigned_user_name) && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {[
                          a.scheduled_date && format(new Date(a.scheduled_date), "d MMM"),
                          a.assigned_user_name,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {allAlerts.length > 10 && (
                <Link to="/ai" className="block text-[11px] text-primary hover:underline mt-2 text-center">
                  +{allAlerts.length - 10} more — open full feed
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
