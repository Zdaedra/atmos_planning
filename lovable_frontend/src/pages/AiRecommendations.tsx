import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, BrainCircuit, RefreshCw, AlertCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const fetchReviewFeed = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`https://api.trypranaextract.com/ai/review-feed`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch review feed");
    return res.json();
};

const generateInsights = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`https://api.trypranaextract.com/ai/insights`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to generate insights");
    return res.json();
};

export default function AiRecommendations() {
    const queryClient = useQueryClient();

    const { data: feedData, isLoading } = useQuery({
        queryKey: ['aiReviewFeed'],
        queryFn: fetchReviewFeed,
    });

    const { data: insightsData, isLoading: isLoadingInsights, refetch: refetchInsights, isFetching: isFetchingInsights } = useQuery({
        queryKey: ['aiFeedInsights'],
        queryFn: generateInsights,
        enabled: false, // User must click to generate
    });

    const handleGenerateInsights = async () => {
        try {
            await refetchInsights();
            toast.success("AI Summary generated successfully");
        } catch (e) {
            toast.error("Failed to generate AI summary");
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">AI Review</h2>
                </div>
                <div className="flex h-[400px] items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
            </div>
        );
    }

    const { daily = [], planned = [] } = feedData || {};
    const totalMissed = daily.length + planned.length;

    const insights = insightsData?.insights || [];

    const ItemCard = ({ task, isDaily }: { task: any, isDaily: boolean }) => {
        const initials = task.assigned_user_name?.split(" ").map((n: string) => n[0]).join("") || "?";
        return (
            <Card className="flex flex-row items-center border shadow-sm transition-shadow hover:shadow-md p-4 mb-3">
                <div className="mr-4 flex-shrink-0">
                    <Avatar className="w-12 h-12 ring-2 ring-background border border-border/50 shadow-sm">
                        {task.assigned_user_avatar ? (
                            <AvatarImage src={task.assigned_user_avatar} alt={task.assigned_user_name} className="object-cover" />
                        ) : (
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {initials}
                            </AvatarFallback>
                        )}
                    </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-base truncate">{task.task_name}</h4>
                        {isDaily ? (
                            <Badge variant="destructive" className="text-[10px] uppercase">
                                Missed {task.days_overdue} {task.days_overdue === 1 ? 'Day' : 'Days'}
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="text-[10px] uppercase bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                Overdue Project
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                        Assigned to: <span className="font-medium text-foreground">{task.assigned_user_name}</span>
                    </p>
                </div>
                <div className="text-right ml-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                    <p className="font-medium text-sm text-red-600 dark:text-red-400 flex items-center justify-end gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {task.task_status}
                    </p>
                </div>
            </Card>
        );
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 min-h-full">
            <div className="flex items-center justify-between space-y-2 mb-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <BrainCircuit className="w-8 h-8 text-primary" />
                        AI Review Feed
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Daily and project tasks that were scheduled prior to today and remain incomplete.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="default" size="sm" onClick={handleGenerateInsights} disabled={isFetchingInsights}>
                        {isFetchingInsights ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                        Generate AI Summary
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['aiReviewFeed'] })}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Feed
                    </Button>
                </div>
            </div>

            {insights.length > 0 && (
                <Card className="mb-8 border-primary/30 bg-primary/5 shadow-sm">
                    <CardHeader className="pb-3 border-b border-primary/10">
                        <CardTitle className="text-lg flex items-center text-primary">
                            <BrainCircuit className="w-5 h-5 mr-2" />
                            AI Feed Summary (Новостная лента от AI)
                        </CardTitle>
                        <CardDescription>Generated analysis of the current overdue tasks.</CardDescription>
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

            {totalMissed === 0 ? (
                <Card className="border-dashed bg-card/50">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                        <CheckCircle2 className="w-16 h-16 mb-4 opacity-20 text-green-500" />
                        <h3 className="text-xl font-medium text-foreground">All Clear!</h3>
                        <p className="text-sm mt-2">There are no overdue tasks or missed daily assignments.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Daily Overdue Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-bold">Daily Subroutines</h3>
                            <Badge variant="outline" className="bg-background">
                                {daily.length} missed
                            </Badge>
                        </div>
                        {daily.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No daily tasks missed. Great job!</p>
                        ) : (
                            <div className="space-y-1">
                                {daily.map((task: any) => (
                                    <ItemCard key={task.task_id} task={task} isDaily={true} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Planned Overdue Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-bold">Planned Projects</h3>
                            <Badge variant="outline" className="bg-background">
                                {planned.length} overdue
                            </Badge>
                        </div>
                        {planned.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No planned projects overdue.</p>
                        ) : (
                            <div className="space-y-1">
                                {planned.map((task: any) => (
                                    <ItemCard key={task.task_id} task={task} isDaily={false} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
