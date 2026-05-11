import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, BrainCircuit, RefreshCw, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface FeedTask {
    task_id: number;
    task_name: string;
    assigned_user_name: string | null;
    assigned_user_avatar: string | null;
    scheduled_date: string | null;
    days_overdue: number;
    alert_threshold: number;
    repeat_type?: string | null;
}

interface FeedResponse {
    as_of: string;
    daily: FeedTask[];
    planned: FeedTask[];
}

const fetchReviewFeed = async (date: string): Promise<FeedResponse> => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`https://api.trypranaextract.com/ai/review-feed?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch review feed");
    return res.json();
};

const generateInsights = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`https://api.trypranaextract.com/ai/insights`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to generate insights");
    return res.json();
};

function ItemCard({ task }: { task: FeedTask }) {
    const assignee = task.assigned_user_name || null;
    const initials = assignee
        ? assignee.split(" ").map((n) => n[0]).join("").slice(0, 2)
        : "—";
    const meta: string[] = [];
    if (task.scheduled_date) meta.push(format(new Date(task.scheduled_date), "MMM d"));
    if (assignee) meta.push(assignee);
    return (
        <Card className="flex flex-row items-center border shadow-sm hover:shadow-md transition-shadow px-3 py-2.5 mb-2">
            <Avatar className="w-7 h-7 mr-3 flex-shrink-0">
                {task.assigned_user_avatar ? (
                    <AvatarImage src={task.assigned_user_avatar} alt={assignee || ""} className="object-cover" />
                ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">{initials}</AvatarFallback>
                )}
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{task.task_name}</p>
                {meta.length > 0 && (
                    <p className="text-[11px] text-muted-foreground truncate">{meta.join(" · ")}</p>
                )}
            </div>
        </Card>
    );
}

export default function AiRecommendations() {
    const queryClient = useQueryClient();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const dateKey = format(selectedDate, "yyyy-MM-dd");

    const { data: feedData, isLoading } = useQuery({
        queryKey: ["aiReviewFeed", dateKey],
        queryFn: () => fetchReviewFeed(dateKey),
    });

    const { data: insightsData, refetch: refetchInsights, isFetching: isFetchingInsights } = useQuery({
        queryKey: ["aiFeedInsights"],
        queryFn: generateInsights,
        enabled: false,
    });

    const handleGenerateInsights = async () => {
        try {
            await refetchInsights();
            toast.success("AI Summary generated");
        } catch (e) {
            toast.error("Failed to generate AI summary");
        }
    };

    const daily = feedData?.daily || [];
    const planned = feedData?.planned || [];
    const totalMissed = daily.length + planned.length;
    const insights = insightsData?.insights || [];

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 min-h-full">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <BrainCircuit className="w-8 h-8 text-primary" />
                        AI Review Feed
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Алерты, сработавшие {isToday(selectedDate) ? "сегодня" : format(selectedDate, "d MMM yyyy")}. Пороги — в <strong>AI Alerts</strong>.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, -1))} title="Previous day">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="min-w-[180px] justify-start gap-2 font-normal">
                                <CalendarIcon className="w-4 h-4" />
                                {isToday(selectedDate) ? "Today" : format(selectedDate, "EEE, MMM d, yyyy")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(d) => d && setSelectedDate(d)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, 1))} title="Next day">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    {!isToday(selectedDate) && (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
                            Today
                        </Button>
                    )}
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button variant="default" size="sm" onClick={handleGenerateInsights} disabled={isFetchingInsights}>
                        {isFetchingInsights ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                        AI Summary
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["aiReviewFeed"] })}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {insights.length > 0 && (
                <Card className="mb-8 border-primary/30 bg-primary/5 shadow-sm">
                    <CardHeader className="pb-3 border-b border-primary/10">
                        <CardTitle className="text-lg flex items-center text-primary">
                            <BrainCircuit className="w-5 h-5 mr-2" />
                            AI Feed Summary
                        </CardTitle>
                        <CardDescription>Generated analysis of overdue tasks (current).</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <ul className="space-y-3">
                            {insights.map((insight: string, idx: number) => (
                                <li key={idx} className="flex gap-3 text-sm">
                                    <div className="mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-primary/60" />
                                    <span className="leading-relaxed font-medium text-foreground">{insight}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div className="flex h-[300px] items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
            ) : totalMissed === 0 ? (
                <Card className="border-dashed bg-card/50">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                        <CheckCircle2 className="w-16 h-16 mb-4 opacity-20 text-green-500" />
                        <h3 className="text-xl font-medium text-foreground">All Clear</h3>
                        <p className="text-sm mt-2">Нет задач, превысивших порог тревоги на этот день.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-bold">Daily Subroutines</h3>
                            <Badge variant="outline" className="bg-background">
                                {daily.length} alert{daily.length === 1 ? "" : "s"}
                            </Badge>
                        </div>
                        {daily.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Нет ежедневных задач, превысивших порог.</p>
                        ) : (
                            <div className="space-y-1">
                                {daily.map((task) => (
                                    <ItemCard key={task.task_id} task={task} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-bold">Planned & Project</h3>
                            <Badge variant="outline" className="bg-background">
                                {planned.length} alert{planned.length === 1 ? "" : "s"}
                            </Badge>
                        </div>
                        {planned.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Нет проектных/плановых задач, превысивших порог.</p>
                        ) : (
                            <div className="space-y-1">
                                {planned.map((task) => (
                                    <ItemCard key={task.task_id} task={task} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
