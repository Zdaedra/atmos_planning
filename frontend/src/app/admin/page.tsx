"use client";

import { useState, useEffect } from "react";
import ReactCalendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
    Users, AlertCircle, CheckCircle, LayoutDashboard, Settings, Map, FileText, Activity, Bug, Plus, X, RefreshCw, Trash2,
    TrendingUp, AlertTriangle, BrainCircuit, Play, Pause, LayoutTemplate, SquareChartGantt, ChevronDown, ChevronRight, Hash, Square, CheckSquare, Clock, ShieldAlert, Zap, Search, Bell, LogOut, ChevronUp, Calendar, Briefcase, Edit
} from "lucide-react";

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState("overview");

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: "var(--background)" }}>
            {/* Sidebar */}
            <aside style={{ width: "260px", background: "var(--card)", borderRight: "1px solid var(--border)", padding: "24px 0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "0 24px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ background: "var(--primary)", padding: "8px", borderRadius: "12px", color: "white" }}>
                        <Activity size={24} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>Atmos Admin</h2>
                </div>

                <nav style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 16px" }}>
                    <NavItem active={activeTab === "overview"} onClick={() => setActiveTab("overview")} icon={<LayoutDashboard size={20} />} label="Overview" />
                    <NavItem active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")} icon={<Calendar size={20} />} label="Calendar" />
                    <NavItem active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")} icon={<CheckCircle size={20} />} label="Tasks" />
                    {/* <NavItem active={activeTab === "centers"} onClick={() => setActiveTab("centers")} icon={<Map size={20} />} label="Centers & Zones" /> */}
                    <NavItem active={activeTab === "reports"} onClick={() => setActiveTab("reports")} icon={<FileText size={20} />} label="Photo Reports" />
                    <NavItem active={activeTab === "users"} onClick={() => setActiveTab("users")} icon={<Users size={20} />} label="Supervisors" />
                    <NavItem active={activeTab === "alerts"} onClick={() => setActiveTab("alerts")} icon={<AlertCircle size={20} />} label="AI Alerts" />
                </nav>

                <div style={{ marginTop: "auto", padding: "0 16px" }}>
                    <NavItem active={false} onClick={() => { }} icon={<Settings size={20} />} label="Settings" />
                </div>
            </aside>

            <main style={{ flex: 1, padding: "40px", overflowY: "auto" }}>
                {activeTab === "overview" && <OverviewDashboard />}

                {activeTab === "calendar" && <CalendarTab />}

                {activeTab === "tasks" && <TaskRulesTab />}

                {/* {activeTab === "centers" && <CentersTab />} */}

                {activeTab === "users" && <UsersTab />}

                {activeTab === "reports" && <PhotoReportsTab />}

                {activeTab === "alerts" && <AIAlertsTab />}

                {activeTab !== "overview" && activeTab !== "calendar" && activeTab !== "qa" && activeTab !== "tasks" && activeTab !== "centers" && activeTab !== "users" && activeTab !== "reports" && activeTab !== "alerts" && (
                    <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", marginTop: "24px" }}>
                        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>Module under construction</h2>
                        <p>This section is being developed and will be available soon.</p>
                    </div>
                )}

            </main>
        </div>
    );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                borderRadius: "10px",
                background: active ? "rgba(59, 130, 246, 0.1)" : "transparent",
                color: active ? "var(--primary)" : "var(--foreground)",
                border: "none",
                cursor: "pointer",
                fontWeight: active ? "600" : "500",
                textAlign: "left",
                width: "100%",
                transition: "all 0.2s ease"
            }}
        >
            {icon}
            {label}
        </button>
    );
}

function KpiCard({ title, value, trend, trendColor = "#64748b" }: { title: string, value: string, trend: string, trendColor?: string }) {
    return (
        <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#64748b", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</h3>
            <div style={{ fontSize: "36px", fontWeight: "700", marginBottom: "8px" }}>{value}</div>
            <div style={{ fontSize: "14px", color: trendColor }}>{trend}</div>
        </div>
    );
}

function AlertRow({ zone, issue, time, status }: { zone: string, issue: string, time: string, status: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "var(--background)", borderRadius: "12px", borderLeft: "4px solid var(--warning)" }}>
            <div>
                <div style={{ fontWeight: "600", marginBottom: "4px" }}>{zone}</div>
                <div style={{ color: "var(--danger)", fontSize: "14px" }}>{issue}</div>
            </div>
            <div style={{ textAlign: "right" }}>
                <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "4px" }}>{time}</div>
                <div style={{ fontSize: "12px", background: "var(--card)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", display: "inline-block" }}>{status}</div>
            </div>
        </div>
    );
}

