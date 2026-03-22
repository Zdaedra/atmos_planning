import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { Users, CheckCircle2, AlertTriangle, CalendarDays, MapPin, Activity, Clock, XCircle, Send, Plus, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addDays, addMonths, isBefore } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { fetchTasksForUser, fetchFailedTasks, fetchSupervisorShifts, markTaskComplete, revertTask } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { UserBadge } from "@/components/UserBadge";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function StaffStatsPage() {
    const queryClient = useQueryClient();
    const [timeframe, setTimeframe] = useState<"today" | "week" | "month" | "all">("week");
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    const toggleTaskStatusMutation = useMutation({
        mutationFn: async (payload: { task_id: number; currentStatus: string }) => {
            if (payload.currentStatus === "Completed") {
                return revertTask({ task_id: payload.task_id, comments: "Admin override" });
            } else {
                return markTaskComplete({ task_id: payload.task_id, comments: "Admin override" });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["supervisorShifts", selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ["supervisorStats", selectedUserId] });
            toast.success("Task status updated");
        },
        onError: (err: any) => {
            toast.error("Failed to update status: " + err.message);
        }
    });

    // Form states
    const [msgText, setMsgText] = useState("");
    const [assignDate, setAssignDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [assignTpls, setAssignTpls] = useState<string[]>([]);
    const [assignAll, setAssignAll] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isUnassignModalOpen, setIsUnassignModalOpen] = useState(false);

    // Personal Calendar state
    const [personalDate, setPersonalDate] = useState<Date>(new Date());
    const [openPersonalAccordions, setOpenPersonalAccordions] = useState<string[]>([]);

    // Add User states
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [newUserName, setNewUserName] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("supervisor");

    const { data: globalStats, isLoading: isLoadingGlobal, refetch: refetchGlobal } = useQuery({
        queryKey: ['personnelStats', timeframe],
        queryFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`http://89.167.122.76:4080/stats/personnel?timeframe=${timeframe}`, {
                cache: "no-store",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch global stats");
            return res.json();
        }
    });

    const { data: userStats, isLoading: isLoadingUser } = useQuery({
        queryKey: ['supervisorStats', selectedUserId, timeframe],
        queryFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`http://89.167.122.76:4080/stats/personnel/${selectedUserId}?timeframe=${timeframe}`, {
                cache: "no-store",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch supervisor stats");
            return res.json();
        },
        enabled: !!selectedUserId
    });

    const { data: templates = [] } = useQuery({
        queryKey: ['templates'],
        queryFn: async () => {
            const res = await fetch(`http://89.167.122.76:4080/tasks/templates`, {
                cache: "no-store"
            });
            return res.json();
        }
    });

    const { data: allTasks = [] } = useQuery({
        queryKey: ['allTasks', selectedUserId],
        queryFn: () => selectedUserId ? fetchTasksForUser(selectedUserId) : [],
        enabled: !!selectedUserId
    });

    const { data: failedTasks = [], isLoading: isLoadingFailed } = useQuery({
        queryKey: ['failedTasks'],
        queryFn: fetchFailedTasks
    });

    const { data: shiftHistory = [], isLoading: isLoadingShifts } = useQuery({
        queryKey: ['supervisorShifts', selectedUserId],
        queryFn: () => selectedUserId ? fetchSupervisorShifts(selectedUserId) : [],
        enabled: !!selectedUserId
    });

    // Compute Personal Calendar Tasks
    const personalCalendarTasks = useMemo(() => {
        if (!selectedUserId) return {};
        const calTasks: Record<string, any[]> = {};
        const MAX_PROJECTION_MONTHS = 6;
        const projectionLimit = addMonths(new Date(), MAX_PROJECTION_MONTHS);

        // 1. Add active assigned tasks
        allTasks.forEach((task: any) => {
            if (task.assigned_user === selectedUserId && task.scheduled_date && task.template) {
                const dateKey = typeof task.scheduled_date === 'string' ? task.scheduled_date.split('T')[0] : format(new Date(task.scheduled_date), "yyyy-MM-dd");
                if (!calTasks[dateKey]) calTasks[dateKey] = [];
                calTasks[dateKey].push({
                    ...task.template,
                    id: task.template_id,
                    task_id: task.id,
                    assigned_user: task.assigned_user,
                    default_assigned_user: task.template?.default_assigned_user,
                    time: task.template.time_of_day || "Anytime",
                    tag: task.template.repeat_type || "unknown",
                    status: task.status,
                    is_real: true
                });
            }
        });

        // 2. Project default-assigned templates into the future
        templates.forEach((t: any) => {
            if (t.default_assigned_user === selectedUserId && t.next_execution_date && t.repeat_type !== "daily") {
                let currentDate = new Date(t.next_execution_date);
                while (isBefore(currentDate, projectionLimit)) {
                    const dateKey = format(currentDate, "yyyy-MM-dd");
                    if (!calTasks[dateKey]) calTasks[dateKey] = [];
                    const hasRealTask = calTasks[dateKey].some(ct => ct.is_real && ct.id === t.id);
                    if (!hasRealTask) {
                        calTasks[dateKey].push({
                            ...t,
                            time: t.time_of_day || "Anytime",
                            tag: t.repeat_type || "unknown",
                            is_projected: true
                        });
                    }
                    if (t.repeat_type === 'weekly') { currentDate = addDays(currentDate, 7); }
                    else if (t.repeat_type === 'biweekly' || t.repeat_type === 'bi-weekly') { currentDate = addDays(currentDate, 14); }
                    else if (t.repeat_type === 'monthly') { currentDate = addDays(currentDate, 28); }
                    else { break; }
                }
            }
        });
        return calTasks;
    }, [allTasks, templates, selectedUserId]);

    const pcDateKey = format(personalDate, "yyyy-MM-dd");
    const pcAssignedTasks = personalCalendarTasks[pcDateKey] || [];
    const sortTasksByTime = (tasks: any[]) => {
        const order: Record<string, number> = { morning: 1, anytime: 2, evening: 3 };
        return tasks.sort((a, b) => {
            const timeA = (a.time_of_day || a.template?.time_of_day || "anytime").toLowerCase();
            const timeB = (b.time_of_day || b.template?.time_of_day || "anytime").toLowerCase();
            return (order[timeA] || 2) - (order[timeB] || 2);
        });
    };

    const pcPlannedTasks = sortTasksByTime(pcAssignedTasks.filter(t => t.repeat_type !== 'project' && t.repeat_type?.toLowerCase() !== 'daily'));
    const pcProjectTasks = sortTasksByTime(pcAssignedTasks.filter(t => t.repeat_type === 'project'));
    const pcInstantiatedDailyTasks = pcAssignedTasks.filter(t => t.repeat_type?.toLowerCase() === 'daily');

    // Manually push Daily repeating tasks into the supervisor scope
    const basePcDailyTasks = templates.filter((t: any) => t.repeat_type?.toLowerCase() === 'daily' && t.default_assigned_user === selectedUserId).map((t: any) => ({
        ...t,
        time: t.time_of_day || "Anytime",
        tag: "daily"
    }));

    const pcDailyTasks = sortTasksByTime([...pcInstantiatedDailyTasks, ...basePcDailyTasks.filter((bdt: any) => !pcInstantiatedDailyTasks.some((idt: any) => idt.id === bdt.id))]);
    const pcTaskCounts: Record<string, number> = {};
    Object.keys(personalCalendarTasks).forEach(k => pcTaskCounts[k] = personalCalendarTasks[k].length);
    const pcHighlightedDays = Object.keys(personalCalendarTasks).map((d) => parseISO(d));

    const sendMsgMutation = useMutation({
        mutationFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`http://89.167.122.76:4080/messages/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ user_id: selectedUserId, text: msgText })
            });
            if (!res.ok) throw new Error("Failed to send message");
            return res.json();
        },
        onSuccess: () => {
            toast.success("Message sent successfully!");
            setMsgText("");
        },
        onError: () => toast.error("Failed to send message")
    });

    const assignTaskMutation = useMutation({
        mutationFn: async (params: { assignAll: boolean, assignDate: string | null }) => {
            const token = localStorage.getItem("access_token");
            const promises = assignTpls.map(tplId => fetch(`http://89.167.122.76:4080/tasks/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: selectedUserId,
                    template_id: parseInt(tplId),
                    scheduled_date: params.assignAll ? null : params.assignDate,
                    assign_all: params.assignAll
                })
            }));
            const results = await Promise.all(promises);
            for (const r of results) {
                if (!r.ok) throw new Error("Failed to assign part of the tasks");
            }
            return true;
        },
        onSuccess: () => {
            toast.success("Tasks assigned successfully!");
            setAssignTpls([]);
            setAssignDate("");
            setAssignAll(false);
            queryClient.invalidateQueries({ queryKey: ['allTasks', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['templates'] });
        },
        onError: () => toast.error("Failed to assign tasks")
    });

    const unassignTaskMutation = useMutation({
        mutationFn: async (params: { unassignAll: boolean, unassignDate: string | null }) => {
            const token = localStorage.getItem("access_token");
            const promises = assignTpls.map(tplId => fetch(`http://89.167.122.76:4080/tasks/unassign`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    user_id: selectedUserId,
                    template_id: parseInt(tplId),
                    scheduled_date: params.unassignAll ? null : params.unassignDate,
                    unassign_all: params.unassignAll
                })
            }));
            const results = await Promise.all(promises);
            for (const r of results) {
                if (!r.ok) throw new Error("Failed to unassign part of the tasks");
            }
            return true;
        },
        onSuccess: () => {
            toast.success("Tasks unassigned successfully!");
            setAssignTpls([]);
            queryClient.invalidateQueries({ queryKey: ['allTasks', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['templates'] });
        },
        onError: () => toast.error("Failed to unassign tasks")
    });

    const addUserMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`http://89.167.122.76:4080/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newUserName,
                    email: newUserEmail,
                    password: newUserPassword,
                    role: newUserRole
                })
            });
            if (!res.ok) throw new Error("Failed to create user");
            return res.json();
        },
        onSuccess: () => {
            toast.success("Staff member created!");
            setIsAddUserOpen(false);
            setNewUserName("");
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserRole("supervisor");
            refetchGlobal();
        },
        onError: () => toast.error("Failed to create staff member")
    });

    const archiveUserMutation = useMutation({
        mutationFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`http://89.167.122.76:4080/auth/users/${selectedUserId}/archive`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to archive user");
            return res.json();
        },
        onSuccess: () => {
            toast.success("Staff member archived!");
            setSelectedUserId(null);
            refetchGlobal();
        },
        onError: () => toast.error("Failed to archive staff member")
    });

    const activePersonnel = globalStats?.personnel?.filter((u: any) => u.is_active !== false) || [];
    const archivedPersonnel = globalStats?.personnel?.filter((u: any) => u.is_active === false) || [];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-24">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Personnel Suite</h1>
                    <p className="text-muted-foreground mt-1">Monitor compliance and manage supervisor workload.</p>
                </div>
                <Tabs value={timeframe} onValueChange={(v: any) => setTimeframe(v)} className="w-[400px] hidden sm:block">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="today">Today</TabsTrigger>
                        <TabsTrigger value="week">Past Week</TabsTrigger>
                        <TabsTrigger value="month">Past Month</TabsTrigger>
                        <TabsTrigger value="all">All Time</TabsTrigger>
                    </TabsList>
                </Tabs>
                {/* Mobile version to prevent breaking */}
                <Tabs value={timeframe} onValueChange={(v: any) => setTimeframe(v)} className="w-full sm:hidden">
                    <TabsList className="grid w-full grid-cols-4 text-[10px] h-auto p-1">
                        <TabsTrigger value="today" className="px-1 py-1.5 leading-none">Today</TabsTrigger>
                        <TabsTrigger value="week" className="px-1 py-1.5 leading-none">Week</TabsTrigger>
                        <TabsTrigger value="month" className="px-1 py-1.5 leading-none">Month</TabsTrigger>
                        <TabsTrigger value="all" className="px-1 py-1.5 leading-none">All Time</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {isLoadingGlobal ? (
                <div className="h-40 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
            ) : (
                <>
                    <h2 className="text-xl font-semibold mt-8 mb-4">Staff</h2>

                    <div className="space-y-8">
                        {Array.from(new Set(activePersonnel.map((u: any) => u.role))).map((role: any) => {
                            const roleUsers = activePersonnel.filter((u: any) => u.role === role);
                            return (
                                <div key={role}>
                                    <h3 className="text-lg font-medium mb-3 capitalize text-muted-foreground">{role}s</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {roleUsers.map((user: any) => (
                                            <Card key={user.user_id} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md h-full flex flex-col" onClick={() => setSelectedUserId(user.user_id)}>
                                                <CardHeader className="flex flex-row items-center gap-4 pb-0 pt-5 pr-5 pl-5">
                                                    <div className="w-12 h-12 rounded-full border bg-muted/30 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                                                        {user.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <CardTitle className="text-base truncate">{user.name}</CardTitle>
                                                        <div className="text-xs text-muted-foreground capitalize leading-tight mt-1">
                                                            {user.role.split(' ').map((word: string, i: number) => (
                                                                <div key={i}>{word}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-4 pt-4 px-5 pb-5 flex-1">
                                                    <div className="flex items-center justify-between text-sm border-b pb-3">
                                                        <span className="text-muted-foreground flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Shifts</span>
                                                        <span className="font-semibold">{user.shifts_count}</span>
                                                    </div>

                                                    <div className="space-y-2.5">
                                                        {['daily', 'planned', 'project', 'assigned'].map((type) => (
                                                            <div key={type} className="grid grid-cols-[52px_36px_36px_1fr_1fr] items-center gap-2 border-b border-muted/30 pb-2 last:border-0 last:pb-0 text-[11px]">
                                                                <span className="font-semibold text-muted-foreground capitalize truncate">{type}</span>
                                                                <span className="text-green-700 bg-green-50 px-1 py-0.5 rounded flex items-center justify-center whitespace-nowrap"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />{user[type].completed}</span>
                                                                <span className="text-red-700 bg-red-50 px-1 py-0.5 rounded flex items-center justify-center whitespace-nowrap"><XCircle className="w-2.5 h-2.5 mr-0.5" />{user[type].failed}</span>
                                                                <span className="text-muted-foreground font-medium text-right truncate">{100 - Math.round(user[type].failed_percent)}%</span>
                                                                <span className="text-muted-foreground font-medium text-right truncate">{user[type].avg_per_shift}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="pt-2 border-t mt-auto">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-muted-foreground">Average per shift:</span>
                                                            <span className="font-semibold">{user.avg_per_shift}</span>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add New Staff Section */}
                        <div className="pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <div
                                    onClick={() => setIsAddUserOpen(true)}
                                    className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors rounded-xl min-h-[300px] flex flex-col items-center justify-center cursor-pointer hover:bg-muted/10 h-full"
                                >
                                    <div className="w-12 h-12 rounded-full border border-dashed border-primary/50 flex items-center justify-center text-primary mb-3">
                                        <Plus className="w-6 h-6" />
                                    </div>
                                    <p className="font-medium text-muted-foreground">Add New Staff</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* FAILED TASKS SECTION */}
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-6 w-6" />
                            Failed Tasks Feed
                        </h2>

                        {isLoadingFailed ? (
                            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                        ) : failedTasks.length === 0 ? (
                            <Card className="bg-card">
                                <CardContent className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                                    <CheckCircle2 className="h-12 w-12 mb-4 opacity-50 text-emerald-500" />
                                    <p>No failed tasks found.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {failedTasks.map((task: any) => (
                                    <Card key={task.id} className="border-l-4 border-l-destructive">
                                        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant="outline" className="text-destructive border-destructive">
                                                        {task.status === "Overdue" ? "Overdue" : "AI Rejected"}
                                                    </Badge>
                                                    {task.scheduled_date && (
                                                        <span className="text-sm text-muted-foreground">
                                                            {format(new Date(task.scheduled_date), "MMM d, yyyy")}
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="font-semibold text-lg">{task.template?.name || "Unknown Task"}</h3>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {task.assigned_user ? (
                                                    <UserBadge userId={task.assigned_user} />
                                                ) : (
                                                    <Badge variant="secondary">Unassigned</Badge>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    {
                        archivedPersonnel.length > 0 && (
                            <div className="mt-12 opacity-60">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><XCircle className="w-5 h-5" /> Archived Staff</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {archivedPersonnel.map((user: any) => (
                                        <Card key={user.user_id} className="bg-muted/30 grayscale opacity-80 border-dashed pb-4">
                                            <CardHeader className="flex flex-row items-center gap-4 pb-0 pt-5 pr-5 pl-5">
                                                <div className="w-12 h-12 rounded-full border bg-muted/50 flex items-center justify-center text-muted-foreground font-bold text-lg flex-shrink-0">
                                                    {user.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <CardTitle className="text-base truncate">{user.name}</CardTitle>
                                                    <p className="text-xs text-muted-foreground capitalize truncate">{user.role}</p>
                                                </div>
                                            </CardHeader>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )
                    }
                </>
            )
            }

            {/* Supervisor Details & Management Drawer */}
            <Sheet open={!!selectedUserId} onOpenChange={(open) => {
                if (!open) {
                    setSelectedUserId(null);
                    setAssignTpls([]);
                }
            }}>
                <SheetContent className="w-[95vw] sm:max-w-[95vw] lg:max-w-[1200px] overflow-y-auto pb-20">
                    {isLoadingUser ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : userStats && !userStats.error ? (
                        <div className="space-y-6 py-6">
                            <SheetHeader>
                                <div className="flex items-center gap-4 border-b pb-4">
                                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                                        {userStats.user.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="text-left">
                                        <SheetTitle className="text-2xl">{userStats.user.name}</SheetTitle>
                                        <SheetDescription className="flex items-center gap-1 mt-1 capitalize">
                                            <Users className="w-4 h-4" /> {userStats.user.role || 'Supervisor'}
                                        </SheetDescription>
                                    </div>
                                </div>
                            </SheetHeader>

                            <Tabs defaultValue="details" className="w-full">
                                <TabsList className="w-full mb-2 bg-muted/30">
                                    <TabsTrigger value="details" className="flex-1">Overview</TabsTrigger>
                                    <TabsTrigger value="shifts" className="flex-1">Shift History</TabsTrigger>
                                </TabsList>

                                <TabsContent value="details" className="mt-0 outline-none">
                                    <div className="space-y-6 pt-4 w-full">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-semibold text-lg flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-primary" /> Personal Calendar</h3>
                                        </div>
                                        <div className="flex flex-col lg:flex-row gap-6">
                                            {/* Calendar */}
                                            <div className="card-atmos md:flex-[2] self-start border bg-card">
                                                <Calendar
                                                    mode="single"
                                                    selected={personalDate}
                                                    onSelect={(d) => {
                                                        if (d) {
                                                            setPersonalDate(d);
                                                            setAssignDate(format(d, "yyyy-MM-dd"));
                                                        }
                                                    }}
                                                    className="p-3 w-full"
                                                    modifiers={{ hasTask: pcHighlightedDays }}
                                                    modifiersClassNames={{ hasTask: "font-medium text-primary" }}
                                                    taskCounts={pcTaskCounts}
                                                />
                                            </div>

                                            {/* Schedule View */}
                                            <div className="card-atmos md:flex-[3] flex flex-col max-h-[600px] border bg-accent/20">
                                                <h2 className="text-base font-semibold text-foreground mb-1">
                                                    Schedule for {format(personalDate, "EEE, MMM d")}
                                                </h2>
                                                <p className="text-xs text-muted-foreground mb-4">{pcDailyTasks.length + pcPlannedTasks.length + pcProjectTasks.length} tasks scheduled for {userStats?.name}</p>

                                                <div className="overflow-y-auto flex-1 pr-1">
                                                    <Accordion
                                                        type="multiple"
                                                        className="w-full space-y-4"
                                                        value={openPersonalAccordions}
                                                        onValueChange={setOpenPersonalAccordions}
                                                    >
                                                        {/* Daily Tasks */}
                                                        <AccordionItem value="daily" className="border-b-0 bg-card rounded-md border shadow-sm">
                                                            <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-medium text-sm">
                                                                Daily Tasks ({pcDailyTasks.length})
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-0 overflow-visible">
                                                                {pcDailyTasks.length === 0 ? (
                                                                    <p className="text-xs text-muted-foreground p-4 text-center">No daily tasks</p>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {pcDailyTasks.map((t, i) => (
                                                                            <div key={i} className="flex items-center gap-3 p-3 group">
                                                                                {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                                                                                ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                <span className="text-sm font-medium flex-1 text-foreground">{t.name || t.template?.name}</span>
                                                                                <Badge variant="secondary" className="text-[10px] capitalize">{t.tag}</Badge>
                                                                                {(t.assigned_user || t.default_assigned_user) && <UserBadge userId={t.assigned_user || t.default_assigned_user} />}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                        {/* Planned Tasks */}
                                                        <AccordionItem value="planned" className="border-b-0 bg-card rounded-md border shadow-sm">
                                                            <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-medium text-sm">
                                                                Planned Tasks ({pcPlannedTasks.length})
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-0 overflow-visible">
                                                                {pcPlannedTasks.length === 0 ? (
                                                                    <p className="text-xs text-muted-foreground p-4 text-center">No planned tasks for this day</p>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {pcPlannedTasks.map((t, i) => (
                                                                            <div key={i} className={`flex items-center gap-3 p-3 group ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                                                                                {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                                                                                ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                {t.status === 'Completed' && <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />}
                                                                                <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                    {t.name || t.template?.name}
                                                                                </span>
                                                                                <Badge variant="secondary" className="text-[10px] capitalize">{t.tag}</Badge>
                                                                                {t.is_projected && <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-200">Projected</Badge>}
                                                                                {(t.assigned_user || t.default_assigned_user) && <UserBadge userId={t.assigned_user || t.default_assigned_user} />}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </AccordionContent>
                                                        </AccordionItem>

                                                        {/* Project Tasks */}
                                                        <AccordionItem value="project" className="border-b-0 bg-card rounded-md border shadow-sm mt-4">
                                                            <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-medium text-sm">
                                                                Project Tasks ({pcProjectTasks.length})
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-0 overflow-visible">
                                                                {pcProjectTasks.length === 0 ? (
                                                                    <p className="text-xs text-muted-foreground p-4 text-center">No project tasks for this day</p>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {pcProjectTasks.map((t, i) => (
                                                                            <div key={i} className={`flex items-center gap-3 p-3 group ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                                                                                {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                                                                                ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                <span className="text-sm font-medium flex-1 text-foreground">{t.name || t.template?.name}</span>
                                                                                <Badge variant="secondary" className="text-[10px] capitalize">{t.tag}</Badge>
                                                                                {(t.assigned_user || t.default_assigned_user) && <UserBadge userId={t.assigned_user || t.default_assigned_user} />}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Inline Assign Task Catalog */}
                                        <div className="mt-8">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Clock className="w-5 h-5 text-primary" />
                                                <h3 className="text-lg font-semibold text-foreground">Task Catalog for Assignment</h3>
                                            </div>

                                            {/* Action Bar at the Top */}
                                            <div className="mb-6 pb-6 border-b flex flex-col gap-4">
                                                <div className="flex justify-end gap-3 w-full items-center">
                                                    <span className="text-sm text-muted-foreground mr-auto">
                                                        <strong>{assignTpls.length}</strong> tasks selected.
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="lg"
                                                        onClick={() => setIsUnassignModalOpen(true)}
                                                        disabled={assignTpls.length === 0}
                                                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                                    >
                                                        <XCircle className="w-4 h-4 mr-2" />
                                                        Unassign Task(s)
                                                    </Button>
                                                    <Button
                                                        size="lg"
                                                        onClick={() => setIsAssignModalOpen(true)}
                                                        disabled={assignTpls.length === 0}
                                                    >
                                                        <Plus className="w-4 h-4 mr-2" />
                                                        Enact Assignment
                                                    </Button>
                                                </div>
                                            </div>

                                            <p className="text-sm text-muted-foreground mb-4">
                                                Select task templates using the checkboxes below to configure assignment.
                                            </p>
                                            <Accordion type="multiple" className="w-full space-y-4 relative z-10">
                                                {['planned', 'project'].map((type) => {
                                                    const groupTemplates = templates?.filter((t: any) => {
                                                        if (type === 'planned') {
                                                            return t.repeat_type !== 'project' && t.repeat_type?.toLowerCase() !== 'daily';
                                                        }
                                                        return t.repeat_type?.toLowerCase() === type;
                                                    }) || [];
                                                    if (groupTemplates.length === 0) return null;

                                                    return (
                                                        <AccordionItem value={type} key={type} className="border bg-card rounded-md shadow-sm">
                                                            <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-semibold text-sm capitalize flex items-center gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-primary/70" />
                                                                    {type} Tasks ({groupTemplates.length})
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-4 pt-4 border-t overflow-visible">
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
                                                                    {groupTemplates.map((t: any) => (
                                                                        <div
                                                                            key={t.id}
                                                                            onClick={() => {
                                                                                setAssignTpls(prev => prev.includes(t.id.toString())
                                                                                    ? prev.filter(id => id !== t.id.toString())
                                                                                    : [...prev, t.id.toString()]);
                                                                            }}
                                                                            className={`relative z-20 border bg-card rounded-lg p-3 cursor-pointer text-sm transition-all flex items-start gap-3 ${assignTpls.includes(t.id.toString()) ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'hover:border-primary/50 hover:bg-muted/20'}`}
                                                                        >
                                                                            <Checkbox
                                                                                className="mt-0.5 pointer-events-none"
                                                                                checked={assignTpls.includes(t.id.toString())}
                                                                            />
                                                                            <span className="font-medium line-clamp-2">{t.name}</span>
                                                                            {(() => {
                                                                                if (t.default_assigned_user) return (
                                                                                    <div className="ml-auto flex-shrink-0 relative z-20 pointer-events-auto">
                                                                                        <UserBadge userId={t.default_assigned_user} />
                                                                                    </div>
                                                                                );
                                                                                const isAssigned = pcAssignedTasks.some(pc => pc.id === t.id);
                                                                                if (isAssigned && selectedUserId) return (
                                                                                    <div className="ml-auto flex-shrink-0 relative z-20 pointer-events-auto opacity-70" title="Assigned on this date">
                                                                                        <UserBadge userId={selectedUserId} />
                                                                                    </div>
                                                                                );
                                                                                return null;
                                                                            })()}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    );
                                                })}
                                            </Accordion>
                                        </div>

                                        {/* Action Footers */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-6 border-t">
                                            <Card className="bg-muted/10">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm flex items-center gap-2">
                                                        <Send className="w-4 h-4 text-primary" /> Message Employee
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <Textarea
                                                        placeholder="Write a system notification..."
                                                        value={msgText}
                                                        onChange={(e) => setMsgText(e.target.value)}
                                                        className="resize-none text-sm min-h-[60px]"
                                                    />
                                                    <Button size="sm" className="w-full" onClick={() => sendMsgMutation.mutate()} disabled={!msgText.trim() || sendMsgMutation.isPending}>
                                                        {sendMsgMutation.isPending ? "Sending..." : "Dispatch Message"}
                                                    </Button>
                                                </CardContent>
                                            </Card>

                                            <Card className="border-destructive/20 bg-destructive/5">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                                                        <AlertTriangle className="w-4 h-4" /> Danger Zone
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <p className="text-[13px] text-muted-foreground mb-4">
                                                        Archiving this staff member revokes their access. Historical data is preserved.
                                                    </p>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="w-full"
                                                        onClick={() => {
                                                            if (confirm("Are you sure you want to archive this user?")) {
                                                                archiveUserMutation.mutate();
                                                            }
                                                        }}
                                                        disabled={archiveUserMutation.isPending}
                                                    >
                                                        <XCircle className="w-4 h-4 mr-2" />
                                                        {archiveUserMutation.isPending ? "Archiving..." : "Archive Staff Member"}
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        </div>

                                    </div>
                                </TabsContent>
                                <TabsContent value="shifts" className="mt-0 outline-none">
                                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 pb-10 mt-4">
                                        {isLoadingShifts ? (
                                            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                                        ) : shiftHistory.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                                                No shift history found for this user.
                                            </div>
                                        ) : (
                                            <Accordion type="multiple" className="w-full space-y-4">
                                                {shiftHistory.map((shift: any) => (
                                                    <AccordionItem key={shift.date} value={shift.date} className="border border-border/50 bg-card rounded-xl shadow-sm mb-4 px-4">
                                                        <AccordionTrigger className="hover:no-underline py-4">
                                                            {(() => {
                                                                const tCompleted = shift.daily.completed + shift.planned.completed + shift.project.completed + shift.assigned.completed;
                                                                const tFailed = shift.daily.failed + shift.planned.failed + shift.project.failed + shift.assigned.failed;
                                                                const tTasks = tCompleted + tFailed;
                                                                const tPercent = tTasks > 0 ? Math.round((tFailed / tTasks) * 100) : 0;
                                                                return (
                                                                    <div className="flex w-full justify-between items-center pr-4">
                                                                        <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                                                                            <CalendarIcon className="w-5 h-5 text-primary" />
                                                                            {format(new Date(shift.date), "MMM d, yyyy")}
                                                                        </h3>
                                                                        <div className="flex gap-2">
                                                                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                                                                Total: {tTasks}
                                                                            </Badge>
                                                                            {tFailed > 0 && (
                                                                                <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 ml-1">
                                                                                    Failed: {tFailed} ({tPercent}%)
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </AccordionTrigger>
                                                        <AccordionContent className="pt-0 pb-4">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                                                {['daily', 'planned', 'project', 'assigned'].map((type) => (
                                                                    <div key={type} className="bg-muted/30 p-2 rounded-md border border-border/50">
                                                                        <span className="text-xs text-muted-foreground block text-center mb-1 capitalize">{type}</span>
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> <span className="font-semibold text-sm">{shift[type].completed}</span></div>
                                                                            <div className="flex items-center gap-1 text-destructive"><XCircle className="w-3 h-3" /> <span className="font-semibold text-sm">{shift[type].failed}</span></div>
                                                                        </div>
                                                                        {shift[type].failed_percent > 0 && <span className="block text-center text-[10px] text-destructive mt-1 font-medium">{shift[type].failed_percent}% fail</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {shift.tasks && shift.tasks.length > 0 && (
                                                                <div className="space-y-2 mt-4">
                                                                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Shift Tasks</h4>
                                                                    {shift.tasks.map((task: any) => (
                                                                        <div key={task.id} className="flex flex-col gap-2 p-3 bg-muted/20 border rounded-lg text-sm">
                                                                            <div className="flex items-start justify-between">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    {task.status === "Completed" ? (
                                                                                        <CheckCircle2 className="w-4 h-4 text-success" />
                                                                                    ) : ['Failed', 'Overdue'].includes(task.status) ? (
                                                                                        <XCircle className="w-4 h-4 text-destructive" />
                                                                                    ) : (
                                                                                        <Activity className="w-4 h-4 text-muted-foreground" />
                                                                                    )}
                                                                                    <span className="font-medium text-foreground">{task.name}</span>
                                                                                    <Badge variant="secondary" className="text-[10px] uppercase">{task.type}</Badge>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <Badge variant={task.status === "Completed" ? "default" : ['Failed', 'Overdue'].includes(task.status) ? "destructive" : "outline"} className="text-[10px] hidden sm:inline-flex">
                                                                                        {task.status}
                                                                                    </Badge>
                                                                                    <Button
                                                                                        variant={task.status === "Completed" ? "outline" : "default"}
                                                                                        size="sm"
                                                                                        className="h-6 px-2 text-[10px] ml-1"
                                                                                        onClick={() => toggleTaskStatusMutation.mutate({ task_id: task.id, currentStatus: task.status })}
                                                                                        disabled={toggleTaskStatusMutation.isPending && toggleTaskStatusMutation.variables?.task_id === task.id}
                                                                                    >
                                                                                        {toggleTaskStatusMutation.isPending && toggleTaskStatusMutation.variables?.task_id === task.id ? (
                                                                                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                                                                        ) : task.status === "Completed" ? (
                                                                                            <XCircle className="w-3 h-3 mr-1" />
                                                                                        ) : (
                                                                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                                        )}
                                                                                        {task.status === "Completed" ? "Mark Undone" : "Mark Done"}
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                            {task.photos && task.photos.length > 0 && (
                                                                                <div className="flex gap-2 mt-1 overflow-x-auto pb-1">
                                                                                    {task.photos.map((photoUrl: string, idx: number) => (
                                                                                        <a href={photoUrl} target="_blank" rel="noreferrer" key={idx} className="flex-shrink-0">
                                                                                            <img src={photoUrl} alt="Task Proof" className="h-12 w-12 object-cover rounded-md border border-border/50 hover:opacity-80 transition-opacity" />
                                                                                        </a>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                ))}
                                            </Accordion>
                                        )}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center flex-col text-muted-foreground">
                            <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                            <p>Supervisor data could not be loaded.</p>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Add New Staff Dialog */}
            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Staff</DialogTitle>
                        <DialogDescription>
                            Create a new staff account. They will receive access immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input id="name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="email" className="text-right">Email</Label>
                            <Input id="email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="password" className="text-right">Password</Label>
                            <Input id="password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="role" className="text-right">Role</Label>
                            <Select value={newUserRole} onValueChange={setNewUserRole}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="supervisor">Supervisor</SelectItem>
                                    <SelectItem value="garden supervisor">Garden Supervisor</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => addUserMutation.mutate()}
                            disabled={!newUserName || !newUserEmail || !newUserPassword || addUserMutation.isPending}
                        >
                            {addUserMutation.isPending ? "Creating..." : "Create Staff"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Assign Confirmation Dialog */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Confirm Assignment Scope</DialogTitle>
                        <DialogDescription>
                            You have selected <strong>{assignTpls.length}</strong> task(s). How would you like to apply these to <strong>{userStats?.user?.name}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Button
                            variant="outline"
                            className="justify-start h-auto flex flex-col items-start p-4 hover:border-primary/50 text-left whitespace-normal break-words"
                            onClick={() => {
                                const newDate = format(personalDate, "yyyy-MM-dd");
                                setAssignAll(false);
                                setAssignDate(newDate);
                                assignTaskMutation.mutate({ assignAll: false, assignDate: newDate });
                                setIsAssignModalOpen(false);
                            }}
                            disabled={assignTaskMutation.isPending}
                        >
                            <span className="font-semibold text-base mb-1">Only on {format(personalDate, "MMM d, yyyy")}</span>
                            <span className="text-sm font-normal text-muted-foreground">Assigns one specific instance of the selected tasks on this date alone.</span>
                        </Button>

                        <Button
                            variant="outline"
                            className="justify-start h-auto flex flex-col items-start p-4 hover:border-primary/50 text-left border-primary/20 bg-primary/5 shadow-sm whitespace-normal break-words mt-2"
                            onClick={() => {
                                setAssignAll(true);
                                assignTaskMutation.mutate({ assignAll: true, assignDate: null });
                                setIsAssignModalOpen(false);
                            }}
                            disabled={assignTaskMutation.isPending}
                        >
                            <span className="font-semibold text-base mb-1 text-primary flex items-center gap-2">All future occurrences <Plus className="w-4 h-4" /></span>
                            <span className="text-sm font-normal text-primary/70">Assigns the recurring series infinitely going forward.</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Unassign Confirmation Dialog */}
            <Dialog open={isUnassignModalOpen} onOpenChange={setIsUnassignModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Confirm Unassignment Scope</DialogTitle>
                        <DialogDescription>
                            You have selected <strong>{assignTpls.length}</strong> task(s). How would you like to unassign these from <strong>{userStats?.user?.name}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Button
                            variant="outline"
                            className="justify-start h-auto flex flex-col items-start p-4 hover:border-destructive/50 hover:bg-destructive/5 text-left border-destructive/20 whitespace-normal break-words"
                            onClick={() => {
                                const newDate = format(personalDate, "yyyy-MM-dd");
                                unassignTaskMutation.mutate({ unassignAll: false, unassignDate: newDate });
                                setIsUnassignModalOpen(false);
                            }}
                            disabled={unassignTaskMutation.isPending}
                        >
                            <span className="font-semibold text-base mb-1 text-destructive flex items-center gap-2"><XCircle className="w-4 h-4" /> Only on {format(personalDate, "MMM d, yyyy")}</span>
                            <span className="text-sm font-normal text-destructive/70">Unassigns one specific instance of the selected tasks on this date alone.</span>
                        </Button>

                        <Button
                            variant="destructive"
                            className="justify-start h-auto flex flex-col items-start p-4 text-left whitespace-normal break-words mt-2"
                            onClick={() => {
                                unassignTaskMutation.mutate({ unassignAll: true, unassignDate: null });
                                setIsUnassignModalOpen(false);
                            }}
                            disabled={unassignTaskMutation.isPending}
                        >
                            <span className="font-semibold text-base mb-1 flex items-center gap-2">All future occurrences <XCircle className="w-4 h-4" /></span>
                            <span className="text-sm font-normal opacity-90">Unassigns the recurring series infinitely going forward.</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div >
    );
}
