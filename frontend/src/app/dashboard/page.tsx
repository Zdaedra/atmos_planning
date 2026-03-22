"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, CheckCircle2, Bell, User, Clock, MapPin, Camera, CheckSquare, ChevronRight, MessageSquare, X, Calendar, LogIn } from "lucide-react";
import ReactCalendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

type TaskTemplate = {
    id?: number;
    name: string;
    description: string;
    repeat_type: string;
    time_of_day: string;
    photo_required: boolean;
};

type Task = {
    id: number;
    template_id: number;
    zone_id: number;
    status: string;
    scheduled_date?: string;
    assigned_user?: number;
    template?: TaskTemplate;
    photos?: any[];
    comments?: any[];
};

export default function SupervisorDashboard() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingStep, setLoadingStep] = useState("Initializing DOM");
    const [viewingTask, setViewingTask] = useState<Task | null>(null);
    const [comment, setComment] = useState("");
    const [user, setUser] = useState<any>(null);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    const [startingShift, setStartingShift] = useState(false);

    // Phase 34 & 35: Calendar and UI States
    const [dashboardMode, setDashboardMode] = useState<"today" | "calendar">("today");
    const [activeKpi, setActiveKpi] = useState<"tasks" | "left" | "done">("tasks");
    const [activeSubTab, setActiveSubTab] = useState<"assigned" | "daily" | "planned" | "projects" | "overdue" | "failed">("assigned");
    const [selectedFutureDate, setSelectedFutureDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [isInboxOpen, setIsInboxOpen] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const loadDashboardData = async () => {
            const token = localStorage.getItem("access_token");
            if (!token) {
                window.location.href = "/";
                return;
            }

            try {
                setLoadingStep("Fetching /auth/me...");
                const userRes = await fetch(`http://89.167.122.76:4080/auth/me?_cb=${Date.now()}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (!userRes.ok) {
                    localStorage.removeItem("access_token");
                    window.location.href = "/";
                    return;
                }
                const userData = await userRes.json();

                setLoadingStep(`Fetching /tasks/user/${userData.id}...`);
                const tasksRes = await fetch(`http://89.167.122.76:4080/tasks/user/${userData.id}`);
                const tasksData = tasksRes.ok ? await tasksRes.json() : [];

                setLoadingStep("Fetching /tasks/templates/...");
                const defaultTemplatesRes = await fetch(`http://89.167.122.76:4080/tasks/templates/`);
                const templatesData = defaultTemplatesRes.ok ? await defaultTemplatesRes.json() : [];

                setLoadingStep("Fetching /messages/user...");
                const msgsRes = await fetch(`http://89.167.122.76:4080/messages/user/${userData.id}?unread_only=true`);
                const msgsData = msgsRes.ok ? await msgsRes.json() : [];

                if (isMounted) {
                    setUser(userData);
                    setTasks(tasksData);
                    setTemplates(templatesData);
                    setMessages(msgsData);
                }
            } catch (e: any) {
                console.error("Failed to load dashboard data", e);
                setLoadingStep(`Fatal Error: ${e.message || JSON.stringify(e)}`);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadDashboardData();
        return () => { isMounted = false; };
    }, []);

    // Poll for tasks independently
    useEffect(() => {
        if (!user || (!user.id)) return;
        const interval = setInterval(() => {
            fetch(`http://89.167.122.76:4080/tasks/user/${user.id}`)
                .then(r => r.json())
                .then(data => setTasks(data))
                .catch(e => console.error(e));

            fetch(`http://89.167.122.76:4080/messages/user/${user.id}?unread_only=true`)
                .then(r => r.json())
                .then(data => setMessages(data))
                .catch(e => console.error(e));
        }, 15000);
        return () => clearInterval(interval);
    }, [user]);

    const [uploading, setUploading] = useState<number | null>(null);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, taskId: number, zoneId: number, autoComplete?: boolean) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(taskId);
        try {
            const formData = new FormData();
            formData.append("file", file);

            // POST to existing backend Media route
            const res = await fetch(`http://89.167.122.76:4080/media/upload?task_id=${taskId}&user_id=${user?.id || 1}&zone_id=${zoneId}`, {
                method: "POST",
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                const newPhoto = {
                    id: data.id,
                    url: data.url,
                    task_id: taskId
                };

                // Update the open modal immediately
                if (viewingTask && viewingTask.id === taskId) {
                    setViewingTask({
                        ...viewingTask,
                        photos: [...(viewingTask.photos || []), newPhoto]
                    });
                }

                // Update background array
                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        return { ...t, photos: [...(t.photos || []), newPhoto] };
                    }
                    return t;
                }));
                // alert("Photo uploaded successfully!");

                // Phase 45 AutoComplete Flow
                if (autoComplete) {
                    await handleMarkDone(taskId, true);
                }
            } else {
                alert("Failed to upload photo.");
            }
        } catch (error) {
            console.error("Upload error", error);
        } finally {
            setUploading(null);
        }
    };

    const handleMarkMessageRead = async (msgId: number) => {
        const token = localStorage.getItem("access_token");
        try {
            const res = await fetch(`http://89.167.122.76:4080/messages/${msgId}/read`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                setMessages(prev => prev.filter(m => m.id !== msgId));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkDone = async (taskId: number, skipPhotoCheck?: boolean) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Phase 44: Enforce Photo Requirement (unless skipped by auto-complete direct flow)
        if (!skipPhotoCheck && task.template?.photo_required) {
            if (!task.photos || task.photos.length === 0) {
                alert("This task requires photographic proof. Please 'Add Photo' before completing.");
                setViewingTask(task);
                return;
            }
        }

        try {
            const queryParams = new URLSearchParams([["status", "Completed"]]);
            if (comment && comment.trim()) {
                queryParams.append("comment", comment.trim());
            }
            if (user && user.id) {
                queryParams.append("user_id", user.id.toString());
            }

            const res = await fetch(`http://89.167.122.76:4080/tasks/${taskId}/status?${queryParams.toString()}`, { method: "PATCH" });
            if (res.ok) {
                setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "Completed" } : t));
                setViewingTask(null);
                setComment("");
            } else {
                alert("Failed to complete task.");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeletePhoto = async (photoId: number, taskId: number) => {
        if (!confirm("Are you sure you want to delete this photo?")) return;

        try {
            const res = await fetch(`http://89.167.122.76:4080/media/upload/${photoId}`, {
                method: "DELETE"
            });

            if (res.ok) {
                // Remove from active modal
                if (viewingTask && viewingTask.id === taskId) {
                    setViewingTask({
                        ...viewingTask,
                        photos: viewingTask.photos?.filter((p: any) => p.id !== photoId) || []
                    });
                }

                // Remove from background tasks array
                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        return { ...t, photos: t.photos?.filter((p: any) => p.id !== photoId) || [] };
                    }
                    return t;
                }));
            } else {
                alert("Failed to delete photo.");
            }
        } catch (e) {
            console.error("Delete photo error", e);
        }
    };

    if (loading) {
        return (
            <div className="auth-container" style={{ position: "relative", flexDirection: "column", gap: "20px" }}>
                <div className="loading-spinner"></div>
                <div style={{ color: "#3b82f6", fontWeight: "700", background: "white", padding: "10px", borderRadius: "8px" }}>
                    Debug Step: {loadingStep}
                </div>
            </div>
        );
    }

    // Safe local date formatter to prevent timezone shifts
    const formatLocalDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const isTaskOverdue = (t: any) => {
        if (t.template?.repeat_type?.toLowerCase() === 'daily') return false;
        if (t.status === "Overdue") return true;
        if (!["Pending", "Planned", "In Progress"].includes(t.status) || !t.scheduled_date) return false;

        const taskDateStr = typeof t.scheduled_date === 'string' ? t.scheduled_date.split('T')[0] : t.scheduled_date;
        const currentZoneDate = new Date();
        const todayLocalStr = `${currentZoneDate.getFullYear()}-${String(currentZoneDate.getMonth() + 1).padStart(2, '0')}-${String(currentZoneDate.getDate()).padStart(2, '0')}`;

        return taskDateStr < todayLocalStr;
    };

    const todayStr = formatLocalDate(new Date());
    const isToday = (t: any) => t.scheduled_date && t.scheduled_date.startsWith(todayStr);

    const isTodayOrPast = (t: any) => {
        if (!t.scheduled_date) return false;
        const taskDateStr = typeof t.scheduled_date === 'string' ? t.scheduled_date.split('T')[0] : t.scheduled_date;
        return taskDateStr <= todayStr;
    };

    const overdueTasks = tasks.filter(isTaskOverdue);
    const sortTasksByTime = (tasksQuery: any[]) => {
        const order: Record<string, number> = { morning: 1, anytime: 2, evening: 3 };
        return [...tasksQuery].sort((a, b) => {
            const timeA = (a.time_of_day || a.template?.time_of_day || "anytime").toLowerCase();
            const timeB = (b.time_of_day || b.template?.time_of_day || "anytime").toLowerCase();
            return (order[timeA] || 2) - (order[timeB] || 2);
        });
    };

    const completedTasks = sortTasksByTime(tasks.filter(t => t.status === "Completed"));
    const dailyTasks = sortTasksByTime(tasks.filter(t => t.status !== "Completed" && !isTaskOverdue(t) && isTodayOrPast(t) && t.template?.repeat_type?.toLowerCase() === 'daily'));
    const plannedTasks = sortTasksByTime(tasks.filter(t => t.status !== "Completed" && !isTaskOverdue(t) && isTodayOrPast(t) && t.template?.repeat_type?.toLowerCase() !== 'daily' && t.template?.repeat_type?.toLowerCase() !== 'project'));
    const projectTasks = sortTasksByTime(tasks.filter(t => t.status !== "Completed" && !isTaskOverdue(t) && isTodayOrPast(t) && t.template?.repeat_type?.toLowerCase() === 'project'));

    const getTaskCountForDate = (date: Date) => {
        const simTemplatesForDate = templates.filter(t => {
            const rpt = (t.repeat_type || "daily").toLowerCase();
            if (rpt === 'daily') return false; // Exclude daily from counts

            const anchorDateStr = (t as any).next_execution_date;
            if (!anchorDateStr) return false;

            const [aY, aM, aD] = anchorDateStr.split('T')[0].split('-');
            const anchorD = new Date(Number(aY), Number(aM) - 1, Number(aD));

            const futureTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            const anchorTime = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate()).getTime();

            if (rpt === 'project') {
                return anchorD.getDate() === date.getDate() &&
                    anchorD.getMonth() === date.getMonth() &&
                    anchorD.getFullYear() === date.getFullYear();
            }
            if (rpt === 'weekly') {
                return futureTime >= anchorTime && date.getDay() === anchorD.getDay();
            }
            if (rpt === 'biweekly') {
                if (futureTime < anchorTime) return false;
                const msPerDay = 24 * 60 * 60 * 1000;
                const diffDays = Math.round((futureTime - anchorTime) / msPerDay);
                return diffDays >= 0 && diffDays % 14 === 0;
            }
            if (rpt === 'monthly') {
                if (futureTime < anchorTime) return false;
                const msPerDay = 24 * 60 * 60 * 1000;
                const diffDays = Math.round((futureTime - anchorTime) / msPerDay);
                return diffDays >= 0 && diffDays % 28 === 0;
            }
            return false;
        });

        const dateStr = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const realOneOffs = tasks
            .filter((t: any) => t.scheduled_date && t.scheduled_date.split('T')[0] === dateStr && t.template?.repeat_type?.toLowerCase() !== 'daily')
            .map((t: any) => t.template)
            .filter((tmpl: any) => tmpl && !simTemplatesForDate.some(sim => sim.id === tmpl.id));

        return simTemplatesForDate.length + realOneOffs.length;
    };

    // Calendar Simulation Math
    const [selYear, selMonth, selDay] = selectedFutureDate.split('-');
    const futureDateObj = new Date(Number(selYear), Number(selMonth) - 1, Number(selDay));

    const simulatedTasksForDate = templates.filter(t => {
        const rpt = (t.repeat_type || "daily").toLowerCase();

        // Daily happens every single day
        if (rpt === 'daily') return true;

        // Missing anchor date? Can't simulate
        const anchorDateStr = (t as any).next_execution_date;
        if (!anchorDateStr) return false;

        const [aY, aM, aD] = anchorDateStr.split('T')[0].split('-');
        const anchorD = new Date(Number(aY), Number(aM) - 1, Number(aD));

        // Normalize times to midnight for clean comparison
        const futureTime = new Date(futureDateObj.getFullYear(), futureDateObj.getMonth(), futureDateObj.getDate()).getTime();
        const anchorTime = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate()).getTime();

        if (rpt === 'project') {
            return anchorD.getDate() === futureDateObj.getDate() &&
                anchorD.getMonth() === futureDateObj.getMonth() &&
                anchorD.getFullYear() === futureDateObj.getFullYear();
        }

        if (rpt === 'weekly') {
            return futureTime >= anchorTime && futureDateObj.getDay() === anchorD.getDay();
        }

        if (rpt === 'biweekly') {
            if (futureTime < anchorTime) return false;
            const msPerDay = 24 * 60 * 60 * 1000;
            const diffDays = Math.round((futureTime - anchorTime) / msPerDay);
            return diffDays >= 0 && diffDays % 14 === 0;
        }

        if (rpt === 'monthly') {
            if (futureTime < anchorTime) return false;
            const msPerDay = 24 * 60 * 60 * 1000;
            const diffDays = Math.round((futureTime - anchorTime) / msPerDay);
            return diffDays >= 0 && diffDays % 28 === 0;
        }

        return false;
    });

    // Merge manual one-off task assignments from the DB that exist for this date but aren't mathematically simulated
    const realOneOffTemplates = tasks
        .filter((t: any) => t.scheduled_date && t.scheduled_date.split('T')[0] === selectedFutureDate && t.template?.repeat_type?.toLowerCase() !== 'daily')
        .map((t: any) => t.template)
        .filter((tmpl: any) => tmpl && !simulatedTasksForDate.some(sim => sim.id === tmpl.id));

    const combinedSimulations = [...simulatedTasksForDate, ...realOneOffTemplates];

    const simDaily = sortTasksByTime(combinedSimulations.filter(t => (t.repeat_type || "daily").toLowerCase() === 'daily'));
    const simPlanned = sortTasksByTime(combinedSimulations.filter(t => ["weekly", "biweekly", "monthly"].includes((t.repeat_type || "").toLowerCase())));
    const simProject = sortTasksByTime(combinedSimulations.filter(t => (t.repeat_type || "").toLowerCase() === 'project'));

    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px", minHeight: "100vh", background: "var(--background)" }}>
            {/* TOP HEADER */}
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <img
                        src="/atmos-logo.jpg"
                        alt="Atmos Logo"
                        style={{ height: '88px', width: 'auto', borderRadius: '16px', objectFit: 'contain' }}
                    />
                    <div>
                        <h1 style={{ margin: "0 0 4px 0", fontSize: "28px", fontWeight: "700", letterSpacing: "-0.5px" }}>{user ? `${user.name}` : "Loading..."}</h1>
                        <p style={{ margin: 0, fontSize: "15px", color: "#64748b", fontWeight: "500" }}>{user?.role || "Supervisor"}</p>
                    </div>
                </div>

                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setIsInboxOpen(true)}>
                        <Bell size={24} color="#64748b" />
                        {(messages || []).length > 0 && (
                            <div style={{ position: "absolute", top: 0, right: 0, width: "10px", height: "10px", background: "var(--danger)", borderRadius: "50%", border: "2px solid var(--background)", animation: "pulse 2s infinite" }}></div>
                        )}
                    </div>
                    <div style={{ width: "44px", height: "44px", borderRadius: "22px", background: "var(--card)", border: "1px solid var(--border)", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                        <User size={20} color="var(--primary)" />
                    </div>
                </div>
            </header>

            {/* DATE & CALENDAR PILL */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", background: "var(--card)", padding: "16px", borderRadius: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
                <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--foreground)" }}>
                    Today · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <button
                    onClick={() => { setDashboardMode(dashboardMode === "calendar" ? "today" : "calendar"); setViewingTask(null); }}
                    style={{ background: dashboardMode === "calendar" ? "#f1f5f9" : "var(--primary)", color: dashboardMode === "calendar" ? "#64748b" : "white", padding: "10px 20px", borderRadius: "20px", border: "none", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}
                >
                    {dashboardMode === "calendar" ? "Close" : "Open Calendar"}
                </button>
            </div>

            <div style={{ animation: "fadeIn 0.5s ease" }}>
                {dashboardMode === "calendar" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        <div style={{ background: "var(--card)", padding: "20px", borderRadius: "20px", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", maxWidth: "100%", overflow: "hidden" }}>
                            <style>{`
                                .react-calendar { width: 100%; border: none; font-family: inherit; background: transparent; }
                                .react-calendar__tile { padding: 12px 6px; position: relative; height: 56px; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; border-radius: 12px; font-weight: 500;}
                                .react-calendar__tile--now { background: #e0f2fe !important; color: #0284c7 !important; }
                                .react-calendar__tile--active { background: var(--primary) !important; color: white !important; border-radius: 12px; }
                                .react-calendar__tile:enabled:hover { background: var(--border); border-radius: 12px; }
                                .react-calendar__navigation button:enabled:hover { background: var(--border); border-radius: 8px; }
                            `}</style>
                            <ReactCalendar
                                value={new Date(selectedFutureDate + 'T00:00:00')}
                                onChange={(val: any) => {
                                    if (val) setSelectedFutureDate(formatLocalDate(val));
                                }}
                                tileContent={({ date, view }) => {
                                    if (view === 'month') {
                                        const count = getTaskCountForDate(date);
                                        const isSelected = formatLocalDate(date) === selectedFutureDate;
                                        if (count > 0) {
                                            return (
                                                <div style={{ position: "absolute", bottom: "4px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                                                    <div style={{ width: "16px", height: "3px", background: isSelected ? "white" : "var(--primary)", borderRadius: "999px", marginBottom: "2px" }} />
                                                    <span style={{ fontSize: "10px", fontWeight: "600", color: isSelected ? "white" : "var(--muted)", lineHeight: 1 }}>
                                                        {count}
                                                    </span>
                                                </div>
                                            );
                                        }
                                    }
                                    return null;
                                }}
                                prev2Label={null}
                                next2Label={null}
                            />
                        </div>

                        {simulatedTasksForDate.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--card)", borderRadius: "20px", border: "1px solid var(--border)" }}>
                                <Calendar size={48} style={{ opacity: 0.2, margin: "0 auto 16px ", display: "block" }} />
                                <p style={{ fontSize: "16px" }}>No operations scheduled.</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                                {(() => {
                                    const morning = simDaily.filter(t => t.time_of_day?.toLowerCase() === 'morning' || t.time_of_day?.toLowerCase() === 'утро');
                                    const rest = simDaily.filter(t => t.time_of_day?.toLowerCase() !== 'morning' && t.time_of_day?.toLowerCase() !== 'утро');
                                    const weekly = simPlanned.filter(t => (t.repeat_type || "").toLowerCase() === 'weekly');
                                    const biweekly = simPlanned.filter(t => (t.repeat_type || "").toLowerCase() === 'biweekly');
                                    const monthly = simPlanned.filter(t => (t.repeat_type || "").toLowerCase() === 'monthly');
                                    const projects = simProject;

                                    const renderSimGroup = (tasksArray: any[], label: string, showTime: boolean = true) => {
                                        if (!tasksArray || tasksArray.length === 0) return null;
                                        return (
                                            <details style={{ background: "transparent" }}>
                                                <summary style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px", cursor: "pointer", color: "var(--foreground)", outline: "none", display: "flex", alignItems: "center", gap: "8px" }}>
                                                    {label} <span style={{ background: "#e2e8f0", padding: "2px 8px", borderRadius: "12px", fontSize: "14px", fontWeight: "600" }}>{tasksArray.length}</span>
                                                </summary>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingLeft: "4px" }}>
                                                    {tasksArray.map((t, idx) => (
                                                        <div key={`sim-${label}-${idx}`} style={{ background: "var(--card)", padding: "16px", borderRadius: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.04)", border: "1px solid var(--border)" }}>
                                                            <h4 style={{ margin: "0", fontSize: "17px", fontWeight: "600" }}>{t.name}</h4>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: "8px" }}>
                                                                {(t.time_of_day || 'anytime').toLowerCase() === 'morning' && (
                                                                    <span style={{ fontSize: '11px', background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)', color: '#ea580c', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Morning 🌅</span>
                                                                )}
                                                                {(t.time_of_day || 'anytime').toLowerCase() === 'evening' && (
                                                                    <span style={{ fontSize: '11px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#4f46e5', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Evening 🌙</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        );
                                    }

                                    return (
                                        <>
                                            {renderSimGroup(simDaily, "Daily", false)}
                                            {renderSimGroup([...weekly, ...biweekly, ...monthly], "Planned", false)}
                                            {renderSimGroup(projects, "Projects", false)}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {dashboardMode === "today" && !viewingTask && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {/* KPI STATS */}
                        <div style={{ display: "flex", gap: "12px", marginBottom: "32px", overflowX: "auto", paddingBottom: "8px" }}>
                            <div
                                onClick={() => setActiveKpi("tasks")}
                                style={{ flex: "1 0 100px", background: activeKpi === "tasks" ? "white" : "var(--card)", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", border: activeKpi === "tasks" ? "2px solid var(--primary)" : "2px solid transparent", cursor: "pointer", transition: "all 0.2s" }}
                            >
                                <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#64748b", fontWeight: "500" }}>Tasks</p>
                                <h3 style={{ margin: 0, fontSize: "28px", fontWeight: "700" }}>{dailyTasks.length + plannedTasks.length + projectTasks.length + completedTasks.length + overdueTasks.length} <span style={{ fontSize: "14px", fontWeight: "500", color: "#64748b" }}>Total</span></h3>
                            </div>
                            <div
                                onClick={() => setActiveKpi("left")}
                                style={{ flex: "1 0 100px", background: activeKpi === "left" ? "white" : "var(--card)", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", border: activeKpi === "left" ? "2px solid var(--danger)" : "2px solid transparent", cursor: "pointer", transition: "all 0.2s" }}
                            >
                                <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--danger)", fontWeight: "500" }}>Left</p>
                                <h3 style={{ margin: 0, fontSize: "28px", fontWeight: "700" }}>{(dailyTasks.length + plannedTasks.length + projectTasks.length + overdueTasks.length)} <span style={{ fontSize: "14px", fontWeight: "500", color: "#64748b" }}>Pending</span></h3>
                            </div>
                            <div
                                onClick={() => setActiveKpi("done")}
                                style={{ flex: "1 0 100px", background: activeKpi === "done" ? "#dcfce7" : "var(--done-bg)", padding: "20px", borderRadius: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)", border: activeKpi === "done" ? "2px solid #22c55e" : "2px solid transparent", cursor: "pointer", transition: "all 0.2s" }}
                            >
                                <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#2E7D32", fontWeight: "500" }}>Done</p>
                                <h3 style={{ margin: 0, fontSize: "28px", fontWeight: "700", color: "#1B5E20" }}>{completedTasks.length} <span style={{ fontSize: "14px", fontWeight: "500", color: "#2E7D32" }}>Tasks</span></h3>
                            </div>
                        </div>

                        {/* UNIVERSAL TASK ACCORDION RENDERER */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                            {(() => {
                                // 1. Determine which global arrays we are rendering based on KPI
                                let baseDaily = dailyTasks;
                                let basePlanned = plannedTasks;
                                let baseProject = projectTasks;
                                let baseOverdue = overdueTasks;

                                if (activeKpi === "left") {
                                    baseDaily = dailyTasks.filter(t => t.status !== "Completed");
                                    basePlanned = plannedTasks.filter(t => t.status !== "Completed");
                                    baseProject = projectTasks.filter(t => t.status !== "Completed");
                                    baseOverdue = overdueTasks.filter(t => t.status !== "Completed");
                                } else if (activeKpi === "done") {
                                    // Extract the completed groups from base arrays, instead of global completions,
                                    // if we want to sort them. But completedTasks already has everything.
                                    baseDaily = completedTasks.filter(t => t.template?.repeat_type?.toLowerCase() === 'daily' || !t.template?.repeat_type);
                                    basePlanned = completedTasks.filter(t => ['weekly', 'biweekly', 'monthly'].includes(t.template?.repeat_type?.toLowerCase() || ""));
                                    baseProject = completedTasks.filter(t => t.template?.repeat_type?.toLowerCase() === 'project');
                                    baseOverdue = [];
                                }

                                // 2. Helper to build a generic task card
                                const renderTaskCard = (task: any, isOverdue: boolean = false) => {
                                    const isDone = activeKpi === "done" || task.status === "Completed";
                                    const cardBg = isOverdue ? "#fff1f2" : isDone ? "var(--done-bg)" : "var(--card)";
                                    const cardBorder = isOverdue ? "#fecdd3" : isDone ? "#bbf7d0" : "var(--border)";
                                    const titleColor = isOverdue ? "#be123c" : isDone ? "#166534" : "var(--foreground)";
                                    const shadowStr = isOverdue ? "rgba(225, 29, 72, 0.05)" : "rgba(0,0,0,0.04)";

                                    return (
                                        <div key={`task-${task.id}`} onClick={() => setViewingTask(task)} style={{ background: cardBg, borderRadius: "20px", padding: "16px", boxShadow: `0 4px 12px ${shadowStr}`, border: `1px solid ${cardBorder}`, display: "flex", flexDirection: "column", gap: "12px", cursor: "pointer" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                <div>
                                                    <h3 style={{ margin: "0 0 6px 0", fontSize: "17px", fontWeight: "700", color: titleColor }}>
                                                        {task.template?.name || `Custom Task #${task.id}`}
                                                        {task.template?.repeat_type?.toLowerCase() !== 'daily' && task.assigned_user === user?.id && (
                                                            <span style={{ marginLeft: "8px", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", backgroundColor: "#3b82f6", color: "white", padding: "2px 6px", borderRadius: "6px", verticalAlign: "middle" }}>Personal</span>
                                                        )}
                                                    </h3>

                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px', marginTop: '8px' }}>
                                                        {(task.template?.time_of_day || 'anytime').toLowerCase() === 'morning' && (
                                                            <span style={{ fontSize: '11px', background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)', color: '#ea580c', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Morning 🌅</span>
                                                        )}
                                                        {(task.template?.time_of_day || 'anytime').toLowerCase() === 'evening' && (
                                                            <span style={{ fontSize: '11px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#4f46e5', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Evening 🌙</span>
                                                        )}
                                                        {isOverdue && <span style={{ fontSize: '11px', background: '#e11d48', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Overdue</span>}
                                                        {isDone && <span style={{ fontSize: '11px', background: '#16a34a', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Completed</span>}

                                                        <span style={{ fontSize: '11px', background: isDone ? '#bbf7d0' : '#f8fafc', border: `1px solid ${isDone ? '#86efac' : '#e2e8f0'}`, color: isDone ? '#166534' : '#475569', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                                                            {task.template?.repeat_type?.toLowerCase() === 'daily' ? 'Daily' :
                                                                task.template?.repeat_type?.toLowerCase() === 'weekly' ? 'Weekly' :
                                                                    task.template?.repeat_type?.toLowerCase() === 'biweekly' ? 'Bi-weekly' :
                                                                        task.template?.repeat_type?.toLowerCase() === 'monthly' ? 'Monthly' :
                                                                            task.template?.repeat_type?.toLowerCase() === 'project' ? 'Project' : 'One-time'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isDone && task.photos && task.photos.length > 0 && (
                                                    <img src={task.photos[0].url.startsWith('http') ? task.photos[0].url.replace('localhost:4000', '89.167.122.76:4000') : `http://89.167.122.76:4080${task.photos[0].url}`} alt="Thumb" style={{ width: "40px", height: "40px", borderRadius: "10px", objectFit: "cover", border: "1px solid #bbf7d0" }} />
                                                )}
                                            </div>

                                            {!isDone && (
                                                <div style={{ display: "flex", gap: "10px" }}>
                                                    {task.template?.photo_required && (!task.photos || task.photos.length === 0) ? (
                                                        <label onClick={(e) => e.stopPropagation()} style={{ flex: 1, background: uploading === task.id ? "#94a3b8" : "var(--primary)", color: "white", padding: "10px", borderRadius: "14px", fontSize: "14px", fontWeight: "600", cursor: uploading === task.id ? "not-allowed" : "pointer", textAlign: "center", transition: "opacity 0.2s", margin: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
                                                            <Camera size={16} /> {uploading === task.id ? "Wait..." : "Complete"}
                                                            <input type="file" accept="image/*" capture="environment" onChange={(e) => { e.stopPropagation(); handlePhotoUpload(e, task.id, task.zone_id, true); }} style={{ display: "none" }} disabled={uploading === task.id} />
                                                        </label>
                                                    ) : (
                                                        <>
                                                            <button onClick={(e) => { e.stopPropagation(); setViewingTask(task); }} style={{ flex: 1, background: isOverdue ? "#ffe4e6" : "var(--background)", color: isOverdue ? "#be123c" : "var(--foreground)", border: "none", padding: "10px", borderRadius: "14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }}>Add Photo</button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleMarkDone(task.id); }} style={{ flex: 1, background: "var(--primary)", color: "white", border: "none", padding: "10px", borderRadius: "14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "opacity 0.2s" }}>Complete</button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                // 3. Helper to build an Accordion Group
                                const renderGroupList = (tasksList: any[], label: string) => {
                                    if (tasksList.length === 0) return null;
                                    // Automatically open if it's the "Tasks" tab or "Left", maybe closed on "Done"?
                                    return (
                                        <details style={{ background: "transparent" }}>
                                            <summary style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px", cursor: "pointer", color: "var(--foreground)", outline: "none", display: "flex", alignItems: "center", gap: "8px" }}>
                                                {label} <span style={{ background: label === "My Personal Deliverables" ? "var(--primary)" : "#e2e8f0", color: label === "My Personal Deliverables" ? "white" : "inherit", padding: "2px 8px", borderRadius: "12px", fontSize: "14px", fontWeight: "600" }}>{tasksList.length}</span>
                                            </summary>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingLeft: "4px" }}>
                                                {tasksList.map(t => renderTaskCard(t, (baseOverdue || []).some((o: any) => o?.id === t?.id)))}
                                            </div>
                                        </details>
                                    );
                                };

                                // Groupings
                                const listDaily = (baseDaily || []);
                                const listPlanned = basePlanned.filter(t => t?.assigned_user !== user?.id);
                                const listProjects = baseProject.filter(t => t?.assigned_user !== user?.id);
                                const listOverdue = (baseOverdue || []);
                                const listFailed = (completedTasks || []).filter(t => t.status === "Failed");

                                const listPersonal = (baseOverdue || []).concat(basePlanned || []).concat(baseProject || []).concat(baseDaily || []).filter(t => t?.assigned_user === user?.id);

                                if (listPersonal.length === 0 && listFailed.length === 0 && listDaily.length === 0 && listPlanned.length === 0 && listProjects.length === 0) {
                                    return (
                                        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                                            <CheckCircle2 size={48} color="var(--success)" style={{ opacity: 0.5, margin: "0 auto 16px ", display: "block" }} />
                                            <p style={{ fontSize: "16px", fontWeight: "500" }}>Nothing found here.</p>
                                        </div>
                                    );
                                }
                                const tabs = [
                                    { id: "daily", label: "Daily", count: listDaily.length },
                                    { id: "planned", label: "Planned", count: listPlanned.length },
                                    { id: "projects", label: "Projects", count: listProjects.length },
                                    { id: "overdue", label: "Overdue", count: listOverdue.length },
                                    { id: "assigned", label: "My Assignments", count: listPersonal.length },
                                ];
                                if (listFailed.length > 0) tabs.push({ id: "failed", label: "Failed", count: listFailed.length });

                                return (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                                        <div style={{ display: "flex", gap: "8px", background: "var(--card)", padding: "6px", borderRadius: "99px", border: "1px solid var(--border)", overflowX: "auto", position: "relative" }}>
                                            {tabs.map(tab => (
                                                <div
                                                    key={tab.id}
                                                    style={{ flex: 1, position: "relative" }}
                                                >
                                                    {activeSubTab === tab.id && (
                                                        <motion.div
                                                            layoutId="activeSupervisorTab"
                                                            style={{
                                                                position: "absolute",
                                                                inset: 0,
                                                                background: "var(--primary)",
                                                                borderRadius: "99px",
                                                                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                                                                zIndex: 0
                                                            }}
                                                            transition={{ type: "spring", stiffness: 150, damping: 20 }}
                                                        />
                                                    )}
                                                    <div
                                                        onClick={() => setActiveSubTab(tab.id as any)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') setActiveSubTab(tab.id as any); }}
                                                        style={{
                                                            position: "relative",
                                                            zIndex: 1,
                                                            whiteSpace: "nowrap", padding: "10px 16px", borderRadius: "99px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600", transition: "color 0.2s",
                                                            background: "transparent",
                                                            color: activeSubTab === tab.id ? "white" : "var(--muted)",
                                                            textAlign: "center"
                                                        }}
                                                    >
                                                        {tab.label} <span style={{ opacity: 0.7, marginLeft: "4px" }}>({tab.count})</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingLeft: "4px" }}>
                                            {(activeSubTab === "assigned" ? listPersonal :
                                                activeSubTab === "daily" ? listDaily :
                                                    activeSubTab === "planned" ? listPlanned :
                                                        activeSubTab === "projects" ? listProjects :
                                                            activeSubTab === "overdue" ? listOverdue :
                                                                listFailed).map((t: any) => renderTaskCard(t, activeSubTab === "failed" || activeSubTab === "overdue" || (baseOverdue || []).some((o: any) => o?.id === t?.id)))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {dashboardMode === "today" && viewingTask && (
                    <div style={{ background: "var(--card)", padding: "32px 24px", borderRadius: "32px", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)", minHeight: "80vh", position: "relative" }}>
                        <button onClick={() => { setViewingTask(null); setComment("") }} style={{ background: "var(--background)", border: "none", color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px", fontWeight: "600", padding: "12px 20px", borderRadius: "20px" }}>
                            <ChevronRight size={20} style={{ transform: "rotate(180deg)" }} /> Back to Operations
                        </button>

                        <h2 style={{ fontSize: "28px", fontWeight: "700", margin: "0 0 16px 0", letterSpacing: "-0.5px" }}>{viewingTask.template?.name || `Custom Task #${viewingTask.id}`}</h2>
                        <p style={{ fontSize: "16px", color: "#64748b", margin: "0 0 32px 0", lineHeight: "1.6" }}>
                            {viewingTask.template?.description || "No specific instructions provided for this task."}
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", marginBottom: "32px" }}>
                            <div style={{ background: "var(--background)", padding: "20px", borderRadius: "20px", border: "1px solid var(--border)" }}>
                                <span style={{ display: "block", fontSize: "13px", color: "#64748b", textTransform: "uppercase", fontWeight: "600", marginBottom: "8px" }}>Time Objective</span>
                                <span style={{ fontSize: "18px", fontWeight: "600", textTransform: "capitalize", color: "var(--primary)" }}>{viewingTask.template?.time_of_day || "Anytime"}</span>
                            </div>
                        </div>

                        {viewingTask.status === "Completed" ? (
                            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
                                <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "0px", display: "flex", alignItems: "center", gap: "12px" }}><CheckCircle2 size={24} color="var(--success)" /> Completion Report</h3>
                                {viewingTask.photos && viewingTask.photos.length > 0 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                        {viewingTask.photos.map(photo => {
                                            const url = photo.url.startsWith('http') ? photo.url.replace('localhost:4000', '89.167.122.76:4000') : `http://89.167.122.76:4080${photo.url}`;
                                            return (
                                                <img
                                                    key={photo.id}
                                                    src={url}
                                                    style={{ width: "100%", borderRadius: "24px", border: "1px solid var(--border)", objectFit: "cover", cursor: "pointer", boxShadow: "0 8px 16px rgba(0,0,0,0.05)" }}
                                                    alt="Task complete"
                                                    onClick={() => setFullScreenImage(url)}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                                {viewingTask.comments && viewingTask.comments.length > 0 && (
                                    <div style={{ background: "var(--background)", padding: "20px", borderRadius: "20px", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                                        <p style={{ margin: 0, fontSize: "16px", fontStyle: "italic", lineHeight: "1.5" }}>"{viewingTask.comments[0].text}"</p>
                                    </div>
                                )}
                                {(!viewingTask.photos || viewingTask.photos.length === 0) && (!viewingTask.comments || viewingTask.comments.length === 0) && (
                                    <p style={{ color: "var(--muted)", fontSize: "16px" }}>No photo or comments were attached to this report.</p>
                                )}
                            </div>
                        ) : (
                            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: "12px", fontWeight: "600", fontSize: "16px" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><MessageSquare size={20} /> Add Comment </span>
                                    <textarea
                                        placeholder="Note any issues or observations..."
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        style={{ padding: "16px", borderRadius: "20px", border: "1px solid var(--border)", minHeight: "100px", fontFamily: "inherit", width: "100%", fontSize: "16px", background: "var(--background)", outline: "none" }}
                                    />
                                </label>

                                {viewingTask.photos && viewingTask.photos.length > 0 && (
                                    <div style={{ marginTop: "8px", marginBottom: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
                                        <p style={{ margin: "0", fontSize: "16px", fontWeight: "600", color: "var(--foreground)" }}>Attached Proof:</p>
                                        {viewingTask.photos.map(photo => {
                                            const url = photo.url.startsWith('http') ? photo.url.replace('localhost:4000', '89.167.122.76:4000') : `http://89.167.122.76:4080${photo.url}`;
                                            return (
                                                <div key={photo.id} style={{ position: "relative" }}>
                                                    <img
                                                        src={url}
                                                        style={{ width: "100%", borderRadius: "24px", border: "1px solid var(--border)", objectFit: "cover", maxHeight: "300px", cursor: "pointer" }}
                                                        alt="Task attachment"
                                                        onClick={() => setFullScreenImage(url)}
                                                    />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id, viewingTask.id); }}
                                                        style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer", backdropFilter: "blur(4px)" }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexDirection: "column" }}>
                                    <label style={{
                                        background: uploading === viewingTask.id ? "var(--border)" : "var(--background)",
                                        color: "var(--foreground)",
                                        border: "2px dashed var(--border)",
                                        padding: "20px",
                                        borderRadius: "20px",
                                        cursor: uploading === viewingTask.id ? "not-allowed" : "pointer",
                                        fontWeight: "600",
                                        fontSize: "16px",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        gap: "12px",
                                        transition: "all 0.2s"
                                    }}>
                                        <Camera size={24} color={uploading === viewingTask.id ? "#94a3b8" : "var(--primary)"} />
                                        {uploading === viewingTask.id ? "Uploading..." : "Attach Photo"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handlePhotoUpload(e, viewingTask.id, viewingTask.zone_id)}
                                            style={{ display: "none" }}
                                            disabled={uploading === viewingTask.id}
                                        />
                                    </label>
                                    <button
                                        onClick={() => handleMarkDone(viewingTask.id)}
                                        style={{ background: "var(--primary)", color: "white", border: "none", padding: "20px", borderRadius: "20px", fontSize: "18px", fontWeight: "700", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", transition: "opacity 0.2s", boxShadow: "0 8px 16px rgba(232, 168, 124, 0.3)" }}
                                    >
                                        <CheckCircle2 size={24} /> Submit Completion
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* INBOX MODAL */}
            {isInboxOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 99998, display: "flex", justifyContent: "center", alignItems: "center", padding: "24px" }} onClick={() => setIsInboxOpen(false)}>
                    <div style={{ background: "var(--card)", padding: "24px", borderRadius: "24px", width: "100%", maxWidth: "500px", maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                            <h2 style={{ fontSize: "24px", margin: 0, fontWeight: "700" }}>System Inbox</h2>
                            <button onClick={() => setIsInboxOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={24} /></button>
                        </div>
                        {(messages || []).length === 0 ? (
                            <p style={{ color: "var(--muted)", textAlign: "center", margin: "40px 0" }}>No unread messages.</p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                {(messages || []).map(msg => (
                                    <div key={msg.id} style={{ background: "var(--background)", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                                        <p style={{ margin: "0 0 12px 0", fontSize: "15px", lineHeight: "1.5" }}>{msg.text}</p>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: "12px", color: "var(--muted)" }}>{new Date(msg.created_at).toLocaleString()}</span>
                                            <button
                                                onClick={async () => {
                                                    const token = localStorage.getItem("access_token");
                                                    await fetch(`http://89.167.122.76:4080/messages/${msg.id}/read`, { method: "PATCH", headers: { "Authorization": `Bearer ${token}` } });
                                                    setMessages(messages.filter(m => m.id !== msg.id));
                                                }}
                                                style={{ background: "var(--primary)", color: "white", padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                                            >
                                                Mark Read
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* FULLSCREEN IMAGE MODAL */}
            {
                fullScreenImage && (
                    <div
                        onClick={() => setFullScreenImage(null)}
                        style={{
                            position: "fixed",
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: "rgba(0,0,0,0.95)",
                            zIndex: 9999,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: "24px",
                            cursor: "zoom-out",
                            animation: "fadeIn 0.2s ease"
                        }}
                    >
                        <img
                            src={fullScreenImage}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "12px" }}
                            alt="Full screen"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            onClick={() => setFullScreenImage(null)}
                            style={{ position: "absolute", top: "32px", right: "32px", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "none", color: "white", fontSize: "24px", width: "48px", height: "48px", borderRadius: "24px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}
                        >
                            ✕
                        </button>
                    </div>
                )
            }

            {/* SHIFT OVERLAY */}
            {!loading && user && user.role !== 'admin' && (!user.last_login || new Date(user.last_login).toISOString().split('T')[0] !== new Date().toISOString().split('T')[0]) && (
                <div style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.8)",
                    backdropFilter: "blur(5px)",
                    zIndex: 99999,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "24px"
                }}>
                    <div style={{ background: "var(--card)", padding: "32px", borderRadius: "24px", width: "100%", maxWidth: "400px", textAlign: "center", border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                        <h2 style={{ fontSize: "24px", marginBottom: "8px", fontWeight: "700" }}>Start Your Shift</h2>
                        <p style={{ color: "var(--muted)", marginBottom: "32px", fontSize: "16px", lineHeight: "1.5" }}>Welcome back, <span style={{ color: "var(--foreground)", fontWeight: "600" }}>{user.name}</span>! Please confirm you are starting your shift for today.</p>
                        <button
                            onClick={async () => {
                                setStartingShift(true);
                                try {
                                    const token = localStorage.getItem("access_token");
                                    const res = await fetch("http://89.167.122.76:4080/auth/shift/start", {
                                        method: "POST",
                                        headers: { "Authorization": `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                        const updatedUser = await res.json();
                                        setUser(updatedUser);
                                    }
                                } finally {
                                    setStartingShift(false);
                                }
                            }}
                            disabled={startingShift}
                            style={{ background: "var(--primary)", color: "white", width: "100%", padding: "16px", borderRadius: "16px", fontSize: "18px", fontWeight: "bold", border: "none", cursor: startingShift ? "not-allowed" : "pointer", opacity: startingShift ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                        >
                            <LogIn size={20} />
                            {startingShift ? "Starting..." : "Start Shift"}
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
}
