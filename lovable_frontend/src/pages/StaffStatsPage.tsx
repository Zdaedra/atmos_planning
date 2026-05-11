import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { Users, CheckCircle2, AlertTriangle, CalendarDays, MapPin, Activity, Clock, XCircle, Send, Plus, Calendar as CalendarIcon, RefreshCw, Pencil, Camera } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addDays, addMonths, isBefore } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { fetchTasksForUser, fetchSupervisorShifts, markTaskComplete, revertTask, fetchDashboardData } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { UserBadge } from "@/components/UserBadge";
import { TaskPhotos, OverdueBadge } from "@/components/TaskRowExtras";
import { DaySummaryDrill } from "@/components/DaySummaryDrill";

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
    const [credentialsUser, setCredentialsUser] = useState<any>(null);

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

    // Supervisor Edit states
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState("");
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: globalStats, isLoading: isLoadingGlobal, refetch: refetchGlobal } = useQuery({
        queryKey: ['personnelStats', timeframe],
        queryFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`https://api.trypranaextract.com/stats/personnel?timeframe=${timeframe}`, {
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
            const res = await fetch(`https://api.trypranaextract.com/stats/personnel/${selectedUserId}?timeframe=${timeframe}`, {
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
            const res = await fetch(`https://api.trypranaextract.com/tasks/templates`, {
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

    const { data: shiftHistory = [], isLoading: isLoadingShifts } = useQuery({
        queryKey: ['supervisorShifts', selectedUserId],
        queryFn: () => selectedUserId ? fetchSupervisorShifts(selectedUserId) : [],
        enabled: !!selectedUserId
    });

    const { data: calendarMap = {} } = useQuery({
        queryKey: ['staffCalendar', selectedUserId],
        queryFn: async () => {
            if (!selectedUserId) return {};
            const startD = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
            const endD = new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split('T')[0];
            const res = await fetch(`https://api.trypranaextract.com/tasks/calendar?start_date=${startD}&end_date=${endD}&user_id=${selectedUserId}`);
            if (!res.ok) return {};
            return res.json();
        },
        enabled: !!selectedUserId
    });

    // Compute Personal Calendar Tasks mapped gracefully from Unified Backend
    const personalCalendarTasks = useMemo(() => {
        if (!selectedUserId || !calendarMap) return {};
        const mapped: Record<string, any[]> = {};
        Object.keys(calendarMap).forEach(k => {
            if (!Array.isArray(calendarMap[k])) return;
            mapped[k] = calendarMap[k].map((t: any) => ({
                ...t.template,
                id: (t as any).template_id || (t as any).id,
                task_id: t.is_projected ? undefined : t.id,
                assigned_user: t.assigned_user,
                default_assigned_user: t.template?.default_assigned_user,
                time: t.template?.time_of_day || "Anytime",
                tag: t.repeat_type || "unknown",
                status: t.status,
                is_real: !t.is_projected,
                is_projected: t.is_projected
            }));
        });
        return mapped;
    }, [calendarMap, selectedUserId]);

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

    const pcPersonalTasks = sortTasksByTime(pcAssignedTasks.filter(t => t.assigned_user === selectedUserId || t.default_assigned_user === selectedUserId));
    const pcPlannedTasks = sortTasksByTime(pcAssignedTasks.filter(t => (t.repeat_type || "").toLowerCase() !== 'project' && (t.repeat_type || "").toLowerCase() !== 'daily' && t.assigned_user !== selectedUserId && t.default_assigned_user !== selectedUserId));
    const pcProjectTasks = sortTasksByTime(pcAssignedTasks.filter(t => (t.repeat_type || "").toLowerCase() === 'project' && t.assigned_user !== selectedUserId && t.default_assigned_user !== selectedUserId));

    const pcTaskCounts: Record<string, number> = {};
    Object.keys(personalCalendarTasks).forEach(k => {
        const nonDaily = personalCalendarTasks[k].filter(t => (t.repeat_type || "").toLowerCase() !== 'daily');
        if (nonDaily.length > 0) {
            pcTaskCounts[k] = nonDaily.length;
        }
    });
    const pcHighlightedDays = Object.keys(personalCalendarTasks).map((d) => parseISO(d));

    const sendMsgMutation = useMutation({
        mutationFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`https://api.trypranaextract.com/messages/`, {
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
            const promises = assignTpls.map(tplId => fetch(`https://api.trypranaextract.com/tasks/assign`, {
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
            queryClient.invalidateQueries({ queryKey: ['staffCalendar', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['templates'] });
        },
        onError: () => toast.error("Failed to assign tasks")
    });

    const unassignTaskMutation = useMutation({
        mutationFn: async (params: { unassignAll: boolean, unassignDate: string | null }) => {
            const token = localStorage.getItem("access_token");
            const promises = assignTpls.map(tplId => fetch(`https://api.trypranaextract.com/tasks/unassign`, {
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
            queryClient.invalidateQueries({ queryKey: ['staffCalendar', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['templates'] });
        },
        onError: () => toast.error("Failed to unassign tasks")
    });

    const addUserMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`https://api.trypranaextract.com/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newUserName,
                    email: newUserEmail,
                    password: newUserPassword,
                    role: newUserRole
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error((errData && errData.detail) ? errData.detail : "Failed to create user");
            }
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
        onError: (err: any) => toast.error(err.message || "Failed to create staff member")
    });

    const archiveUserMutation = useMutation({
        mutationFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`https://api.trypranaextract.com/auth/users/${selectedUserId}/archive`, {
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

    const resetDeviceMutation = useMutation({
        mutationFn: async () => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`https://api.trypranaextract.com/auth/users/${selectedUserId}/reset-device`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to reset device");
            return res.json();
        },
        onSuccess: () => {
            toast.success("Device binding reset successfully!");
            queryClient.invalidateQueries({ queryKey: ["supervisorStats", selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ["personnelStats"] });
        },
        onError: () => toast.error("Failed to reset device binding")
    });

    const updateSupervisorConfigMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number, data: any }) => {
            const token = localStorage.getItem("access_token");
            const res = await fetch(`https://api.trypranaextract.com/supervisors/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error("Failed to update profile");
            return res.json();
        },
        onSuccess: () => {
            refetchGlobal();
            queryClient.invalidateQueries({ queryKey: ['personnelStats'] });
            queryClient.invalidateQueries({ queryKey: ['supervisorStats'] });
            toast.success("Profile updated seamlessly.");
        },
        onError: () => toast.error("Failed to update profile.")
    });

    const handleSaveName = () => {
        if (!selectedUserId || !editNameValue.trim() || editNameValue === userStats?.user?.name) {
            setIsEditingName(false);
            return;
        }
        updateSupervisorConfigMutation.mutate({ id: selectedUserId, data: { name: editNameValue.trim() } });
        setIsEditingName(false);
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedUserId) return;

        setIsUploadingAvatar(true);
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;
            updateSupervisorConfigMutation.mutate(
                { id: selectedUserId, data: { avatar_base64: base64data } },
                { onSettled: () => setIsUploadingAvatar(false) }
            );
        };
        reader.readAsDataURL(file);
    };

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
                                                    <div
                                                        className="w-12 h-12 rounded-full border bg-muted/30 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0 hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden z-50 pointer-events-auto"
                                                        title="Посмотреть учетные данные"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCredentialsUser(user); }}
                                                    >
                                                        {user.avatar_url ? (
                                                            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            user.name.substring(0, 2).toUpperCase()
                                                        )}
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
                                                        {['daily', 'planned', 'project', 'mini', 'assigned'].map((type) => (
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

                    {
                        archivedPersonnel.length > 0 && (
                            <div className="mt-12 opacity-60">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><XCircle className="w-5 h-5" /> Archived Staff</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {archivedPersonnel.map((user: any) => (
                                        <Card key={user.user_id} className="bg-muted/30 grayscale opacity-80 border-dashed pb-4">
                                            <CardHeader className="flex flex-row items-center gap-4 pb-0 pt-5 pr-5 pl-5">
                                                <div
                                                    className="w-12 h-12 rounded-full border bg-muted/50 flex items-center justify-center text-muted-foreground font-bold text-lg flex-shrink-0 hover:bg-muted/80 transition-colors cursor-pointer relative overflow-hidden z-50 pointer-events-auto"
                                                    title="Посмотреть учетные данные"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCredentialsUser(user); }}
                                                >
                                                    {user.avatar_url ? (
                                                        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        user.name.substring(0, 2).toUpperCase()
                                                    )}
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
                                    <div className="relative group">
                                        <div
                                            className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl hover:bg-primary/20 transition-all cursor-pointer overflow-hidden z-50 pointer-events-auto shadow-sm border border-primary/20"
                                            title="Click to update avatar"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                                        >
                                            {isUploadingAvatar ? (
                                                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                                            ) : userStats.user.avatar_url ? (
                                                <img src={userStats.user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                userStats.user.name.substring(0, 2).toUpperCase()
                                            )}
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="flex items-center gap-2">
                                            {isEditingName ? (
                                                <Input
                                                    autoFocus
                                                    value={editNameValue}
                                                    onChange={e => setEditNameValue(e.target.value)}
                                                    onBlur={handleSaveName}
                                                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                                                    className="text-2xl font-semibold w-full max-w-[250px] h-10 px-2"
                                                />
                                            ) : (
                                                <SheetTitle
                                                    className="text-2xl flex items-center gap-2 group cursor-pointer hover:text-primary transition-colors"
                                                    onClick={() => { setEditNameValue(userStats.user.name); setIsEditingName(true); }}
                                                    title="Click to edit name"
                                                >
                                                    {userStats.user.name}
                                                    <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </SheetTitle>
                                            )}
                                        </div>
                                        <SheetDescription className="flex items-center gap-1 mt-1 capitalize cursor-pointer hover:text-foreground transition-colors w-fit" onClick={() => setCredentialsUser(userStats?.user)} title="Посмотреть учетные данные">
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
                                        <div>
                                            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
                                                Summary for {format(personalDate, "EEE, MMM d")}
                                            </h3>
                                            <DaySummaryDrill
                                                dateKey={format(personalDate, "yyyy-MM-dd")}
                                                userId={selectedUserId!}
                                            />
                                        </div>
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
                                                <p className="text-xs text-muted-foreground mb-4">{pcPlannedTasks.length + pcProjectTasks.length} tasks scheduled for {userStats?.name}</p>

                                                <div className="overflow-y-auto flex-1 pr-1">
                                                    <Accordion
                                                        type="multiple"
                                                        className="w-full space-y-4"
                                                        value={openPersonalAccordions}
                                                        onValueChange={setOpenPersonalAccordions}
                                                    >
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
                                                                                {['1', 'morning', 'смена 1'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Shift 1</Badge>
                                                                                ) : ['2', 'evening', 'смена 2'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Shift 2</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                {t.status === 'Completed' && <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />}
                                                                                <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                    {t.name || t.template?.name}
                                                                                </span>
                                                                                <OverdueBadge task={t} />
                                                                                <TaskPhotos task={t} max={2} />
                                                                                <Badge variant="secondary" className="text-[10px] capitalize">{t.tag}</Badge>
                                                                                {t.is_projected && <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-200">Projected</Badge>}
                                                                                {(t.assigned_user || t.default_assigned_user) && <UserBadge userId={t.assigned_user || t.default_assigned_user} />}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </AccordionContent>
                                                        </AccordionItem>

                                                        {/* Assigned Tasks */}
                                                        <AccordionItem value="assigned" className="border-b-0 bg-card rounded-md border shadow-sm mt-4">
                                                            <AccordionTrigger className="bg-primary/5 text-primary px-4 rounded-t-md hover:no-underline font-medium text-sm">
                                                                Personal Tasks ({pcPersonalTasks.length})
                                                            </AccordionTrigger>
                                                            <AccordionContent className="p-0 overflow-visible">
                                                                {pcPersonalTasks.length === 0 ? (
                                                                    <p className="text-xs text-muted-foreground p-4 text-center">No personal assignments</p>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {pcPersonalTasks.map((t, i) => (
                                                                            <div key={i} className={`flex items-center gap-3 p-3 group ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                                                                                {['1', 'morning', 'смена 1'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Shift 1</Badge>
                                                                                ) : ['2', 'evening', 'смена 2'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Shift 2</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                {t.status === 'Completed' && <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />}
                                                                                <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                    {t.name || t.template?.name}
                                                                                </span>
                                                                                <OverdueBadge task={t} />
                                                                                <TaskPhotos task={t} max={2} />
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
                                                                                {['1', 'morning', 'смена 1'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Shift 1</Badge>
                                                                                ) : ['2', 'evening', 'смена 2'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                                                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Shift 2</Badge>
                                                                                ) : <span className="w-14" />}
                                                                                <span className="text-sm font-medium flex-1 text-foreground">{t.name || t.template?.name}</span>
                                                                                <OverdueBadge task={t} />
                                                                                <TaskPhotos task={t} max={2} />
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
                                            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md pt-4 pb-4 mb-6 border-b flex flex-col gap-4 px-2 shadow-sm -mx-2">
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
                                                    <div className="flex flex-col gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full bg-background"
                                                            onClick={() => {
                                                                if (confirm("Вы уверены, что хотите сбросить привязку устройства?")) {
                                                                    resetDeviceMutation.mutate();
                                                                }
                                                            }}
                                                            disabled={resetDeviceMutation.isPending}
                                                        >
                                                            <RefreshCw className={`w-4 h-4 mr-2 ${resetDeviceMutation.isPending ? 'animate-spin' : ''}`} />
                                                            {resetDeviceMutation.isPending ? "Resetting..." : "Reset Device Binding"}
                                                        </Button>
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
                                                    </div>
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
                                                                const tCompleted = shift.daily.completed + shift.planned.completed + shift.project.completed + (shift.mini?.completed || 0) + shift.assigned.completed;
                                                                const tFailed = shift.daily.failed + shift.planned.failed + shift.project.failed + (shift.mini?.failed || 0) + shift.assigned.failed;
                                                                const tTasks = tCompleted + tFailed;
                                                                const tPercent = tTasks > 0 ? Math.round((tFailed / tTasks) * 100) : 0;
                                                                return (
                                                                    <div className="flex w-full justify-between items-center pr-4">
                                                                        <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                                                                            <CalendarIcon className="w-5 h-5 text-primary" />
                                                                            {(() => {
                                                                                const [yyyy, mm, dd] = shift.date.split('-');
                                                                                const localDate = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                                                                                return format(localDate, "MMM d, yyyy");
                                                                            })()}
                                                                            {shift.latitude && shift.longitude && (
                                                                                <a href={`https://www.google.com/maps?q=${shift.latitude},${shift.longitude}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-2 hover:bg-muted p-1 rounded-md transition-colors" title="View Shift Location">
                                                                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                                                                </a>
                                                                            )}
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
                                                                {['daily', 'planned', 'project', 'mini', 'assigned'].map((type) => (
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
                                                                    {(() => {
                                                                        const tDaily = shift.tasks.filter((t: any) => t.type?.toLowerCase() === 'daily');
                                                                        const tPlanned = shift.tasks.filter((t: any) => t.type?.toLowerCase() === 'planned');
                                                                        const tProject = shift.tasks.filter((t: any) => t.type?.toLowerCase() === 'project');
                                                                        const tAssigned = shift.tasks.filter((t: any) => t.type?.toLowerCase() === 'assigned');

                                                                        const renderTaskList = (tasks: any[]) => (
                                                                            <div className="space-y-2">
                                                                                {tasks.map((task: any) => (
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
                                                                        );

                                                                        if (shift.tasks.length === 0) {
                                                                            return (
                                                                                <div className="text-center py-6 px-4 bg-muted/10 border border-dashed border-border/60 rounded-lg">
                                                                                    <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                                                    <p className="text-sm font-semibold text-foreground">Shift Active</p>
                                                                                    <p className="text-xs text-muted-foreground mx-auto mt-1 max-w-[200px]">
                                                                                        Supervisor checked in but no task metrics were recorded.
                                                                                    </p>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return (
                                                                            <Accordion type="multiple" className="w-full space-y-3">
                                                                                {tDaily.length > 0 && (
                                                                                    <AccordionItem value="daily" className="border bg-card rounded-md shadow-sm">
                                                                                        <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-semibold text-sm">
                                                                                            Daily Tasks ({tDaily.length})
                                                                                        </AccordionTrigger>
                                                                                        <AccordionContent className="p-4 pt-4 border-t overflow-visible">
                                                                                            {renderTaskList(tDaily)}
                                                                                        </AccordionContent>
                                                                                    </AccordionItem>
                                                                                )}
                                                                                {tPlanned.length > 0 && (
                                                                                    <AccordionItem value="planned" className="border bg-card rounded-md shadow-sm">
                                                                                        <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-semibold text-sm">
                                                                                            Planned Tasks ({tPlanned.length})
                                                                                        </AccordionTrigger>
                                                                                        <AccordionContent className="p-4 pt-4 border-t overflow-visible">
                                                                                            {renderTaskList(tPlanned)}
                                                                                        </AccordionContent>
                                                                                    </AccordionItem>
                                                                                )}
                                                                                {tProject.length > 0 && (
                                                                                    <AccordionItem value="project" className="border bg-card rounded-md shadow-sm">
                                                                                        <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-semibold text-sm">
                                                                                            Project Tasks ({tProject.length})
                                                                                        </AccordionTrigger>
                                                                                        <AccordionContent className="p-4 pt-4 border-t overflow-visible">
                                                                                            {renderTaskList(tProject)}
                                                                                        </AccordionContent>
                                                                                    </AccordionItem>
                                                                                )}
                                                                                {tAssigned.length > 0 && (
                                                                                    <AccordionItem value="assigned" className="border bg-card rounded-md shadow-sm">
                                                                                        <AccordionTrigger className="bg-muted/10 px-4 rounded-t-md hover:no-underline font-semibold text-sm">
                                                                                            Assigned Tasks ({tAssigned.length})
                                                                                        </AccordionTrigger>
                                                                                        <AccordionContent className="p-4 pt-4 border-t overflow-visible">
                                                                                            {renderTaskList(tAssigned)}
                                                                                        </AccordionContent>
                                                                                    </AccordionItem>
                                                                                )}
                                                                            </Accordion>
                                                                        );
                                                                    })()}
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
                    )
                    }
                </SheetContent >
            </Sheet >

            {/* Add New Staff Dialog */}
            < Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen} >
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
            </Dialog >

            {/* Assign Confirmation Dialog */}
            < Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen} >
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
            </Dialog >

            {/* Unassign Confirmation Dialog */}
            < Dialog open={isUnassignModalOpen} onOpenChange={setIsUnassignModalOpen} >
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
            </Dialog >

            {/* Credentials Info Dialog */}
            <Dialog open={!!credentialsUser} onOpenChange={(open) => {
                if (!open) { setCredentialsUser(null); }
            }}>
                <DialogContent className="sm:max-w-[400px] z-[99999]" onInteractOutside={(e) => setCredentialsUser(null)}>
                    <DialogHeader>
                        <DialogTitle>Учетные данные: {credentialsUser?.name}</DialogTitle>
                        <DialogDescription>
                            Email пользователя для входа. Пароль теперь не хранится в открытом виде — сбросьте его, если нужно сообщить заново.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email" className="font-semibold text-muted-foreground">Email</Label>
                            <Input
                                id="email"
                                value={credentialsUser?.email || "Не указан"}
                                readOnly
                                className="bg-muted/50 font-mono text-sm h-10 border-muted"
                            />
                        </div>
                        {credentialsUser?.id && (
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    if (!credentialsUser?.id) return;
                                    if (!confirm("Сгенерировать новый пароль для пользователя? Старый перестанет работать.")) return;
                                    try {
                                        const token = localStorage.getItem("access_token");
                                        const res = await fetch(`https://api.trypranaextract.com/supervisors/${credentialsUser.id}/reset-password`, {
                                            method: "POST",
                                            headers: { "Authorization": `Bearer ${token}` },
                                        });
                                        if (!res.ok) {
                                            alert("Не удалось сбросить пароль");
                                            return;
                                        }
                                        const data = await res.json();
                                        prompt("Новый пароль (скопируйте, он больше не будет показан):", data.new_password);
                                    } catch (e) {
                                        console.error(e);
                                        alert("Ошибка при сбросе пароля");
                                    }
                                }}
                            >
                                Сбросить пароль
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

        </div >
    );
}
