import { Progress } from "@/components/ui/progress";
import { ListChecks, CheckCircle2, Clock, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "@/lib/api";
import { cn } from "@/lib/utils";

interface KpiCardsProps {
  active: string | null;
  setActive: (val: string | null) => void;
}

export function KpiCards({ active, setActive }: KpiCardsProps) {

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData
  });

  const kpis = data?.kpis || {
    total_tasks_today: 0,
    completed_tasks_today: 0,
    total_not_completed_today: 0,
    completion_rate: 0,
    active_supervisors: 0,
    overdue_tasks: 0
  };

  const todayTasks = data?.today_tasks || [];

  const cards = [
    {
      label: "Total Tasks Today",
      value: kpis.total_tasks_today,
      icon: ListChecks,
      color: "text-foreground",
    },
    {
      label: "Completed",
      value: kpis.completed_tasks_today,
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Remaining / Left",
      value: kpis.total_not_completed_today,
      icon: Clock,
      color: "text-foreground",
    },
    {
      label: "Completion Rate",
      value: `${kpis.completion_rate}%`,
      icon: TrendingUp,
      color: "text-foreground",
      progress: kpis.completion_rate,
    },
    {
      label: "Staff On Shift",
      value: kpis.active_supervisors,
      icon: Users,
      color: "text-foreground",
    },
    {
      label: "Carry-over Load",
      value: kpis.overdue_tasks,
      icon: AlertTriangle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          onClick={() => setActive(active === card.label ? null : card.label)}
          className={cn(
            "card-atmos card-hover cursor-pointer transition-all duration-150",
            active === card.label && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <card.icon className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
          </div>
          <p className={`text-2xl font-semibold ${card.color}`}>{card.value}</p>
          {card.progress !== undefined && (
            <Progress value={card.progress} className="mt-3 h-2" />
          )}
        </div>
      ))}
    </div>
  );
}
