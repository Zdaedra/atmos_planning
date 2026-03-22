import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, BrainCircuit, ExternalLink, RefreshCw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const fetchRecommendations = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`http://89.167.122.76:4080/ai/recommendations`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch AI recommendations");
    return res.json();
};

const generateInsights = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`http://89.167.122.76:4080/ai/insights`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to generate insights");
    return res.json();
};

const resolveFlag = async ({ taskId, action }: { taskId: number, action: string }) => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`http://89.167.122.76:4080/ai/${taskId}/resolve?action=${action}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to resolve AI flag");
    return res.json();
};

export default function AiRecommendations() {
    const queryClient = useQueryClient();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [insights, setInsights] = useState<string[]>([]);

    const { data: recommendations, isLoading } = useQuery({
        queryKey: ['aiRecommendations'],
        queryFn: fetchRecommendations,
    });

    const resolveMutation = useMutation({
        mutationFn: resolveFlag,
        onSuccess: (data) => {
            toast.success(`Task has been ${data.task_status === 'Completed' ? 'approved' : 'rejected'}`);
            queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] });
        },
        onError: () => toast.error("Failed to process action")
    });

    const insightsMutation = useMutation({
        mutationFn: generateInsights,
        onSuccess: (data) => {
            setInsights(data.insights);
            toast.success("Insights generated successfully");
        },
        onError: () => toast.error("Failed to generate insights")
    });


    if (isLoading) {
        return (
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">AI Recommendations</h2>
                </div>
                <div className="flex h-[400px] items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-muted/10 min-h-full">
            <div className="flex items-center justify-between space-y-2 mb-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <BrainCircuit className="w-8 h-8 text-primary" />
                        AI Analysis & Review
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Tasks flagged across the facility requiring manual operator intervention.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="default" size="sm" onClick={() => insightsMutation.mutate()} disabled={insightsMutation.isPending}>
                        {insightsMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                        Generate Staff Insights
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] })}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Feed
                    </Button>
                </div>
            </div>

            {insights.length > 0 && (
                <Card className="mb-8 border-primary/20 bg-primary/5 shadow-sm">
                    <CardHeader className="pb-3 border-b border-primary/10">
                        <CardTitle className="text-lg flex items-center text-primary">
                            <BrainCircuit className="w-5 h-5 mr-2" />
                            Weekly Staff Insights
                        </CardTitle>
                        <CardDescription>AI-generated retrospective on staff performance and quality trends.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <ul className="space-y-3">
                            {insights.map((insight, idx) => (
                                <li key={idx} className="flex gap-3 text-sm">
                                    <div className="mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-primary/60" />
                                    <span className="leading-relaxed font-medium">{insight}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {(!recommendations || recommendations.length === 0) ? (
                <Card className="border-dashed bg-card/50">
                    <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <CheckCircle2 className="w-16 h-16 mb-4 opacity-20 text-green-500" />
                        <h3 className="text-lg font-medium">All Clear!</h3>
                        <p className="text-sm">No anomalous tasks have been flagged by the AI engine.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {recommendations.map((task: any) => (
                        <Card key={task.task_id} className="overflow-hidden border shadow-sm transition-shadow hover:shadow-md flex flex-col">
                            <div className="flex flex-1 flex-col sm:flex-row">
                                {/* Image Preview Section */}
                                <div className="sm:w-2/5 md:w-1/3 bg-muted/30 relative flex items-center justify-center p-4 border-r border-border/50">
                                    {task.photos && task.photos.length > 0 ? (
                                        <div
                                            className="relative group cursor-pointer w-full h-full min-h-[160px] rounded-md overflow-hidden"
                                            onClick={() => setSelectedImage(task.photos[0].url)}
                                        >
                                            <img
                                                src={task.photos[0].url}
                                                alt="Verification"
                                                className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-300"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-md">
                                                <ExternalLink className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full min-h-[160px] rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                                            No Photo
                                        </div>
                                    )}
                                </div>

                                {/* Content Section */}
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className="font-semibold text-lg line-clamp-1">{task.task_name}</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">By {task.assigned_user_name}</p>
                                        </div>
                                        <Badge variant="destructive" className="ml-2 uppercase text-[10px] tracking-wider px-2 shadow-sm whitespace-nowrap">
                                            Flagged
                                        </Badge>
                                    </div>

                                    <div className="bg-red-50/50 border border-red-100 dark:border-red-900/30 dark:bg-red-950/20 rounded-md p-3 my-4 flex-1">
                                        <div className="flex items-start gap-2">
                                            <BrainCircuit className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-semibold text-xs text-red-700 dark:text-red-400 block mb-1">AI Reasoning:</span>
                                                <p className="text-sm text-foreground/80 leading-snug">
                                                    {task.ai_reasoning}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 mt-auto pt-2">
                                        <Button
                                            variant="outline"
                                            className="flex-1 border-primary/20 hover:bg-primary/5 text-primary"
                                            onClick={() => resolveMutation.mutate({ taskId: task.task_id, action: 'accept' })}
                                            disabled={resolveMutation.isPending}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Accept
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            className="flex-1 gap-2"
                                            onClick={() => resolveMutation.mutate({ taskId: task.task_id, action: 'reject' })}
                                            disabled={resolveMutation.isPending}
                                        >
                                            <XCircle className="w-4 h-4" /> Reject Remake
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Image Preview Modal */}
            <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-4xl p-1 bg-transparent border-0 shadow-none">
                    {selectedImage && (
                        <img
                            src={selectedImage}
                            alt="Full verification preview"
                            className="w-full h-auto max-h-[90vh] object-contain rounded-xl"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
