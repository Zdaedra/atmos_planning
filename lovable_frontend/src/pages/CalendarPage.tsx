import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, addDays, addMonths, isBefore } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllTasks, fetchTaskTemplates } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Pencil, CheckCircle2, CalendarCheck, XCircle } from "lucide-react";
import TaskFormModal from "@/components/TaskFormModal";
import { UserBadge } from "@/components/UserBadge";
import { TaskPhotos, OverdueBadge } from "@/components/TaskRowExtras";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [taskCreationMode, setTaskCreationMode] = useState<"existing" | "new">("existing");
  const [selectedUnassignedTask, setSelectedUnassignedTask] = useState<string>("");
  const [assignTpls, setAssignTpls] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: allTasks = [] } = useQuery({
    queryKey: ['allTasks'],
    queryFn: fetchAllTasks
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: fetchTaskTemplates
  });

  const { data: calendarMap = {} } = useQuery({
    queryKey: ['adminCalendar'],
    queryFn: async () => {
      const startD = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
      const endD = new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split('T')[0];
      const res = await fetch(`https://api.trypranaextract.com/tasks/calendar?start_date=${startD}&end_date=${endD}`);
      if (!res.ok) return {};
      return res.json();
    }
  });

  const calendarTasks = useMemo(() => {
    if (!calendarMap) return {};
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
        is_projected: t.is_projected,
        is_supply: !!t.is_supply,
        supply: t.template?.supply,
        supply_days_before: t.template?.supply_days_before,
        department: t.template?.department,
        next_execution_date: t.template?.next_execution_date,
      }));
    });
    return mapped;
  }, [calendarMap]);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const assignedTasks = calendarTasks[dateKey] || [];

  const sortTasksByTime = (tasksQuery: any[]) => {
    const order: Record<string, number> = { morning: 1, anytime: 2, evening: 3 };
    return [...tasksQuery].sort((a, b) => {
      const timeA = (a.time_of_day || a.template?.time_of_day || "anytime").toLowerCase();
      const timeB = (b.time_of_day || b.template?.time_of_day || "anytime").toLowerCase();
      return (order[timeA] || 2) - (order[timeB] || 2);
    });
  };

  const supplyTasks = sortTasksByTime(assignedTasks.filter(t => t.is_supply));
  const plannedTasks = sortTasksByTime(assignedTasks.filter(t => {
    if (t.is_supply) return false;
    const rt = (t.repeat_type || "").toLowerCase();
    return rt !== 'project' && rt !== 'daily' && rt !== 'mini';
  }));
  const miniTasks = sortTasksByTime(assignedTasks.filter(t => !t.is_supply && (t.repeat_type || "").toLowerCase() === 'mini'));
  const projectTasks = sortTasksByTime(assignedTasks.filter(t => !t.is_supply && (t.repeat_type || "").toLowerCase() === 'project' && t.status !== 'Completed'));
  // Daily Tasks omitted from Calendar view per user requirements

  const completedProjects = useMemo(() => {
    return allTasks.filter((t: any) => t.status?.toLowerCase() === 'completed' && (t.repeat_type || t.template?.repeat_type || "").toLowerCase() === 'project');
  }, [allTasks]);

  const repeatOrder: Record<string, number> = {
    weekly: 1,
    biweekly: 2,
    monthly: 3,
    project: 4,
  };

  const unassignedTasks = templates
    .filter((t: any) => !t.next_execution_date && t.repeat_type !== "daily")
    .sort((a: any, b: any) => {
      const orderA = repeatOrder[a.repeat_type?.toLowerCase()] || 99;
      const orderB = repeatOrder[b.repeat_type?.toLowerCase()] || 99;
      return orderA - orderB;
    })
    .map((t: any) => ({
      ...t,
      time: t.time_of_day || "Anytime",
      tag: (t.repeat_type || "unknown").toLowerCase()
    }));

  const scheduledTasks = templates
    .filter((t: any) => t.next_execution_date && t.repeat_type !== "daily")
    .sort((a: any, b: any) => {
      const orderA = repeatOrder[a.repeat_type?.toLowerCase()] || 99;
      const orderB = repeatOrder[b.repeat_type?.toLowerCase()] || 99;
      return orderA - orderB;
    })
    .map((t: any) => ({
      ...t,
      time: t.time_of_day || "Anytime",
      tag: (t.repeat_type || "unknown").toLowerCase()
    }));

  const taskCounts: Record<string, number> = {};
  const highlightedDays: Date[] = [];

  Object.keys(calendarTasks).forEach(key => {
    // Filter out completed projects
    const visibleTasks = calendarTasks[key].filter(t => !(t.status === 'Completed' && (t.repeat_type || "").toLowerCase() === 'project'));

    if (visibleTasks.length > 0) {
      highlightedDays.push(parseISO(key));
    }

    const nonDailyTasks = visibleTasks.filter(t => (t.repeat_type || "").toLowerCase() !== 'daily');
    if (nonDailyTasks.length > 0) {
      taskCounts[key] = nonDailyTasks.length;
    }
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>

      <div className="flex gap-6">
        {/* Calendar - 60% */}
        <div className="card-atmos flex-[3]">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (d) {
                setSelectedDate(d);
              }
            }}
            className="p-3 pointer-events-auto w-full"
            modifiers={{ hasTask: highlightedDays }}
            modifiersClassNames={{ hasTask: "font-medium text-foreground" }}
            taskCounts={taskCounts}
          />
        </div>

        {/* Schedule - 40% */}
        <div className="card-atmos flex-[2] flex flex-col max-h-[800px]">
          <h2 className="text-base font-semibold text-foreground mb-1">
            Schedule for {format(selectedDate, "EEE, MMM d")}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">{plannedTasks.length + projectTasks.length} tasks scheduled</p>

          <div className="overflow-y-auto flex-1 pr-1">
            <Accordion
              type="multiple"
              className="w-full space-y-4"
            >



              {/* Planned Tasks */}
              <AccordionItem value="planned" className="border-b-0">
                <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                  Planned Tasks ({plannedTasks.length})
                </AccordionTrigger>
                <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                  {plannedTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No scheduled tasks for this day</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {plannedTasks.map((t, i) => (
                        <TaskFormModal
                          key={i}
                          task={t}
                          trigger={
                            <div role="button" tabIndex={0} className={`flex items-center gap-3 p-3 group cursor-pointer hover:bg-muted/30 ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                              {['1', 'morning', 'смена 1'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Shift 1</Badge>
                              ) : ['2', 'evening', 'смена 2'].includes((t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase()) ? (
                                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Shift 2</Badge>
                              ) : <span className="w-14" />}
                              {t.status === 'Completed' && (
                                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                              )}
                              <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {t.name}
                              </span>
                              <OverdueBadge task={t} />
                              <TaskPhotos task={t} />
                              <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                              <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                              <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const token = localStorage.getItem('access_token');
                                  fetch(`https://api.trypranaextract.com/tasks/templates/${t.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                    body: JSON.stringify({
                                      name: t.name,
                                      description: t.description || "",
                                      repeat_type: t.repeat_type,
                                      time_of_day: t.time_of_day || "anytime",
                                      zone_id: t.zone_id,
                                      photo_required: t.photo_required,
                                      next_execution_date: null
                                    })
                                  }).then(res => {
                                    if (res.ok) {
                                      queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                      queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                                    } else {
                                      alert("Failed to unassign task");
                                    }
                                  }).catch(err => {
                                    console.error(err);
                                    alert("Failed to unassign task");
                                  });
                                }}
                                title="Remove from schedule"
                              >
                                Unassign
                              </Button>
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Supply Tasks (Service prep) */}
              {supplyTasks.length > 0 && (
                <AccordionItem value="supply" className="border-b-0 mt-4">
                  <AccordionTrigger className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                    Supply Tasks ({supplyTasks.length})
                  </AccordionTrigger>
                  <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                    <div className="divide-y divide-border">
                      {supplyTasks.map((t, i) => {
                        const targetIso = t.next_execution_date;
                        const targetLabel = targetIso ? format(new Date(targetIso), "d MMM") : "";
                        const itemsCount = Array.isArray(t.supply) ? t.supply.length : 0;
                        return (
                          <TaskFormModal
                            key={i}
                            task={t}
                            trigger={
                              <button type="button" className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] w-14 justify-center">Supply</Badge>
                                {t.status === 'Completed' && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-medium ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    Supply: {t.name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {targetLabel ? `→ задача ${targetLabel}` : "→ для основной задачи"}
                                    {itemsCount > 0 && ` · ${itemsCount} ${itemsCount === 1 ? "item" : "items"}`}
                                  </div>
                                </div>
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Service</Badge>
                                <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                              </button>
                            }
                          />
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Mini Tasks */}
              <AccordionItem value="mini" className="border-b-0 mt-4">
                <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                  Mini Tasks ({miniTasks.length})
                </AccordionTrigger>
                <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                  {miniTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No mini tasks for this day</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {miniTasks.map((t, i) => (
                        <TaskFormModal
                          key={i}
                          task={t}
                          trigger={
                            <div role="button" tabIndex={0} className={`flex items-center gap-3 p-3 group cursor-pointer hover:bg-muted/30 ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                              <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {t.name}
                              </span>
                              <OverdueBadge task={t} />
                              <TaskPhotos task={t} />
                              <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                              <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                              <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Project Tasks */}
              <AccordionItem value="project" className="border-b-0 mt-4">
                <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                  Project Tasks ({projectTasks.length})
                </AccordionTrigger>
                <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                  {projectTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No project tasks for this day</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {projectTasks.map((t, i) => (
                        <TaskFormModal
                          key={i}
                          task={t}
                          trigger={
                            <div role="button" tabIndex={0} className={`flex items-center gap-3 p-3 group cursor-pointer hover:bg-muted/30 ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
                              {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                              ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                              ) : <span className="w-14" />}
                              {t.status === 'Completed' && (
                                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                              )}
                              <span className={`text-sm font-medium flex-1 ${t.status === 'Completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {t.name}
                              </span>
                              <OverdueBadge task={t} />
                              <TaskPhotos task={t} />
                              <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                              <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                              <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const token = localStorage.getItem('access_token');
                                  fetch(`https://api.trypranaextract.com/tasks/templates/${t.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                    body: JSON.stringify({
                                      name: t.name,
                                      description: t.description || "",
                                      repeat_type: t.repeat_type,
                                      time_of_day: t.time_of_day || "anytime",
                                      zone_id: t.zone_id,
                                      photo_required: t.photo_required,
                                      next_execution_date: null
                                    })
                                  }).then(res => {
                                    if (res.ok) {
                                      queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                      queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                                    } else {
                                      alert("Failed to unassign task");
                                    }
                                  }).catch(err => {
                                    console.error(err);
                                    alert("Failed to unassign task");
                                  });
                                }}
                                title="Remove from schedule"
                              >
                                Unassign
                              </Button>
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </div>

          <Dialog onOpenChange={(open) => {
            if (!open) {
              import('react').then(R => {
                // We can just rely on state resetting on open, but for now we'll build an inline component to handle state properly in a moment, 
                // Wait, I should better make a nested component or just use local state in CalendarPage.
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full mt-4 border-primary text-primary hover:bg-primary/5">
                <Plus className="w-4 h-4 mr-2" />
                Add Custom Task for this Day
              </Button>
            </DialogTrigger>
            <DialogContent className="animate-modal-in">
              <DialogHeader>
                <DialogTitle>Add Task for {format(selectedDate, "MMM d, yyyy")}</DialogTitle>
              </DialogHeader>

              <div className="flex gap-2 p-1 bg-muted rounded-md mt-2">
                <Button
                  variant={taskCreationMode === "existing" ? "secondary" : "ghost"}
                  className="flex-1 h-8 text-sm"
                  onClick={() => setTaskCreationMode("existing")}
                >
                  Assign Existing
                </Button>
                <Button
                  variant={taskCreationMode === "new" ? "secondary" : "ghost"}
                  className="flex-1 h-8 text-sm"
                  onClick={() => setTaskCreationMode("new")}
                >
                  Create New
                </Button>
              </div>

              {taskCreationMode === "existing" ? (
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Select Unassigned Task</Label>
                    <Select value={selectedUnassignedTask} onValueChange={setSelectedUnassignedTask}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a task..." />
                      </SelectTrigger>
                      <SelectContent>
                        {unassignedTasks.map((t: any) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.name} ({t.tag})
                          </SelectItem>
                        ))}
                        {unassignedTasks.length === 0 && (
                          <SelectItem value="none" disabled>No unassigned tasks available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!selectedUnassignedTask || selectedUnassignedTask === "none"}
                    onClick={() => {
                      const taskToAssign = unassignedTasks.find((t: any) => t.id.toString() === selectedUnassignedTask);
                      if (!taskToAssign) return;

                      // Make a copy, change the date, remove mapped fields like "time", "tag"
                      const payload = {
                        name: taskToAssign.name,
                        description: taskToAssign.description || "",
                        repeat_type: taskToAssign.repeat_type,
                        time_of_day: taskToAssign.time_of_day || "anytime",
                        zone_id: taskToAssign.zone_id,
                        photo_required: taskToAssign.photo_required,
                        next_execution_date: format(selectedDate, 'yyyy-MM-dd') + "T00:00:00Z"
                      };

                      fetch(`https://api.trypranaextract.com/tasks/templates/${taskToAssign.id}`, {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                        },
                        body: JSON.stringify(payload)
                      }).then(r => {
                        if (r.ok) {
                          queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                          queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                        } else {
                          alert("Failed to assign task");
                        }
                      });
                    }}
                  >
                    Assign Task
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Task Name</Label>
                    <Input
                      placeholder="Enter task name"
                      className="mt-1"
                      id="new-task-name"
                    />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input
                      type="time"
                      className="mt-1"
                      id="new-task-time"
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select defaultValue="project" onValueChange={(v) => {
                      window.sessionStorage.setItem('new-task-cat', v);
                    }}>
                      <SelectTrigger className="mt-1" id="new-task-cat"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="routine">Routine</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox id="new-task-photo" defaultChecked={false} onCheckedChange={(c) => {
                      window.sessionStorage.setItem('new-task-photo', c ? 'true' : 'false');
                    }} />
                    <Label htmlFor="new-task-photo" className="text-sm font-normal">Requires photo proof on completion</Label>
                  </div>
                  <Button
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      const name = (document.getElementById('new-task-name') as HTMLInputElement)?.value;
                      const time = (document.getElementById('new-task-time') as HTMLInputElement)?.value;
                      const cat = window.sessionStorage.getItem('new-task-cat') || 'project';
                      const needsPhoto = window.sessionStorage.getItem('new-task-photo') === 'true';

                      if (!name) {
                        alert("Please enter a task name");
                        return;
                      }

                      const payload = {
                        name: name,
                        description: "",
                        repeat_type: 'project',
                        time_of_day: time || "anytime",
                        zone_id: 1, // Default zone
                        photo_required: needsPhoto,
                        // Ensure it stays on the selected date by passing UTC midnight
                        next_execution_date: format(selectedDate, 'yyyy-MM-dd') + "T00:00:00Z"
                      };

                      fetch("https://api.trypranaextract.com/tasks/templates/", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                        },
                        body: JSON.stringify(payload)
                      }).then(r => {
                        if (r.ok) {
                          queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                          queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                        } else {
                          alert("Failed to create task");
                        }
                      });
                    }}
                  >
                    Save Task
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Unassigned tasks via Accordions */}
      {/* Global Template Management */}
      <div className="w-full">
        {assignTpls.length > 0 && (
          <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md pt-4 pb-4 mb-6 border-b flex flex-wrap justify-end gap-3 w-full items-center shadow-sm rounded-lg px-4 border">
            <span className="text-sm text-muted-foreground mr-auto">
              <strong>{assignTpls.length}</strong> tasks selected.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={async () => {
                const token = localStorage.getItem('access_token');
                const promises = assignTpls.map(tplId => {
                  const t = templates.find((ut: any) => ut.id.toString() === tplId);
                  if (!t) return Promise.resolve();
                  return fetch(`https://api.trypranaextract.com/tasks/templates/${t.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                      name: t.name,
                      description: t.description || "",
                      repeat_type: t.repeat_type,
                      time_of_day: t.time_of_day || "anytime",
                      zone_id: t.zone_id,
                      photo_required: t.photo_required,
                      next_execution_date: null
                    })
                  });
                });
                await Promise.all(promises);
                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                setAssignTpls([]);
              }}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Unschedule Selected
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const token = localStorage.getItem('access_token');
                const promises = assignTpls.map(tplId => {
                  const t = templates.find((ut: any) => ut.id.toString() === tplId);
                  if (!t) return Promise.resolve();
                  return fetch(`https://api.trypranaextract.com/tasks/templates/${t.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                      name: t.name,
                      description: t.description || "",
                      repeat_type: t.repeat_type,
                      time_of_day: t.time_of_day || "anytime",
                      zone_id: t.zone_id,
                      photo_required: t.photo_required,
                      next_execution_date: format(selectedDate, 'yyyy-MM-dd') + "T00:00:00Z"
                    })
                  });
                });
                await Promise.all(promises);
                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
                setAssignTpls([]);
              }}
            >
              Assign Selected
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Unscheduled Tasks */}
          <div className="card-atmos">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Unscheduled Tasks</h3>
            </div>

            {unassignedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">All tasks have been scheduled.</p>
            ) : (
              <Accordion type="multiple" className="space-y-3 w-full">
                {["project", "weekly", "biweekly", "monthly"].map(tagType => {
                  const typeTasks = sortTasksByTime(unassignedTasks.filter((t: any) => t.tag === tagType));
                  if (typeTasks.length === 0) return null;

                  return (
                    <AccordionItem key={`unsched-${tagType}`} value={tagType} className="border-b-0">
                      <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-sm border hover:bg-muted/50 transition-colors">
                        <div className="flex gap-2 items-center">
                          <span className="capitalize">{tagType}</span>
                          <Badge variant="secondary" className="ml-2">{typeTasks.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="border border-t-0 rounded-b-md p-4 grid grid-cols-1 lg:grid-cols-2 gap-3 bg-card overflow-visible">
                        {typeTasks.map((t: any) => (
                          <div key={t.id}
                            onClick={() => setAssignTpls(prev => prev.includes(t.id.toString()) ? prev.filter(id => id !== t.id.toString()) : [...prev, t.id.toString()])}
                            className={`border rounded p-3 flex flex-col gap-2 group cursor-pointer transition-all relative ${assignTpls.includes(t.id.toString()) ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'border-border hover:border-primary/50'}`}>

                            <div className="flex items-start gap-3 w-full">
                              <Checkbox className="mt-0.5 pointer-events-none" checked={assignTpls.includes(t.id.toString())} />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-foreground block truncate" title={t.name}>{t.name}</span>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {['1', 'morning', 'смена 1'].includes((t.time_of_day || 'anytime').toLowerCase()) ? (
                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] whitespace-nowrap">Shift 1</Badge>
                                  ) : ['2', 'evening', 'смена 2'].includes((t.time_of_day || 'anytime').toLowerCase()) ? (
                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] whitespace-nowrap">Shift 2</Badge>
                                  ) : <Badge variant="secondary" className="text-[10px] text-muted-foreground bg-muted/30 whitespace-nowrap">Anytime</Badge>}
                                </div>
                              </div>
                            </div>

                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex bg-background/80 backdrop-blur-sm rounded-md shadow-sm border px-1" onClick={e => e.stopPropagation()}>
                              <TaskFormModal
                                task={t}
                                trigger={
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Edit Task">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>

          {/* Scheduled Tasks */}
          <div className="card-atmos">
            <div className="flex items-center gap-2 mb-4">
              <CalendarCheck className="w-4 h-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Scheduled Tasks</h3>
            </div>

            {scheduledTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks are currently scheduled globally.</p>
            ) : (
              <Accordion type="multiple" className="space-y-3 w-full">
                {["project", "weekly", "biweekly", "monthly"].map(tagType => {
                  const typeTasks = sortTasksByTime(scheduledTasks.filter((t: any) => t.tag === tagType));
                  if (typeTasks.length === 0) return null;

                  return (
                    <AccordionItem key={`sched-${tagType}`} value={tagType} className="border-b-0">
                      <AccordionTrigger className="bg-primary/5 px-4 rounded-t-md hover:no-underline font-semibold text-sm border border-primary/20 hover:bg-primary/10 transition-colors">
                        <div className="flex gap-2 items-center text-primary">
                          <span className="capitalize">{tagType}</span>
                          <Badge variant="default" className="ml-2 bg-primary/20 text-primary hover:bg-primary/30">{typeTasks.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="border border-t-0 border-primary/20 rounded-b-md p-4 grid grid-cols-1 lg:grid-cols-2 gap-3 bg-card overflow-visible">
                        {typeTasks.map((t: any) => (
                          <div key={t.id}
                            onClick={() => setAssignTpls(prev => prev.includes(t.id.toString()) ? prev.filter(id => id !== t.id.toString()) : [...prev, t.id.toString()])}
                            className={`border rounded p-3 flex flex-col gap-2 group cursor-pointer transition-all relative ${assignTpls.includes(t.id.toString()) ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'border-border hover:border-primary/50'}`}>

                            <div className="flex items-start gap-3 w-full">
                              <Checkbox className="mt-0.5 pointer-events-none" checked={assignTpls.includes(t.id.toString())} />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-foreground block truncate" title={t.name}>{t.name}</span>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {(t.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] whitespace-nowrap">Morning 🌅</Badge>
                                  ) : (t.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] whitespace-nowrap">Evening 🌙</Badge>
                                  ) : <Badge variant="secondary" className="text-[10px] text-muted-foreground bg-muted/30 whitespace-nowrap">Anytime</Badge>}

                                  {t.next_execution_date && (
                                    <div onClick={e => e.stopPropagation()}>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 whitespace-nowrap text-[10px] cursor-pointer hover:bg-primary/20 hover:ring-1 ring-primary/30 transition-all font-semibold">
                                            🗓 {format(new Date(t.next_execution_date), "MMM d")}
                                          </Badge>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                          <Calendar
                                            mode="single"
                                            selected={new Date(t.next_execution_date)}
                                            onSelect={async (date) => {
                                              if (!date) return;
                                              const token = localStorage.getItem('access_token');
                                              try {
                                                await fetch(`https://api.trypranaextract.com/tasks/templates/${t.id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                                  body: JSON.stringify({
                                                    name: t.name,
                                                    description: t.description || "",
                                                    repeat_type: t.repeat_type,
                                                    time_of_day: t.time_of_day || "anytime",
                                                    zone_id: t.zone_id,
                                                    photo_required: t.photo_required,
                                                    next_execution_date: format(date, 'yyyy-MM-dd') + "T00:00:00Z"
                                                  })
                                                });
                                                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                                queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });

                                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                              } catch (error) {
                                                console.error("Failed to update date:", error);
                                              }
                                            }}
                                            initialFocus
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex bg-background/80 backdrop-blur-sm rounded-md shadow-sm border px-1" onClick={e => e.stopPropagation()}>
                              <TaskFormModal
                                task={t}
                                trigger={
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Edit Task">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </div>

        {/* Project Pool */}
        <div className="card-atmos mt-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <h3 className="text-xl font-semibold text-foreground">Project Pool</h3>
            <Badge variant="secondary" className="ml-2 bg-success/10 text-success border-success/20">{completedProjects.length}</Badge>
          </div>

          {completedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No projects in the pool yet.</p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="done-projects" className="border border-success/20 rounded-lg bg-success/5 overflow-hidden">
                <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-success/10 transition-colors [&[data-state=open]>div>svg]:rotate-180 group font-semibold text-success">
                  <div className="flex gap-3 items-center flex-1">
                    <span>View Project Pool</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 border-t border-success/20 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 bg-card overflow-visible">
                  {completedProjects.map((t: any) => (
                    <div key={t.id} className="border border-border/60 bg-background rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:border-success/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-foreground block truncate" title={t.template?.name || t.name}>
                            {t.template?.name || t.name}
                          </span>
                          <div className="flex flex-col gap-1 mt-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] bg-muted/30 text-muted-foreground">
                                {t.template?.time_of_day || t.time_of_day || "Anytime"}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              Completed: <span className="font-medium text-foreground">{t.completed_at ? format(new Date(t.completed_at), "MMM d, yyyy 'at' h:mm a") : "Unknown"}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