function ButtonBotDashboard() {
    const [botState, setBotState] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        try {
            const res = await fetch("http://89.167.122.76:4081/status");
            const data = await res.json();
            setBotState(data);
        } catch (e) {
            console.error("Failed to fetch button bot status", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const sendCommand = async (endpoint: string) => {
        setLoading(true);
        await fetch(`http://89.167.122.76:4081/${endpoint}`, { method: "POST" });
        await fetchStatus();
    };

    if (loading && !botState) return <div style={{ padding: "40px" }}>Loading Button Bot Status...</div>;

    const isRunning = botState?.is_running;

    return (
        <div style={{ padding: "24px", background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                <div>
                    <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <Bug color="var(--primary)" /> Button Bot
                        <span style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "16px", background: isRunning ? "var(--success)" : "var(--danger)", color: "white" }}>
                            {isRunning ? "Running" : "Stopped"}
                        </span>
                    </h2>
                    <p style={{ margin: 0, color: "#64748b" }}>Continuously tests the UI workflows and logs errors.</p>
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                    {!isRunning ? (
                        <button onClick={() => sendCommand("start")} className="btn-primary" style={{ background: "var(--success)" }}>Start Test Loop</button>
                    ) : (
                        <button onClick={() => sendCommand("stop")} className="btn-primary" style={{ background: "var(--danger)" }}>Stop Test Loop</button>
                    )}
                    <button onClick={() => sendCommand("run_now")} className="btn-primary" style={{ background: "var(--primary)" }}>Run Scenarios Now</button>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
                <KpiCard title="Total Scenarios Checked" value={botState?.checks_count || 0} trend="Total cycles run" />
                <KpiCard title="Errors Detected" value={botState?.errors_count || 0} trend="Requires fix" trendColor={botState?.errors_count > 0 ? "var(--danger)" : "var(--success)"} />
                <KpiCard title="Last Run" value={botState?.last_run || "Never"} trend="Bot activity" />
            </div>

            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Recent Error Logs</h3>

            {botState?.errors?.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "var(--background)", borderRadius: "12px" }}>
                    No errors found! UI is stable.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {botState?.errors?.map((err: any, idx: number) => (
                        <div key={idx} style={{ padding: "20px", background: "var(--background)", borderRadius: "12px", borderLeft: "4px solid var(--danger)", display: "flex", gap: "24px" }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                    <div style={{ fontWeight: "bold", fontSize: "16px" }}>{err.scenario} - {err.action}</div>
                                    <div style={{ fontSize: "12px", color: "#64748b" }}>{err.timestamp}</div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "14px", marginBottom: "16px" }}>
                                    <div style={{ background: "var(--card)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Expected:</div>
                                        <div>{err.expected}</div>
                                    </div>
                                    <div style={{ background: "rgba(239, 68, 68, 0.1)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                                        <div style={{ fontSize: "12px", color: "var(--danger)", marginBottom: "4px" }}>Actual:</div>
                                        <div style={{ color: "var(--danger)", fontWeight: "500" }}>{err.actual}</div>
                                    </div>
                                </div>
                            </div>
                            {err.screenshot_base64 && (
                                <div style={{ width: "300px", height: "auto", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                                    <img src={`data:image/png;base64,${err.screenshot_base64}`} alt="Error context" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TaskRulesTab() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showImportForm, setShowImportForm] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [zoneId, setZoneId] = useState("1");
    const [repeatType, setRepeatType] = useState("daily");
    const [projectDate, setProjectDate] = useState<string>("");
    const [timeOfDay, setTimeOfDay] = useState("anytime");
    const [photoRequired, setPhotoRequired] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewingTemplate, setViewingTemplate] = useState<any>(null);

    useEffect(() => {
        if (repeatType !== "daily" && timeOfDay === "anytime") {
            setTimeOfDay("1");
        }
    }, [repeatType, timeOfDay]);

    const fetchTemplates = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/tasks/templates/");
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
                setSelectedTasks([]); // Clear selection on reload
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchZones = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/locations/zones/");
            if (res.ok) {
                const data = await res.json();
                setZones(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedTasks.length) return;
        if (!confirm(`Are you sure you want to delete ${selectedTasks.length} task rules?`)) return;

        try {
            const res = await fetch("https://api.trypranaextract.com/tasks/templates/bulk", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(selectedTasks)
            });
            if (res.ok) {
                setSelectedTasks([]);
                fetchTemplates();
            } else {
                alert("Failed to delete tasks.");
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchTemplates();
        fetchZones();
    }, []);

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) {
            alert("Please drop or select a file first");
            return;
        }

        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append("file", importFile);

            const res = await fetch("https://api.trypranaextract.com/tasks/templates/import-ai", {
                method: "POST",
                body: formData
            });

            if (res.ok) {
                setShowImportForm(false);
                setImportFile(null);
                fetchTemplates();
                alert("Tasks successfully imported!");
            } else {
                const data = await res.json();
                alert(`Failed to import tasks: ${data.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const isEditing = viewingTemplate !== null;
            const url = isEditing
                ? `https://api.trypranaextract.com/tasks/templates/${viewingTemplate.id}`
                : "https://api.trypranaextract.com/tasks/templates/";

            const res = await fetch(url, {
                method: isEditing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description: description || null,
                    zone_id: parseInt(zoneId),
                    repeat_type: repeatType,
                    time_of_day: timeOfDay,
                    photo_required: photoRequired,
                    next_execution_date: repeatType !== "daily" && projectDate ? new Date(projectDate).toISOString() : null,
                    checklist: null
                })
            });

            if (res.ok) {
                setShowForm(false);
                setViewingTemplate(null);
                setName("");
                setDescription("");
                setPhotoRequired(false);
                setProjectDate("");
                fetchTemplates();
            } else {
                alert("Failed to create task rule");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading task rules...</div>;

    return (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div>
                    <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Tasks</h1>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => { setShowImportForm(!showImportForm); setShowForm(false); setViewingTemplate(null); }} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: showImportForm ? "var(--background)" : "transparent", color: "var(--text)", cursor: "pointer", transition: "all 0.2s" }}>
                        Import via AI
                    </button>
                    <button onClick={() => {
                        if (viewingTemplate && showForm) {
                            setShowForm(false);
                        } else {
                            setShowForm(!showForm);
                            setShowImportForm(false);
                            setViewingTemplate(null);
                            setName("");
                            setDescription("");
                            setRepeatType("daily");
                            setTimeOfDay("anytime");
                            setPhotoRequired(false);
                            setProjectDate("");
                        }
                    }} className="btn-primary" style={{ width: "auto" }}>
                        <Plus size={20} /> Create Task
                    </button>
                </div>
            </header>

            {showImportForm && (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", marginBottom: "32px", animation: "slideDown 0.3s ease", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0, fontSize: "20px" }}>Import Tasks via AI</h3>
                        <button onClick={() => setShowImportForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={24} /></button>
                    </div>
                    <form onSubmit={handleImport}>
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#3b82f6" }}>✨ Upload Task Table (Excel, CSV)</label>
                            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#64748b" }}>
                                Drag and drop your `.csv` or `.xlsx` file here, or click to browse. The AI will automatically detect task names, frequencies (daily/weekly), and zones.
                            </p>
                            <div
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                        setImportFile(e.dataTransfer.files[0]);
                                    }
                                }}
                                style={{ width: "100%", padding: "40px 12px", borderRadius: "8px", border: "2px dashed var(--border)", background: "var(--background)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}
                            >
                                <Plus size={32} color="var(--primary)" />
                                <div style={{ fontWeight: "500" }}>
                                    {importFile ? (
                                        <span style={{ color: "var(--text)" }}>{importFile.name} (Ready)</span>
                                    ) : (
                                        <span>Drag & Drop .csv or .xlsx file here, or <button type="button" onClick={() => document.getElementById('file-upload')?.click()} style={{ background: "none", border: "none", color: "var(--primary)", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: "inherit", fontWeight: "inherit" }}>click to browse</button></span>
                                    )}
                                </div>
                                {importFile && (
                                    <div style={{ fontSize: "14px", color: "#10b981", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                                        ✓ File selected for AI processing
                                        <button type="button" onClick={() => setImportFile(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", textDecoration: "underline", marginLeft: "10px" }}>Remove</button>
                                    </div>
                                )}
                            </div>
                            <input
                                id="file-upload"
                                type="file"
                                accept=".csv,.txt,.xls,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                style={{ display: 'none' }}
                                onChange={e => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        setImportFile(e.target.files[0]);
                                    }
                                }}
                            />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                            <button type="button" onClick={() => setShowImportForm(false)} style={{ padding: "12px 24px", background: "transparent", color: "#64748b", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "16px" }}>Cancel</button>
                            <button type="submit" disabled={isSubmitting || !importFile} className="btn-primary" style={{ width: "auto", display: "flex", gap: "8px", alignItems: "center", opacity: (!importFile || isSubmitting) ? 0.5 : 1 }}>
                                {isSubmitting ? "Processing..." : "Process with Smart AI"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {showForm && (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", marginBottom: "32px", animation: "slideDown 0.3s ease", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}>
                    <button type="button" onClick={() => { setShowForm(false); setViewingTemplate(null); }} className="hover-brightness" style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", fontWeight: "600", padding: 0 }}>
                        <ChevronRight size={20} style={{ transform: "rotate(180deg)" }} /> Back to Tasks
                    </button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0, fontSize: "20px" }}>{viewingTemplate ? "Edit Task Rule" : "New Task Rule"}</h3>
                        <button type="button" onClick={() => { setShowForm(false); setViewingTemplate(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={24} /></button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                            <div className="input-group">
                                <label className="input-label">Rule Name</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" required placeholder="e.g. Deep Cleaning" />
                            </div>
                            <label className="input-label">Description / Instructions (optional)</label>
                            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Provide clear instructions for the supervisor" />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
                            <div className="input-group">
                                <label className="input-label">Frequency</label>
                                <select value={repeatType} onChange={e => setRepeatType(e.target.value)} className="input-field">
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Bi-weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="project">Project (One-off)</option>
                                </select>
                            </div>

                            {repeatType !== "daily" && (
                                <div className="input-group">
                                    <label className="input-label">{repeatType === "project" ? "Project Date" : "Start Date"}{repeatType !== "project" && " (Optional)"}</label>
                                    <input type="date" value={projectDate} onChange={e => setProjectDate(e.target.value)} className="input-field" required={repeatType === "project"} />
                                </div>
                            )}

                            <div className="input-group">
                                <label className="input-label">Shift / Time of Day</label>
                                <select value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)} className="input-field">
                                    <option value="1">Shift 1 (Смена 1)</option>
                                    <option value="2">Shift 2 (Смена 2)</option>
                                    <option value="anytime">Anytime (Любое время - Daily only)</option>
                                </select>
                            </div>

                            <div className="input-group" style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "28px" }}>
                                <input
                                    type="checkbox"
                                    id="photoReq"
                                    checked={photoRequired}
                                    onChange={e => setPhotoRequired(e.target.checked)}
                                    style={{ width: "24px", height: "24px", cursor: "pointer", accentColor: "var(--primary)" }}
                                />
                                <label htmlFor="photoReq" style={{ cursor: "pointer", fontWeight: 500, fontSize: "16px" }}>Require AI Photo Verification to complete</label>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                            <div>
                                {viewingTemplate && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (confirm("Are you sure you want to delete this task rule?")) {
                                                await fetch(`https://api.trypranaextract.com/tasks/templates/${viewingTemplate.id}`, { method: "DELETE" });
                                                setViewingTemplate(null);
                                                setShowForm(false);
                                                fetchTemplates();
                                            }
                                        }}
                                        className="hover-brightness"
                                        style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}
                                    >
                                        <X size={18} /> Delete task
                                    </button>
                                )}
                            </div>
                            <div style={{ display: "flex", gap: "12px" }}>
                                <button type="button" onClick={() => { setShowForm(false); setViewingTemplate(null); }} style={{ padding: "12px 24px", background: "transparent", color: "#64748b", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "16px" }}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ width: "auto" }}>
                                    {isSubmitting ? "Saving..." : "Save Rule"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {!showForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {templates.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card)", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <input
                                    type="checkbox"
                                    checked={selectedTasks.length === templates.length && templates.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedTasks(templates.map(t => t.id));
                                        else setSelectedTasks([]);
                                    }}
                                    style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "var(--primary)" }}
                                />
                                <span style={{ fontWeight: "500" }}>
                                    {selectedTasks.length > 0 ? `${selectedTasks.length} selected` : "Select All"}
                                </span>
                            </div>
                            {selectedTasks.length > 0 && (
                                <button onClick={handleBulkDelete} style={{ background: "var(--danger)", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }} className="hover-brightness">
                                    <X size={16} /> Delete Selected
                                </button>
                            )}
                        </div>
                    )}

                    {templates.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "64px 20px", background: "var(--card)", borderRadius: "16px", border: "1px dashed var(--border)", color: "#64748b" }}>
                            <LayoutDashboard size={48} style={{ opacity: 0.2, marginBottom: "16px" }} />
                            <h3 style={{ margin: "0 0 8px 0", color: "var(--foreground)" }}>No Rules Found</h3>
                            <p style={{ margin: 0 }}>Create a new task rule to start generating operations.</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                            {/* Group helper component */}
                            {(() => {
                                const renderGroup = (title: string, icon: React.ReactNode, typeId: string, filterFn: (t: any) => boolean) => {
                                    const groupTasks = templates.filter(filterFn);
                                    if (groupTasks.length === 0) return null;

                                    const isExpandedState = expandedGroups[typeId] || false;

                                    return (
                                        <div style={{ display: "flex", flexDirection: "column", background: "#e2e8f0", padding: isExpandedState ? "32px" : "20px 32px", borderRadius: "24px", border: "2px solid #94a3b8", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", transition: "all 0.2s ease" }}>
                                            <h2
                                                onClick={() => setExpandedGroups(prev => ({ ...prev, [typeId]: !prev[typeId] }))}
                                                style={{ fontSize: "20px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px", margin: isExpandedState ? "0 0 16px 0" : "0", color: "#334155", cursor: "pointer", userSelect: "none" }}
                                                className="hover-opacity"
                                            >
                                                {isExpandedState ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                                                {icon} {title}
                                                <span style={{ fontSize: "14px", fontWeight: "normal", color: "#64748b", background: "var(--card)", padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--border)", marginLeft: "auto" }}>{groupTasks.length} rules</span>
                                            </h2>

                                            {isExpandedState && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "12px", animation: "slideDown 0.2s ease" }}>
                                                    {groupTasks.map(tmpl => (
                                                        <div key={tmpl.id} style={{ background: "var(--card)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s ease", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }} className="hover-card" onClick={() => {
                                                            setViewingTemplate(tmpl);
                                                            setName(tmpl.name);
                                                            setDescription(tmpl.description || "");
                                                            setZoneId(tmpl.zone_id.toString());
                                                            setRepeatType(tmpl.repeat_type);
                                                            setTimeOfDay(tmpl.time_of_day);
                                                            setPhotoRequired(tmpl.photo_required);
                                                            // We map backend's actual next_execution_date to the projectDate input field
                                                            if (tmpl.next_execution_date) {
                                                                const dt = new Date(tmpl.next_execution_date);
                                                                // Format YYYY-MM-DD
                                                                if (!isNaN(dt.getTime())) {
                                                                    setProjectDate(dt.toISOString().split('T')[0]);
                                                                }
                                                            } else {
                                                                setProjectDate("");
                                                            }
                                                            setShowForm(true);
                                                        }}>
                                                            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTasks.includes(tmpl.id)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onChange={(e) => {
                                                                        e.stopPropagation();
                                                                        if (e.target.checked) setSelectedTasks(prev => [...prev, tmpl.id]);
                                                                        else setSelectedTasks(prev => prev.filter(id => id !== tmpl.id));
                                                                    }}
                                                                    style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "var(--primary)", marginTop: "4px" }}
                                                                />
                                                                <div>
                                                                    <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                                                                        {tmpl.name}
                                                                        {!tmpl.next_execution_date && tmpl.repeat_type !== 'daily' && (
                                                                            <span style={{ fontSize: "12px", background: "#fee2e2", color: "#ef4444", padding: "2px 8px", borderRadius: "12px", fontWeight: "bold" }}>Unassigned</span>
                                                                        )}
                                                                    </h3>
                                                                    {tmpl.description && (
                                                                        <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--foreground)", fontStyle: "italic", opacity: 0.8 }}>
                                                                            {tmpl.description}
                                                                        </p>
                                                                    )}
                                                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", fontSize: "14px", color: "#64748b" }}>
                                                                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><FileText size={16} />{tmpl.repeat_type}</span>
                                                                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                            <Clock size={16} />
                                                                            {tmpl.time_of_day ? tmpl.time_of_day.charAt(0).toUpperCase() + tmpl.time_of_day.slice(1) : "Anytime"}
                                                                        </span>
                                                                        {tmpl.next_execution_date && tmpl.repeat_type !== 'daily' && (
                                                                            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--primary)" }}>
                                                                                <Calendar size={16} />
                                                                                Start: {new Date(tmpl.next_execution_date).toLocaleDateString()}
                                                                            </span>
                                                                        )}
                                                                        {tmpl.photo_required ?
                                                                            (<span style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", background: "rgba(59, 130, 246, 0.1)", padding: "4px 8px", borderRadius: "6px" }}><Activity size={16} /> AI Verification</span>) :
                                                                            (<span style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}><CheckCircle size={16} /> Standard</span>)
                                                                        }
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {renderGroup("Unassigned", <AlertCircle size={20} color="#ef4444" />, "unassigned", t => t.repeat_type !== 'daily' && !t.next_execution_date)}
                                        {renderGroup("Daily", <RefreshCw size={20} color="#3b82f6" />, "daily", t => t.repeat_type === 'daily')}
                                        {renderGroup("Weekly", <LayoutDashboard size={20} color="#8b5cf6" />, "weekly", t => t.repeat_type === 'weekly' && !!t.next_execution_date)}
                                        {renderGroup("Bi-weekly", <LayoutDashboard size={20} color="#ec4899" />, "biweekly", t => t.repeat_type === 'biweekly' && !!t.next_execution_date)}
                                        {renderGroup("Monthly", <Calendar size={20} color="#f59e0b" />, "monthly", t => t.repeat_type === 'monthly' && !!t.next_execution_date)}
                                        {renderGroup("Projects", <Briefcase size={20} color="#10b981" />, "project", t => t.repeat_type === 'project' && !!t.next_execution_date)}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// CENTERS & ZONES TAB
// ----------------------------------------------------------------------

function CentersTab() {
    const [centers, setCenters] = useState<any[]>([]);
    const [zones, setZones] = useState<any[]>([]);
    const [showCenterForm, setShowCenterForm] = useState(false);
    const [showZoneForm, setShowZoneForm] = useState(false);

    // Center form
    const [newCenterName, setNewCenterName] = useState("");
    const [newCenterLocation, setNewCenterLocation] = useState("");

    // Zone form
    const [newZoneName, setNewZoneName] = useState("");
    const [newZoneCenterId, setNewZoneCenterId] = useState("");

    const fetchLocations = async () => {
        try {
            const [cRes, zRes] = await Promise.all([
                fetch("https://api.trypranaextract.com/locations/centers/"),
                fetch("https://api.trypranaextract.com/locations/zones/")
            ]);
            if (cRes.ok) setCenters(await cRes.json());
            if (zRes.ok) setZones(await zRes.json());
        } catch (e) {
            console.error("Failed to fetch locations", e);
        }
    };

    useEffect(() => {
        fetchLocations();
    }, []);

    const handleCreateCenter = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("https://api.trypranaextract.com/locations/centers/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newCenterName,
                    location: newCenterLocation
                })
            });
            if (res.ok) {
                setShowCenterForm(false);
                setNewCenterName("");
                setNewCenterLocation("");
                fetchLocations();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateZone = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("https://api.trypranaextract.com/locations/zones/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newZoneName,
                    center_id: parseInt(newZoneCenterId, 10)
                })
            });
            if (res.ok) {
                setShowZoneForm(false);
                setNewZoneName("");
                setNewZoneCenterId("");
                fetchLocations();
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div>
                    <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Centers & Zones</h1>
                    <p style={{ margin: 0, color: "#64748b" }}>Manage physical locations and split them into specific cleaning zones.</p>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                    {!showCenterForm && (
                        <button onClick={() => setShowCenterForm(true)} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
                            <Plus size={18} /> New Center
                        </button>
                    )}
                    {!showZoneForm && (
                        <button onClick={() => setShowZoneForm(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "white", cursor: "pointer" }}>
                            <Plus size={18} /> Add Zone
                        </button>
                    )}
                </div>
            </header>

            {showCenterForm && (
                <div style={{ background: "var(--card)", borderRadius: "16px", padding: "24px", marginBottom: "32px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <h2 style={{ margin: 0, fontSize: "20px" }}>Create New Center</h2>
                        <button onClick={() => setShowCenterForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleCreateCenter} style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>Center Name</label>
                            <input required value={newCenterName} onChange={e => setNewCenterName(e.target.value)} type="text" placeholder="e.g. Main Hub" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }} />
                        </div>
                        <button type="submit" className="btn-primary" style={{ height: "42px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "white", cursor: "pointer" }}>Save Center</button>
                    </form>
                </div>
            )}

            {showZoneForm && (
                <div style={{ background: "var(--card)", borderRadius: "16px", padding: "24px", marginBottom: "32px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <h2 style={{ margin: 0, fontSize: "20px" }}>Add New Zone</h2>
                        <button onClick={() => setShowZoneForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleCreateZone} style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>Select Center</label>
                            <select required value={newZoneCenterId} onChange={e => setNewZoneCenterId(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }}>
                                <option value="">Select a center...</option>
                                {centers.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>Zone Name</label>
                            <input required value={newZoneName} onChange={e => setNewZoneName(e.target.value)} type="text" placeholder="e.g. Kitchen Area" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }} />
                        </div>
                        <button type="submit" className="btn-primary" style={{ height: "42px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "white", cursor: "pointer" }}>Save Zone</button>
                    </form>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
                {centers.map(center => {
                    const centerZones = zones.filter(z => z.center_id === center.id);
                    return (
                        <div key={center.id} style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden" }}>
                            <div style={{ padding: "20px", borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
                                <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <Map size={18} className="text-blue-500" /> {center.name}
                                </h3>
                            </div>
                            <div style={{ padding: "20px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", marginBottom: "12px" }}>Assigned Zones ({centerZones.length})</div>
                                {centerZones.length > 0 ? (
                                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                                        {centerZones.map(zone => (
                                            <li key={zone.id} style={{ padding: "12px", background: "var(--background)", borderRadius: "8px", fontSize: "14px", border: "1px solid var(--border)" }}>
                                                {zone.name}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div style={{ padding: "16px", textAlign: "center", background: "var(--background)", borderRadius: "8px", fontSize: "14px", color: "var(--muted)", border: "1px dashed var(--border)" }}>
                                        No zones configured yet
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {centers.length === 0 && (
                    <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", background: "var(--card)", borderRadius: "16px", border: "1px dashed var(--border)", gridColumn: "1 / -1" }}>
                        No centers found. Click "New Center" to start your hierarchy.
                    </div>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// SUPERVISORS (USERS) TAB
// ----------------------------------------------------------------------

function UsersTab() {
    const [users, setUsers] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);

    // New/Edit user form state
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const fetchData = async () => {
        try {
            const uRes = await fetch("https://api.trypranaextract.com/supervisors/");
            if (uRes.ok) setUsers(await uRes.json());
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openCreateForm = () => {
        setEditingUser(null);
        setName("");
        setEmail("");
        setPassword("");
        setShowForm(true);
    };

    const openEditForm = (user: any) => {
        setEditingUser(user);
        setName(user.name);
        setEmail(user.email);
        setPassword(user.plain_password || "");
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEditing = !!editingUser;
            const url = isEditing
                ? `https://api.trypranaextract.com/supervisors/${editingUser.id}`
                : "https://api.trypranaextract.com/supervisors/";
            const method = isEditing ? "PUT" : "POST";

            const payload: any = {
                name,
                email
            };

            // Only send password if provided
            if (password) payload.password = password;
            // Creation requires password
            if (!isEditing && !password) return alert("Password required for new supervisor");

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setShowForm(false);
                fetchData();
            } else {
                alert(`Failed to ${isEditing ? 'update' : 'create'} supervisor. Check if email already exists.`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteUser = async (user_id: string | number) => {
        if (!confirm("Are you sure you want to delete this supervisor? This may orphan their tasks if not handled.")) return;
        try {
            const res = await fetch(`https://api.trypranaextract.com/supervisors/${user_id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchData();
            } else {
                alert("Failed to delete supervisor.");
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div>
                    <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Supervisors</h1>
                    <p style={{ margin: 0, color: "#64748b" }}>Manage cleaning staff accounts and passwords.</p>
                </div>
            </header>

            {showForm && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
                    <div style={{ background: "var(--card)", borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border)", position: "relative", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                            <h2 style={{ margin: 0, fontSize: "24px" }}>{editingUser ? "Edit Supervisor" : "Register New Supervisor"}</h2>
                            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "flex-start" }}>
                            <div>
                                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>Full Name</label>
                                <input required value={name} onChange={e => setName(e.target.value)} type="text" placeholder="e.g. Anna Schmidt" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>Email Address</label>
                                <input required value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="e.g. anna@example.com" style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>{editingUser ? "New Password (Optional)" : "Password"}</label>
                                <input required={!editingUser} value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder={editingUser ? "Leave blank to keep unchanged" : "Set password"} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)" }} />
                            </div>
                            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "16px", gap: "12px" }}>
                                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary" style={{ height: "48px", padding: "0 24px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)", cursor: "pointer", fontWeight: "bold" }}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ height: "48px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "white", cursor: "pointer", fontWeight: "bold" }}>{editingUser ? "Save Changes" : "Create Account"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
                {users.map(user => {
                    return (
                        <div key={user.id} style={{ background: "var(--card)", borderRadius: "16px", padding: "24px", border: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: "16px", position: "relative" }}>
                            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "bold", flexShrink: 0 }}>
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</h3>
                                <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {user.email}
                                </div>
                                <div style={{ fontSize: "14px", color: "var(--text)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontWeight: 600 }}>Password:</span> {user.plain_password || <span style={{ color: "var(--warning)" }}>Protected</span>}
                                </div>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                                    <span style={{ padding: "4px 8px", background: "rgba(59, 130, 246, 0.1)", color: "var(--primary)", borderRadius: "4px", fontSize: "12px", fontWeight: "600", textTransform: "capitalize" }}>
                                        {user.role}
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button onClick={() => openEditForm(user)} style={{ flex: 1, padding: "8px 0", background: "transparent", border: "1px solid var(--primary)", borderRadius: "8px", color: "var(--primary)", cursor: "pointer", fontSize: "14px", fontWeight: "500", transition: "all 0.2s" }} className="hover-brightness">Edit profile</button>
                                    <button onClick={() => handleDeleteUser(user.id)} style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "none", borderRadius: "8px", color: "var(--danger)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }} className="hover-brightness"><X size={16} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Dashed Add Card */}
                <div onClick={openCreateForm} className="hover-brightness" style={{ background: "transparent", borderRadius: "16px", padding: "24px", border: "2px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", cursor: "pointer", minHeight: "180px", color: "var(--muted)", transition: "all 0.2s" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={24} />
                    </div>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>Add Supervisor</span>
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// PHOTO REPORTS TAB
// ----------------------------------------------------------------------

function PhotoReportsTab() {
    const [reports, setReports] = useState<any[]>([]);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    const fetchReports = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/media/reports");
            if (res.ok) {
                setReports(await res.json());
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const handleDeleteReport = async (reportId: string | number) => {
        if (!confirm("Are you sure you want to delete this photo report?")) return;
        try {
            const res = await fetch(`https://api.trypranaextract.com/media/reports/${reportId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchReports();
            } else {
                alert("Failed to delete report.");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Helper to format date
    const formatDate = (isoString?: string) => {
        if (!isoString) return "Unknown Date";
        const d = new Date(isoString);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div>
                    <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Photo Reports</h1>
                    <p style={{ margin: 0, color: "#64748b" }}>Recent visual proofs submitted by the cleaning staff upon task completion.</p>
                </div>
                <button onClick={fetchReports} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
                    <RefreshCw size={18} /> Refresh
                </button>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
                {reports.map(report => (
                    <div key={report.id} style={{ background: "var(--card)", borderRadius: "16px", overflow: "hidden", border: "1px solid var(--border)", display: "flex", flexDirection: "column", position: "relative" }}>
                        <button
                            onClick={() => handleDeleteReport(report.id)}
                            style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
                            className="hover-brightness"
                        >
                            <Trash2 size={16} />
                        </button>
                        <div
                            onClick={() => setZoomedImage(report.url)}
                            style={{
                                height: "220px",
                                background: `url(${report.url}) center/cover no-repeat, var(--muted)`,
                                backgroundColor: "var(--background)", /* Fallback */
                                borderBottom: "1px solid var(--border)",
                                cursor: "pointer",
                                transition: "opacity 0.2s"
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                        />
                        <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "bold", flexShrink: 0 }}>
                                    {report.uploaded_by_name?.charAt(0).toUpperCase() || "?"}
                                </div>
                                <div>
                                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{report.uploaded_by_name}</div>
                                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatDate(report.created_at)}</div>
                                </div>
                            </div>

                            <div style={{ background: "var(--background)", padding: "12px", borderRadius: "8px", fontSize: "14px", border: "1px solid var(--border)", marginTop: "auto" }}>
                                <div style={{ fontWeight: 600, marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Map size={14} className="text-blue-500" /> {report.zone_name}
                                </div>
                                <div style={{ color: "var(--muted)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <CheckCircle size={14} className="text-green-500" /> Task Action ID: #{report.task_id}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {reports.length === 0 && (
                    <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", background: "var(--card)", borderRadius: "16px", border: "1px dashed var(--border)", gridColumn: "1 / -1" }}>
                        No photo reports have been uploaded yet. Tasks completed with photos will appear here.
                    </div>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// AI ALERTS & INITIATIVES TAB
// ----------------------------------------------------------------------

function AIAlertsTab() {
    return (
        <div style={{ padding: "24px", background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", marginTop: "24px", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", display: "flex", alignItems: "center", gap: "12px" }}><Zap color="#f59e0b" /> AI Alerts</h2>
            <p style={{ margin: "0 0 24px 0", color: "#64748b" }}>Requests logged by Supervisors via Telegram or identified as anomalies by AI.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "4px solid #f59e0b" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                            <span style={{ padding: "4px 8px", background: "var(--muted)", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>via Telegram Voice Chat</span>
                            <span style={{ fontSize: "14px", color: "#64748b" }}>Today, 10:15 AM by Anna N.</span>
                        </div>
                        <p style={{ margin: "0 0 8px 0", fontWeight: "bold", fontSize: "16px" }}>"The floor buffer machine is completely broken, we need a replacement."</p>
                        <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>AI Action Suggestion: Create standard task to call repairman for Atmos HQ Berlin.</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <button className="btn-primary" style={{ background: "var(--primary)" }} onClick={() => alert("Task created successfully.")}>Create Task</button>
                        <button style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 16px", color: "var(--foreground)", cursor: "pointer" }}>Dismiss</button>
                    </div>
                </div>

                <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "4px solid var(--danger)" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                            <span style={{ padding: "4px 8px", background: "var(--danger)", color: "white", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>System Anomaly</span>
                            <span style={{ fontSize: "14px", color: "#64748b" }}>Today, 14:00 PM</span>
                        </div>
                        <p style={{ margin: "0 0 8px 0", fontWeight: "bold", fontSize: "16px" }}>Zone 'Bathrooms A' has been skipped for 2 consecutive shifts.</p>
                        <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>Escalation Level: High. Recommend contacting current shift supervisor.</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <button className="btn-primary" style={{ background: "transparent", color: "var(--primary)", border: "1px solid var(--primary)" }}>Message Supervisor</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// SHARED EDIT MODAL
// ----------------------------------------------------------------------

function EditTaskModal({ task, zones, onClose, onSave }: { task: any, zones: any[], onClose: () => void, onSave: (updatedTask: any) => void }) {
    // Determine if we are editing a concrete Task (which has a nested `template`) or a TaskTemplate itself.
    const isConcreteTask = !!task.template;
    const templateData = isConcreteTask ? task.template : task;

    const [name, setName] = useState(templateData.name || "");
    const [description, setDescription] = useState(templateData.description || "");
    const [zoneId, setZoneId] = useState(templateData.zone_id?.toString() || "1");
    const [repeatType, setRepeatType] = useState(templateData.repeat_type || "daily");
    const [timeOfDay, setTimeOfDay] = useState(templateData.time_of_day || "anytime");
    const [photoRequired, setPhotoRequired] = useState(templateData.photo_required || false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const updated = {
            name, description, zone_id: parseInt(zoneId), repeat_type: repeatType,
            time_of_day: timeOfDay, photo_required: photoRequired,
            next_execution_date: templateData.next_execution_date
        };
        await onSave({ id: templateData.id, ...updated });
        setIsSubmitting(false);
    };

    return (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, overflowY: "auto", padding: "40px 20px" }}>
            <div style={{ background: "var(--card)", padding: "32px", borderRadius: "16px", width: "100%", maxWidth: "600px", border: "1px solid var(--border)", animation: "slideDown 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <h2 style={{ margin: 0, fontSize: "24px" }}>Edit Task details</h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}><X size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div className="input-group">
                        <label className="input-label">Task Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" required />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Description & Instructions</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" style={{ minHeight: "100px", resize: "vertical" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
                        <div className="input-group">
                            <label className="input-label">Frequency</label>
                            <select value={repeatType} onChange={e => setRepeatType(e.target.value)} className="input-field">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="project">Project (One-off)</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                        <div className="input-group">
                            <label className="input-label">Shift / Time of Day</label>
                            <select value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)} className="input-field">
                                <option value="1">Shift 1 (Смена 1)</option>
                                <option value="2">Shift 2 (Смена 2)</option>
                                <option value="anytime">Anytime (Любое время - Daily only)</option>
                            </select>
                        </div>
                        <div className="input-group" style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "28px" }}>
                            <input type="checkbox" checked={photoRequired} onChange={e => setPhotoRequired(e.target.checked)} style={{ width: "20px", height: "20px" }} />
                            <label className="input-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px" }}><Activity size={16} color="var(--primary)" /> Require AI Photo Proof</label>
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
                        <button type="button" onClick={onClose} className="btn-secondary" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ minWidth: "120px" }}>{isSubmitting ? "Saving..." : "Save Changes"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// OVERVIEW DASHBOARD TAB
// ----------------------------------------------------------------------

function OverviewDashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [selectedZone, setSelectedZone] = useState<string>("All Zones");

    // Expand states
    const [dailyExpanded, setDailyExpanded] = useState<boolean>(false);
    const [plannedExpanded, setPlannedExpanded] = useState<boolean>(false);
    const [projectExpanded, setProjectExpanded] = useState<boolean>(false);
    const [overdueExpanded, setOverdueExpanded] = useState<boolean>(false);

    // Photo Report State
    const [viewPhotoTask, setViewPhotoTask] = useState<any>(null);
    const [taskPhotos, setTaskPhotos] = useState<any[]>([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);

    // Completion Report State
    const [viewingReportTask, setViewingReportTask] = useState<any>(null);
    const [taskReport, setTaskReport] = useState<any>(null);
    const [loadingReport, setLoadingReport] = useState(false);

    const handleViewActivityReport = async (act: any) => {
        if (act.type !== 'task' || !act.task_id) return;
        setViewingReportTask(act);
        setLoadingReport(true);
        try {
            const res = await fetch(`https://api.trypranaextract.com/tasks/${act.task_id}/report`);
            if (res.ok) {
                setTaskReport(await res.json());
            }
        } catch (e) { console.error("Error fetching report", e); }
        setLoadingReport(false);
    };

    // Editor State
    const [editingTask, setEditingTask] = useState<any | null>(null);
    const [allZones, setAllZones] = useState<any[]>([]);

    const handleViewReport = async (task: any) => {
        setViewPhotoTask(task);
        setLoadingPhotos(true);
        try {
            const res = await fetch(process.env.NEXT_PUBLIC_API_URL || "https://api.trypranaextract.com/media/reports");
            if (res.ok) {
                const allPhotos = await res.json();
                setTaskPhotos(allPhotos.filter((p: any) => p.task_id === task.id));
            }
        } catch (e) { console.error("Error fetching photos", e); }
        setLoadingPhotos(false);
    };

    useEffect(() => {
        const fetchZones = async () => {
            try {
                const res = await fetch("https://api.trypranaextract.com/locations/zones/");
                if (res.ok) setAllZones(await res.json());
            } catch (e) { console.error(e); }
        };
        fetchZones();

        const fetchDashboard = async () => {
            try {
                const url = (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.endsWith('/')) ? `${process.env.NEXT_PUBLIC_API_URL}/dashboard/` : "https://api.trypranaextract.com/dashboard/";
                const res = await fetch(url);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Dashboard error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
        const interval = setInterval(fetchDashboard, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleEditSave = async (updatedTemplate: any) => {
        try {
            const res = await fetch(`https://api.trypranaextract.com/tasks/templates/${updatedTemplate.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedTemplate)
            });
            if (res.ok) {
                // Force a dashboard refresh to grab the newly edited template names
                const fetchRes = await fetch("https://api.trypranaextract.com/dashboard/");
                if (fetchRes.ok) setData(await fetchRes.json());
                setEditingTask(null);
            } else {
                alert("Failed to update task template");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (loading || !data) {
        return <div style={{ padding: "40px", textAlign: "center" }}>Loading Operations Center Data...</div>;
    }

    const { kpis, today_tasks = [], overdue_tasks_list = [], active_shifts = [], recent_activity = [] } = data;

    // Filters
    const uniqueZones = Array.from(new Set(today_tasks.map((t: any) => t.zone_id)));

    let filteredTasks = today_tasks;
    if (selectedZone !== "All Zones") {
        filteredTasks = filteredTasks.filter((t: any) => `Zone #${t.zone_id}` === selectedZone);
    }
    let filteredOverdue = overdue_tasks_list || [];
    if (selectedZone !== "All Zones") {
        filteredOverdue = filteredOverdue.filter((t: any) => `Zone #${t.zone_id}` === selectedZone);
    }

    const getFrequencyLabel = (t: any) => t.template?.repeat_type?.toLowerCase() || "daily";

    // Categorize per user's request
    const dailyUncompleted: any[] = [];
    const completedTasks: any[] = [];
    const plannedLongTerm: any[] = [];
    const projectTasks: any[] = [];

    filteredTasks.forEach((t: any) => {
        const isDone = t.status === "Completed";
        const freq = getFrequencyLabel(t);
        if (isDone) {
            completedTasks.push(t);
        } else {
            if (freq === 'daily') {
                dailyUncompleted.push(t);
            } else if (freq === 'project') {
                projectTasks.push(t);
            } else {
                plannedLongTerm.push(t);
            }
        }
    });

    const totalPlanned = dailyUncompleted.length + plannedLongTerm.length + projectTasks.length;

    // Helper block for rendering a task row
    const renderTaskRow = (task: any, isOverdue = false) => {
        const isDone = task.status === "Completed";
        return (
            <div key={task.id}
                onClick={() => {
                    if (isDone) {
                        handleViewActivityReport({ type: 'task', task_id: task.id, message: `Completed: ${task.template?.name || `Task #${task.id}`}` });
                    } else {
                        setEditingTask(task);
                    }
                }}
                style={{
                    padding: "16px", background: "var(--background)", borderRadius: "12px",
                    borderLeft: `4px solid ${isDone ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--primary)')}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    opacity: isDone ? 0.7 : 1,
                    cursor: "pointer",
                    transition: "background 0.2s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--background)"}>
                <div>
                    <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "4px", textDecoration: isDone ? "line-through" : "none", display: "flex", alignItems: "center", gap: "8px" }}>
                        {task.template?.name || `Task #${task.id}`}
                        <Edit size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", gap: "12px" }}>
                        <span><Clock size={12} style={{ display: "inline", marginBottom: "-2px" }} /> {task.template?.time_of_day || 'Anytime'}</span>
                        <span style={{ textTransform: 'capitalize' }}><LayoutTemplate size={12} style={{ display: "inline", marginBottom: "-2px" }} /> {getFrequencyLabel(task)}</span>
                        {isOverdue && <span style={{ color: "var(--danger)", fontWeight: "bold" }}>Transferred form {task.scheduled_date ? new Date(task.scheduled_date).toLocaleDateString() : 'past'}</span>}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", background: "var(--card)", padding: "4px 8px", borderRadius: "4px", color: isDone ? "var(--success)" : "inherit" }}>
                        {task.status}
                    </div>
                    {isDone && task.template?.photo_required && (
                        <button className="btn-primary" style={{ padding: "4px 8px", fontSize: "12px", background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)" }} onClick={(e) => { e.stopPropagation(); handleViewReport(task); }}>
                            <FileText size={14} style={{ display: "inline", marginRight: "4px" }} /> Report
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ animation: "fadeIn 0.3s ease", paddingBottom: "100px" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
                <div>
                    <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Operations Center</h1>
                    <p style={{ margin: 0, color: "#64748b" }}>Complete overview of today's tasks and shifts.</p>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "4px" }}>
                        <select
                            value={selectedZone}
                            onChange={(e) => setSelectedZone(e.target.value)}
                            style={{ background: "transparent", border: "none", outline: "none", fontSize: "14px", padding: "4px 8px", color: "var(--foreground)" }}
                        >
                            <option value="All Zones">All Zones</option>
                            {uniqueZones.map((z: any) => (
                                <option key={z} value={`Zone #${z}`}>Zone #{z}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                        System Active
                    </div>
                </div>
            </header>

            {/* Top KPI Row (6 Cards) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "32px" }}>
                <KpiCard title="Total Today" value={(kpis?.total_tasks_today || 0).toString()} trend="Scheduled for today" />
                <KpiCard title="Completed" value={(kpis?.completed_tasks_today || 0).toString()} trend="Done so far" trendColor="var(--success)" />
                <KpiCard title="Not Completed" value={(kpis?.total_not_completed_today || 0).toString()} trend="Still remaining" trendColor="var(--warning)" />
                <KpiCard title="Progress" value={`${kpis?.completion_rate || 0}%`} trend="Of today's load" trendColor={(kpis?.completion_rate || 0) > 50 ? "var(--success)" : "var(--primary)"} />
                <KpiCard title="On Shift" value={(kpis?.active_supervisors || 0).toString()} trend="Active supervisors" trendColor="var(--primary)" />
                <KpiCard title="Overdue / Carry" value={(kpis?.overdue_tasks || 0).toString()} trend="Needs immediate attention" trendColor="var(--danger)" />
            </div>

            {/* Who is on shift block */}
            <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", padding: "24px", marginBottom: "32px" }}>
                <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Briefcase size={20} /> On Shift Today
                </h2>
                {(!active_shifts || active_shifts.length === 0) ? (
                    <div style={{ padding: "20px", background: "var(--background)", borderRadius: "8px", textAlign: "center", color: "var(--muted)" }}>
                        No staff currently clocked in.
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "8px" }}>
                        {active_shifts.map((shift: any) => {
                            const name = shift?.user_name || "Unknown";
                            const initial = name.charAt(0).toUpperCase() || "?";
                            return (
                                <div key={shift.id} style={{ minWidth: "260px", padding: "16px", background: "var(--background)", borderRadius: "12px", border: "1px solid var(--border)", flexShrink: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                                        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "16px" }}>
                                            {initial}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: "bold", fontSize: "16px" }}>{name}</div>
                                            <div style={{ fontSize: "12px", color: "var(--muted)", textTransform: "capitalize" }}>{shift.role || "Supervisor"} • On duty</div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                                        <span>Started: {shift.start_time ? new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A"}</span>
                                        <span style={{ fontWeight: "bold", color: "var(--text)" }}>
                                            {shift.tasks_completed_today || 0} / {shift.tasks_assigned_today || 0} Tasks
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px", alignItems: "start" }}>

                {/* Main Task List Area */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                    {/* Overdue Block */}
                    {filteredOverdue.length > 0 && (
                        <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--danger)", overflow: "hidden" }}>
                            <div
                                style={{ padding: "20px 24px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: overdueExpanded ? "rgba(239, 68, 68, 0.05)" : "transparent" }}
                                onClick={() => setOverdueExpanded(!overdueExpanded)}
                            >
                                <div>
                                    <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", color: "var(--danger)", userSelect: "none" }}>
                                        <ShieldAlert size={20} /> Overdue / Carry-over Tasks
                                    </h2>
                                    <p style={{ margin: 0, fontSize: "14px", color: "var(--danger)", opacity: 0.8, userSelect: "none" }}>
                                        These tasks carried over from previous periods.
                                    </p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                    <div style={{ fontSize: "14px", fontWeight: "bold", background: "var(--background)", border: "1px solid var(--border)", padding: "6px 16px", borderRadius: "20px", color: "var(--danger)" }}>
                                        {filteredOverdue.length} Tasks
                                    </div>
                                    {overdueExpanded ? <ChevronUp size={24} color="var(--danger)" /> : <ChevronDown size={24} color="var(--danger)" />}
                                </div>
                            </div>
                            {overdueExpanded && (
                                <div style={{ padding: "24px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.2s ease" }}>
                                    {filteredOverdue.map((t: any) => renderTaskRow(t, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Missed Yesterday Daily Block was moved to right sidebar */}

                    {/* Daily Tasks Block */}
                    <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden" }}>
                        <div
                            style={{ padding: "20px 24px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: dailyExpanded ? "rgba(59, 130, 246, 0.05)" : "transparent" }}
                            onClick={() => setDailyExpanded(!dailyExpanded)}
                        >
                            <div>
                                <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", userSelect: "none" }}>
                                    Daily planned for today
                                </h2>
                                <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", userSelect: "none" }}>Routine daily operations.</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <div style={{ fontSize: "14px", fontWeight: "bold", background: "var(--background)", border: "1px solid var(--border)", padding: "6px 16px", borderRadius: "20px" }}>
                                    {dailyUncompleted.length} Tasks
                                </div>
                                {dailyExpanded ? <ChevronUp size={24} color="var(--muted)" /> : <ChevronDown size={24} color="var(--muted)" />}
                            </div>
                        </div>
                        {dailyExpanded && (
                            <div style={{ padding: "24px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.2s ease" }}>
                                {dailyUncompleted.length === 0 ? (
                                    <div style={{ padding: "20px", background: "var(--background)", borderRadius: "12px", textAlign: "center", color: "var(--muted)", fontSize: "14px", border: "1px dashed var(--border)" }}>All daily tasks completed!</div>
                                ) : dailyUncompleted.map((t: any) => renderTaskRow(t))}
                            </div>
                        )}
                    </div>

                    {/* Planned (Long Term) Block */}
                    <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden" }}>
                        <div
                            style={{ padding: "20px 24px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: plannedExpanded ? "rgba(59, 130, 246, 0.05)" : "transparent" }}
                            onClick={() => setPlannedExpanded(!plannedExpanded)}
                        >
                            <div>
                                <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", userSelect: "none" }}>
                                    Planned (Weekly / Biweekly / Monthly)
                                </h2>
                                <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", userSelect: "none" }}>Scheduled long-term routine tasks.</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <div style={{ fontSize: "14px", fontWeight: "bold", background: "var(--background)", border: "1px solid var(--border)", padding: "6px 16px", borderRadius: "20px" }}>
                                    {plannedLongTerm.length} Tasks
                                </div>
                                {plannedExpanded ? <ChevronUp size={24} color="var(--muted)" /> : <ChevronDown size={24} color="var(--muted)" />}
                            </div>
                        </div>
                        {plannedExpanded && (
                            <div style={{ padding: "24px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.2s ease" }}>
                                {plannedLongTerm.length === 0 ? (
                                    <div style={{ padding: "20px", background: "var(--background)", borderRadius: "12px", textAlign: "center", color: "var(--muted)", fontSize: "14px", border: "1px dashed var(--border)" }}>No scheduled routine tasks for today.</div>
                                ) : plannedLongTerm.map((t: any) => renderTaskRow(t))}
                            </div>
                        )}
                    </div>

                    {/* Project Tasks Block */}
                    <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden", borderLeft: "4px solid var(--primary)" }}>
                        <div
                            style={{ padding: "20px 24px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: projectExpanded ? "rgba(59, 130, 246, 0.05)" : "transparent" }}
                            onClick={() => setProjectExpanded(!projectExpanded)}
                        >
                            <div>
                                <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", userSelect: "none" }}>
                                    Project Tasks
                                </h2>
                                <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", userSelect: "none" }}>One-off or special projects scheduled today.</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <div style={{ fontSize: "14px", fontWeight: "bold", background: "var(--background)", border: "1px solid var(--border)", padding: "6px 16px", borderRadius: "20px" }}>
                                    {projectTasks.length} Tasks
                                </div>
                                {projectExpanded ? <ChevronUp size={24} color="var(--muted)" /> : <ChevronDown size={24} color="var(--muted)" />}
                            </div>
                        </div>
                        {projectExpanded && (
                            <div style={{ padding: "24px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.2s ease" }}>
                                {projectTasks.length === 0 ? (
                                    <div style={{ padding: "20px", background: "var(--background)", borderRadius: "12px", textAlign: "center", color: "var(--muted)", fontSize: "14px", border: "1px dashed var(--border)" }}>No project tasks assigned for today.</div>
                                ) : projectTasks.map((t: any) => renderTaskRow(t))}
                            </div>
                        )}
                    </div>

                    {/* Completed Tasks Block */}
                    {completedTasks.length > 0 && (
                        <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", padding: "24px" }}>
                            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px", color: "var(--success)" }}>
                                <CheckCircle /> Completed Today
                            </h2>
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {completedTasks.map((t: any) => renderTaskRow(t))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Recent Activity & Quick links */}
                <div>
                    <div style={{ background: "var(--card)", borderRadius: "16px", border: "1px solid var(--border)", padding: "24px", position: "sticky", top: "24px" }}>
                        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase", color: "var(--muted)" }}>
                            <Zap size={18} /> AI Alerts
                        </h3>

                        {/* Missed Yesterday Daily Block */}
                        {kpis?.missed_yesterday_daily && kpis.missed_yesterday_daily.length > 0 ? (
                            <div style={{ background: "var(--background)", borderRadius: "12px", border: "1px solid #f97316", overflow: "hidden", marginBottom: "24px" }}>
                                <div
                                    style={{ padding: "16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(249, 115, 22, 0.05)" }}
                                    onClick={() => {
                                        const el = document.getElementById('missed-yesterday-sidebar');
                                        if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
                                    }}
                                >
                                    <div>
                                        <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px", color: "#f97316", userSelect: "none" }}>
                                            <AlertCircle size={16} /> Missed Yesterday
                                        </h4>
                                        <div style={{ fontSize: "12px", fontWeight: "bold", padding: "2px 8px", borderRadius: "12px", background: "rgba(249, 115, 22, 0.1)", color: "#f97316", display: "inline-block", marginTop: "4px" }}>
                                            {kpis.missed_yesterday_daily.length} Tasks
                                        </div>
                                    </div>
                                    <ChevronDown size={20} color="#f97316" />
                                </div>
                                <div id="missed-yesterday-sidebar" style={{ display: "none", padding: "16px", borderTop: "1px solid rgba(249, 115, 22, 0.2)", flexDirection: "column", gap: "8px" }}>
                                    {kpis.missed_yesterday_daily.map((t: any) => (
                                        <div key={t.id} style={{ fontSize: "13px", padding: "8px", background: "var(--card)", borderRadius: "6px", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                                            {t.template?.name || `Task #${t.id}`}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: "16px", background: "var(--background)", borderRadius: "8px", textAlign: "center", color: "var(--success)", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "24px" }}>
                                <CheckCircle size={16} /> No missed routines!
                            </div>
                        )}

                        <div style={{ paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
                            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "var(--muted)", textTransform: "uppercase" }}>System Alerts</h3>
                            {(kpis?.new_alerts || 0) > 0 ? (
                                <div style={{ background: "rgba(245, 158, 11, 0.1)", color: "#d97706", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                                    <Zap size={20} />
                                    <div style={{ fontSize: "14px", fontWeight: "bold" }}>{kpis.new_alerts} Pending AI Alerts</div>
                                </div>
                            ) : (
                                <div style={{ fontSize: "14px", color: "var(--success)", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <CheckCircle size={16} /> All alerts resolved
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Photo Report Modal */}
            {viewPhotoTask && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
                    <div style={{ background: "var(--card)", padding: "32px", borderRadius: "16px", width: "90%", maxWidth: "600px", border: "1px solid var(--border)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexShrink: 0 }}>
                            <h2 style={{ margin: 0, fontSize: "24px" }}>Photo Report: {viewPhotoTask.template?.name || `Zone #${viewPhotoTask.zone_id}`}</h2>
                            <button onClick={() => setViewPhotoTask(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                                <X size={24} />
                            </button>
                        </div>

                        {loadingPhotos ? (
                            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Loading photos...</div>
                        ) : taskPhotos.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)", background: "var(--background)", borderRadius: "8px" }}>
                                <FileText size={48} style={{ opacity: 0.2, marginBottom: "16px", margin: "0 auto", display: "block" }} />
                                <div>No photos uploaded for this task yet.</div>
                            </div>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", overflowY: "auto", paddingRight: "8px" }}>
                                {taskPhotos.map((photo, i) => (
                                    <div key={i} style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                                        <img src={photo.url} alt={`Report photo ${i}`} style={{ width: "100%", height: "auto", display: "block" }} />
                                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", color: "white", padding: "8px 12px", fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
                                            <span>Uploaded: {new Date(photo.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Task Completion Report Modal */}
            {viewingReportTask && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
                    <div style={{ background: "var(--card)", padding: "32px", borderRadius: "16px", width: "90%", maxWidth: "600px", border: "1px solid var(--border)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexShrink: 0 }}>
                            <h2 style={{ margin: 0, fontSize: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
                                <FileText color="var(--primary)" /> Completion Report
                            </h2>
                            <button onClick={() => setViewingReportTask(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ background: "var(--background)", padding: "16px", borderRadius: "12px", marginBottom: "24px", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px" }}>{viewingReportTask.message}</div>
                            <div style={{ fontSize: "13px", color: "var(--muted)" }}>Reported: {viewingReportTask.time}</div>
                        </div>

                        {loadingReport ? (
                            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>Loading feedback...</div>
                        ) : !taskReport ? (
                            <div style={{ textAlign: "center", padding: "40px", color: "var(--danger)" }}>Failed to load report data.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px", overflowY: "auto", paddingRight: "8px" }}>

                                {/* Comments Section */}
                                <div>
                                    <h3 style={{ fontSize: "16px", margin: "0 0 12px 0", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>Supervisor Feedback</h3>
                                    {taskReport.comments.length === 0 ? (
                                        <div style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "14px" }}>No text comments provided for this task.</div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                            {taskReport.comments.map((c: any) => (
                                                <div key={c.id} style={{ background: "rgba(59, 130, 246, 0.05)", borderLeft: "4px solid var(--primary)", padding: "12px", borderRadius: "0 8px 8px 0" }}>
                                                    <p style={{ margin: "0 0 8px 0", fontSize: "15px", lineHeight: "1.5" }}>"{c.text}"</p>
                                                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>{new Date(c.created_at).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Photos Section */}
                                <div>
                                    <h3 style={{ fontSize: "16px", margin: "0 0 12px 0", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>Photo Proofs</h3>
                                    {taskReport.photos.length === 0 ? (
                                        <div style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "14px" }}>No photo proof uploaded for this task.</div>
                                    ) : (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                                            {taskReport.photos.map((p: any) => (
                                                <div key={p.id} style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                                                    <img src={p.url} alt={`Proof ${p.id}`} style={{ width: "100%", height: "auto", display: "block" }} />
                                                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", color: "white", padding: "8px 12px", fontSize: "12px" }}>
                                                        Uploaded: {new Date(p.created_at).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* The full-screen rendering of EditTaskModal */}
            {editingTask && (
                <EditTaskModal
                    task={editingTask}
                    zones={allZones}
                    onClose={() => setEditingTask(null)}
                    onSave={handleEditSave}
                />
            )}
        </div>
    );
}

function CalendarTab() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [viewMode, setViewMode] = useState<'none' | 'list' | 'create_new' | 'add_existing'>('list');

    const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
    const [editingTask, setEditingTask] = useState<any | null>(null);

    // Accordion state for list view
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        daily: false,
        weekly: false,
        biweekly: false,
        monthly: false,
        project: false,
        overdue: false
    });

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    // Form state for new custom project
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [zoneId, setZoneId] = useState("1");
    const [zones, setZones] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state for existing template
    const [selectedFreq, setSelectedFreq] = useState("daily");
    const [selectedTemplateId, setSelectedTemplateId] = useState("");

    const fetchTemplates = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/tasks/templates/");
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchZones = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/locations/zones/");
            if (res.ok) setZones(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const fetchOverdue = async () => {
        try {
            const res = await fetch("https://api.trypranaextract.com/dashboard/");
            if (res.ok) {
                const data = await res.json();
                setOverdueTasks(data.overdue_tasks_list || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchTemplates();
        fetchZones();
        fetchOverdue();
    }, []);

    const projectTemplates = templates.filter(t => t.repeat_type === "project" && t.next_execution_date);
    const availableTemplates = templates
        .filter(t => t.repeat_type === selectedFreq)
        .sort((a, b) => {
            const aHasDate = !!a.next_execution_date;
            const bHasDate = !!b.next_execution_date;
            if (!aHasDate && bHasDate) return -1;
            if (aHasDate && !bHasDate) return 1;
            return a.name.localeCompare(b.name);
        });

    useEffect(() => {
        if (availableTemplates.length > 0 && (!selectedTemplateId || !availableTemplates.find(t => t.id.toString() === selectedTemplateId))) {
            setSelectedTemplateId(availableTemplates[0].id.toString());
        }
    }, [selectedFreq, availableTemplates, selectedTemplateId]);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDate) return;
        setIsSubmitting(true);
        try {
            const payload = {
                name,
                description,
                zone_id: parseInt(zoneId),
                repeat_type: "project",
                time_of_day: "anytime",
                photo_required: false,
                next_execution_date: selectedDate.toISOString()
            };
            const res = await fetch("https://api.trypranaextract.com/tasks/templates/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setViewMode('list');
                setName("");
                setDescription("");
                fetchTemplates();
            } else {
                alert("Failed to create project task");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddExisting = async () => {
        if (!selectedTemplateId || !selectedDate) return;
        const tmpl = templates.find(t => t.id.toString() === selectedTemplateId);
        if (!tmpl) return;

        setIsSubmitting(true);
        try {
            const payload = {
                name: tmpl.name,
                description: tmpl.description,
                zone_id: tmpl.zone_id,
                repeat_type: tmpl.repeat_type,
                time_of_day: tmpl.time_of_day,
                photo_required: tmpl.photo_required,
                next_execution_date: selectedDate.toISOString()
            };
            const res = await fetch(`https://api.trypranaextract.com/tasks/templates/${tmpl.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                fetchTemplates();
                setViewMode('list');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditSave = async (updatedTask: any) => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`https://api.trypranaextract.com/tasks/templates/${editingTask.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedTask)
            });
            if (res.ok) {
                fetchTemplates();
                setEditingTask(null);
            } else {
                alert("Failed to update task");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderRightPane = () => {
        if (viewMode === 'none') {
            return (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", textAlign: "center", color: "var(--muted)" }}>
                    <Calendar size={48} style={{ opacity: 0.2, margin: "0 auto 16px ", display: "block" }} />
                    <p>Select a date on the calendar to view or add tasks.</p>
                </div>
            );
        }

        const dateStr = selectedDate?.toLocaleDateString() || "";
        const dayEvents = templates.filter(t => {
            if (!selectedDate) return false;

            const rpt = (t.repeat_type || "daily").toLowerCase();

            // Daily tasks happen every day
            if (rpt === 'daily') return true;

            // For other recurring tasks, it MUST have an assigned start date (next_execution_date)
            // If it doesn't, it is conceptually "Unassigned" and shouldn't appear on the calendar
            const anchorDateStr = t.next_execution_date;
            if (!anchorDateStr) return false;

            const anchorD = new Date(anchorDateStr);

            // Strip times for date comparisons
            const selectedTime = selectedDate.getTime();
            const anchorTime = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate()).getTime();

            if (rpt === 'project') {
                return anchorD.getDate() === selectedDate.getDate() &&
                    anchorD.getMonth() === selectedDate.getMonth() &&
                    anchorD.getFullYear() === selectedDate.getFullYear();
            }

            if (rpt === 'weekly') {
                // Same day of the week, and must be on or after the anchor date
                return selectedTime >= anchorTime && selectedDate.getDay() === anchorD.getDay();
            }

            if (rpt === 'biweekly') {
                // Same day of the week, but every 2 weeks, starting from anchor week
                if (selectedTime < anchorTime || selectedDate.getDay() !== anchorD.getDay()) return false;
                const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                const diffWeeks = Math.floor((selectedTime - anchorTime) / msPerWeek);
                return diffWeeks >= 0 && diffWeeks % 2 === 0;
            }

            if (rpt === 'monthly') {
                // Same date of the month, on or after anchor date
                return selectedTime >= anchorTime && selectedDate.getDate() === anchorD.getDate();
            }

            return false;
        });

        const unassignedTemplates = templates.filter(t => t.repeat_type !== 'daily' && !t.next_execution_date);


        if (viewMode === 'list') {
            return (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", animation: "slideDown 0.2s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0, fontSize: "18px" }}>Scheduled for {dateStr}</h3>
                        <button onClick={() => setViewMode('none')} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={20} /></button>
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                        <button onClick={() => setViewMode('create_new')} className="btn-primary" style={{ flex: 1, padding: "8px", fontSize: "14px", display: "flex", justifyContent: "center", gap: "6px" }}>
                            <Plus size={16} /> New Task
                        </button>
                        <button onClick={() => setViewMode('add_existing')} className="btn-secondary" style={{ flex: 1, padding: "8px", fontSize: "14px", display: "flex", justifyContent: "center", gap: "6px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer" }}>
                            <Plus size={16} /> From Existing
                        </button>
                    </div>

                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--muted)", textTransform: "uppercase" }}>Events ({dayEvents.length})</h4>
                    {dayEvents.length === 0 ? (
                        <div style={{ padding: "16px", background: "var(--background)", borderRadius: "8px", border: "1px dashed var(--border)", textAlign: "center", color: "var(--muted)", fontSize: "14px" }}>
                            No events scheduled for this day.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            {[
                                { id: 'daily', label: 'Daily Tasks' },
                                { id: 'weekly', label: 'Weekly Tasks' },
                                { id: 'biweekly', label: 'Bi-weekly Tasks' },
                                { id: 'monthly', label: 'Monthly Tasks' },
                                { id: 'project', label: 'Projects (One-off)' }
                            ].map(group => {
                                // For the standard calendar click, we usually only see "project" type tasks explicitly scheduled for this day
                                // unless we previously duplicated a daily/weekly template as a project to happen ON this day.
                                // The user requested grouping by "period type". Let's assume the original template frequency is stored or inferred.
                                // For now, all these specific-day events are stored as repeat_type="project" with the copied name. 
                                // To correctly categorize, we will filter based on the 'repeat_type' of the event.
                                const groupEvents = dayEvents.filter(t => {
                                    // If a task was created via 'From Existing', its original frequency might be part of its name/metadata, 
                                    // or we just group by the task's explicit repeat_type. 
                                    // Currently, 'From Existing' forces repeat_type='project'. Let's group based on the name if it contains hints,
                                    // or fall back. To properly support the user's request:
                                    // "сгруппируй в календаре в аккаордеон задачи внутри дня по типам периодов"
                                    // We'll map them. Since they are all technically 'project' type in the DB for that specific day:
                                    // Let's assume the user meant to group ALL templates that fall on this day.
                                    // Wait, dayEvents is currently ONLY projectTemplate. 
                                    // To show true daily/weekly tasks on the calendar, we need to calculate if they fall on this day.
                                    return t.repeat_type === group.id || (group.id === 'project' && t.repeat_type === 'project');
                                });

                                if (groupEvents.length === 0) return null;

                                return (
                                    <div key={group.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
                                        <button
                                            onClick={() => toggleGroup(group.id)}
                                            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--background)", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px", color: "var(--foreground)" }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                {group.label}
                                                <span style={{ padding: "2px 8px", background: "var(--border)", borderRadius: "12px", fontSize: "12px", color: "var(--muted)" }}>{groupEvents.length}</span>
                                            </div>
                                            <ChevronRight size={16} style={{ transform: expandedGroups[group.id] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                        </button>

                                        {expandedGroups[group.id] && (
                                            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                                                {groupEvents.map((t, idx) => {
                                                    return (
                                                        <div key={idx}
                                                            onClick={() => setEditingTask(t)}
                                                            style={{ padding: "12px", background: "var(--card)", borderRadius: "8px", borderLeft: "4px solid var(--primary)", border: "1px solid var(--border)", cursor: "pointer", transition: "background 0.2s" }}
                                                            onMouseOver={(e) => e.currentTarget.style.background = "var(--background)"}
                                                            onMouseOut={(e) => e.currentTarget.style.background = "var(--card)"}
                                                        >
                                                            <div style={{ fontWeight: "bold", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                {t.name}
                                                                <Edit size={14} style={{ opacity: 0.5 }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {selectedDate && selectedDate.toDateString() === new Date().toDateString() && overdueTasks.length > 0 && (
                        <div style={{ border: "2px solid var(--danger)", borderRadius: "12px", overflow: "hidden", marginTop: "16px" }}>
                            <button
                                onClick={() => toggleGroup('overdue')}
                                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#fee2e2", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px", color: "var(--danger)" }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <AlertCircle size={16} /> Overdue Carry-over Tasks
                                    <span style={{ padding: "2px 8px", background: "#fca5a5", color: "white", borderRadius: "12px", fontSize: "12px" }}>{overdueTasks.length}</span>
                                </div>
                                <ChevronRight size={16} style={{ transform: expandedGroups['overdue'] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                            </button>

                            {expandedGroups['overdue'] && (
                                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", background: "#fef2f2" }}>
                                    {overdueTasks.map((t, idx) => {
                                        return (
                                            <div key={`overdue-${idx}`}
                                                onClick={() => setEditingTask(t.template)}
                                                style={{ padding: "12px", background: "white", borderRadius: "8px", borderLeft: "4px solid var(--danger)", border: "1px solid #fca5a5", cursor: "pointer", transition: "background 0.2s" }}
                                                onMouseOver={(e) => e.currentTarget.style.background = "#fff1f2"}
                                                onMouseOut={(e) => e.currentTarget.style.background = "white"}
                                            >
                                                <div style={{ fontWeight: "bold", fontSize: "14px", color: "var(--danger)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    {t.template?.name || `Task #${t.id}`}
                                                    <Edit size={14} style={{ opacity: 0.5 }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            );
        }

        if (viewMode === 'add_existing') {
            return (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", animation: "slideDown 0.2s ease" }}>
                    <button onClick={() => setViewMode('list')} style={{ background: "none", border: "none", color: "var(--muted)", display: "flex", alignItems: "center", gap: "8px", padding: 0, marginBottom: "20px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
                        <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /> Back to Events
                    </button>
                    <h3 style={{ margin: "0 0 20px 0", fontSize: "18px" }}>Add Existing Task to {dateStr}</h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div className="input-group">
                            <label className="input-label">Select Task Frequency (Filter)</label>
                            <select value={selectedFreq} onChange={e => setSelectedFreq(e.target.value)} className="input-field">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="project">Project / One-off</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Select Task</label>
                            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="input-field">
                                {availableTemplates.length === 0 && <option value="" disabled>No tasks found</option>}
                                {availableTemplates.map(t => (
                                    <option key={t.id} value={t.id.toString()}>
                                        {t.name}{t.next_execution_date ? ` (Назначено: ${new Date(t.next_execution_date).toLocaleDateString('ru-RU')})` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button onClick={handleAddExisting} disabled={isSubmitting || !selectedTemplateId || availableTemplates.length === 0} className="btn-primary" style={{ marginTop: "8px" }}>
                            {isSubmitting ? "Adding..." : "Add to Calendar"}
                        </button>
                    </div>
                </div>
            );
        }

        if (viewMode === 'create_new') {
            return (
                <div style={{ background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)", animation: "slideDown 0.2s ease" }}>
                    <button onClick={() => setViewMode('list')} style={{ background: "none", border: "none", color: "var(--muted)", display: "flex", alignItems: "center", gap: "8px", padding: 0, marginBottom: "20px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
                        <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /> Back to Events
                    </button>
                    <h3 style={{ margin: "0 0 20px 0", fontSize: "18px" }}>New Task for {dateStr}</h3>
                    <form onSubmit={handleCreateProject} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div className="input-group">
                            <label className="input-label">Task Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" required placeholder="e.g. Extra Deep Clean" />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Description (optional)</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Instructions..." style={{ minHeight: "80px", resize: "vertical", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ marginTop: "8px" }}>
                            {isSubmitting ? "Saving..." : "Create Task"}
                        </button>
                    </form>
                </div>
            );
        }
    };

    return (
        <div style={{ animation: "fadeIn 0.3s ease", paddingBottom: "40px" }}>
            <header style={{ marginBottom: "32px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>Project Calendar</h1>
                <p style={{ margin: 0, color: "#64748b" }}>Schedule one-off projects and view upcoming project tasks.</p>
            </header>

            <div style={{ display: "flex", gap: "32px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 500px", background: "var(--card)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                    <ReactCalendar
                        className="custom-calendar"
                        onClickDay={(date) => {
                            setSelectedDate(date);
                            setViewMode('list');
                        }}
                        tileContent={({ date, view }) => {
                            if (view === 'month') {
                                const dayProjects = projectTemplates.filter(t => {
                                    const d = new Date(t.next_execution_date);
                                    return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
                                });
                                if (dayProjects.length > 0) {
                                    return (
                                        <div style={{ display: "flex", justifyContent: "center", gap: "2px", marginTop: "4px" }}>
                                            {dayProjects.slice(0, 3).map((_, i) => (
                                                <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }} />
                                            ))}
                                            {dayProjects.length > 3 && <span style={{ fontSize: "10px", lineHeight: "6px", color: "var(--primary)" }}>+</span>}
                                        </div>
                                    );
                                }
                            }
                            return null;
                        }}
                    />
                </div>

                <div style={{ flex: "1 1 300px" }}>
                    {renderRightPane()}
                </div>
            </div>

            {/* The full-screen rendering of EditTaskModal */}
            {editingTask && (
                <EditTaskModal
                    task={editingTask}
                    zones={zones}
                    onClose={() => setEditingTask(null)}
                    onSave={handleEditSave}
                />
            )}

            <style jsx global>{`
                .custom-calendar {
                    width: 100%;
                    border: none !important;
                    font-family: inherit !important;
                    background: transparent !important;
                }
                .react-calendar__navigation button {
                    color: var(--foreground) !important;
                    min-width: 44px;
                    background: none;
                    font-size: 16px;
                    margin-top: 8px;
                }
                .react-calendar__navigation button:enabled:hover,
                .react-calendar__navigation button:enabled:focus {
                    background-color: var(--background) !important;
                    border-radius: 8px;
                }
                .react-calendar__month-view__weekdays {
                    text-transform: uppercase;
                    font-weight: bold;
                    font-size: 12px;
                    color: var(--muted) !important;
                }
                .react-calendar__tile {
                    padding: 16px 8px !important;
                    background: none;
                    text-align: center;
                    border-radius: 8px !important;
                    color: var(--foreground) !important;
                }
                .react-calendar__tile:enabled:hover,
                .react-calendar__tile:enabled:focus {
                    background-color: var(--background) !important;
                }
                .react-calendar__tile--active {
                    background-color: var(--primary) !important;
                    color: white !important;
                    font-weight: bold;
                }
                .react-calendar__tile--active:enabled:hover,
                .react-calendar__tile--active:enabled:focus {
                    background-color: var(--primary) !important;
                    color: white !important;
                }
                .react-calendar__tile--now {
                    background: rgba(59, 130, 246, 0.1) !important;
                    color: var(--primary) !important;
                    font-weight: bold;
                }
            `}</style>
        </div>
    );
}