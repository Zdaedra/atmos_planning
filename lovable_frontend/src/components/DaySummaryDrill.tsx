import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ListChecks, CheckCircle2, Clock, TrendingUp, AlertTriangle, ChevronDown } from "lucide-react";
import { fetchDashboardData } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserBadge } from "@/components/UserBadge";
import { TaskPhotos, OverdueBadge } from "@/components/TaskRowExtras";

type CategoryKey = "total" | "completed" | "remaining" | "overdue";

interface Props {
    dateKey: string;
    userId?: number;
}

export function DaySummaryDrill({ dateKey, userId }: Props) {
    const { data, isLoading } = useQuery({
        queryKey: ["dashboard", dateKey, "user", userId ?? "all"],
        queryFn: () => fetchDashboardData(dateKey, userId),
    });

    const k = data?.kpis || {
        total_tasks_today: 0,
        completed_tasks_today: 0,
        total_not_completed_today: 0,
        completion_rate: 0,
        overdue_tasks: 0,
    };
    const tasks: any[] = data?.today_tasks || [];
    const overdue: any[] = data?.overdue_tasks_list || [];

    const [open, setOpen] = useState<CategoryKey | null>(null);

    const lists: Record<CategoryKey, any[]> = {
        total: tasks,
        completed: tasks.filter((t) => t.status === "Completed"),
        remaining: tasks.filter((t) => t.status !== "Completed"),
        overdue,
    };

    const cards: { key: CategoryKey | "rate"; label: string; value: any; icon: any; tone: string }[] = [
        { key: "total", label: "Total", value: k.total_tasks_today, icon: ListChecks, tone: "" },
        { key: "completed", label: "Completed", value: k.completed_tasks_today, icon: CheckCircle2, tone: "text-success" },
        { key: "remaining", label: "Remaining", value: k.total_not_completed_today, icon: Clock, tone: "" },
        { key: "rate", label: "Rate", value: `${k.completion_rate}%`, icon: TrendingUp, tone: "" },
        { key: "overdue", label: "Overdue", value: k.overdue_tasks, icon: AlertTriangle, tone: k.overdue_tasks > 0 ? "text-destructive" : "" },
    ];

    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {cards.map((c) => {
                    const clickable = c.key !== "rate";
                    const active = clickable && open === c.key;
                    return (
                        <button
                            key={c.key}
                            type="button"
                            disabled={!clickable}
                            onClick={() => clickable && setOpen(active ? null : (c.key as CategoryKey))}
                            className={cn(
                                "rounded-md border bg-card px-3 py-2.5 text-left transition-all",
                                clickable && "hover:bg-accent/40 cursor-pointer",
                                active && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            )}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{c.label}</span>
                                {clickable && <ChevronDown className={cn("w-3 h-3 text-muted-foreground ml-auto transition-transform", active && "rotate-180")} />}
                            </div>
                            <p className={cn("text-xl font-semibold", c.tone || "text-foreground")}>
                                {isLoading ? "…" : c.value}
                            </p>
                        </button>
                    );
                })}
            </div>

            {open && (
                <div className="mt-3 border rounded-md bg-card">
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                        <h4 className="text-sm font-semibold capitalize">
                            {open} ({lists[open].length})
                        </h4>
                        <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setOpen(null)}
                        >
                            Close
                        </button>
                    </div>
                    <TaskList tasks={lists[open]} />
                </div>
            )}
        </div>
    );
}

function TaskList({ tasks }: { tasks: any[] }) {
    if (!tasks.length) {
        return <p className="text-sm text-muted-foreground p-4 text-center">Ничего не найдено в этой категории.</p>;
    }
    return (
        <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {tasks.map((t) => {
                const tod = (t.template?.time_of_day || "anytime").toLowerCase();
                const shiftBadge = ["1", "morning"].includes(tod)
                    ? <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Shift 1</Badge>
                    : ["2", "evening"].includes(tod)
                    ? <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Shift 2</Badge>
                    : <Badge variant="secondary" className="text-[10px] w-14 justify-center">Both</Badge>;
                return (
                    <div key={t.id} className={cn("flex items-center gap-3 px-3 py-2", t.status === "Completed" && "opacity-70")}>
                        {shiftBadge}
                        {t.status === "Completed" && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                        <span className={cn("text-sm font-medium flex-1 truncate", t.status === "Completed" && "line-through text-muted-foreground")}>
                            {t.template?.name || `Task #${t.id}`}
                        </span>
                        <OverdueBadge task={t} />
                        <TaskPhotos task={t} max={3} />
                        {t.template?.repeat_type && (
                            <Badge variant="secondary" className="text-[10px] capitalize">{t.template.repeat_type}</Badge>
                        )}
                        {t.assigned_user && <UserBadge userId={t.assigned_user} />}
                        {t.scheduled_date && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {format(new Date(t.scheduled_date), "MMM d")}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
