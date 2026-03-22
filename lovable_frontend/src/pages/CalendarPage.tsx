import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, addDays, addMonths, isBefore } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllTasks, fetchTaskTemplates } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Pencil, CheckCircle2 } from "lucide-react";
import TaskFormModal from "@/components/TaskFormModal";
import { UserBadge } from "@/components/UserBadge";
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

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [openAccordions, setOpenAccordions] = useState<string[]>(["planned", "project"]);
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

  // Group fetched templates and tasks by 'next_execution_date' / 'scheduled_date'
  const calendarTasks: Record<string, any[]> = {};

  // 1. Map real, generated historical/active tasks first
  allTasks.forEach((task: any) => {
    if (task.scheduled_date && task.template) {
      const parsedDate = new Date(task.scheduled_date);
      const dateKey = format(parsedDate, "yyyy-MM-dd");
      if (!calendarTasks[dateKey]) calendarTasks[dateKey] = [];

      calendarTasks[dateKey].push({
        ...task.template,
        id: task.template_id, // For TaskFormModal to edit the template rule
        task_id: task.id,
        time: task.template.time_of_day || "Anytime",
        tag: task.template.repeat_type || "unknown",
        status: task.status,
        is_real: true
      });
    }
  });

  const MAX_PROJECTION_MONTHS = 6;
  const projectionLimit = addMonths(new Date(), MAX_PROJECTION_MONTHS);

  // 2. Project templates mathematically into the future
  templates.forEach((t: any) => {
    if (t.next_execution_date && t.repeat_type !== "daily") {
      let currentDate = new Date(t.next_execution_date);

      while (isBefore(currentDate, projectionLimit)) {
        const dateKey = format(currentDate, "yyyy-MM-dd");
        if (!calendarTasks[dateKey]) calendarTasks[dateKey] = [];

        // Skip projecting this template on this date if a real task already covers it
        const hasRealTask = calendarTasks[dateKey].some(ct => ct.is_real && ct.id === t.id);

        if (!hasRealTask) {
          calendarTasks[dateKey].push({
            ...t,
            time: t.time_of_day || "Anytime",
            tag: t.repeat_type || "unknown",
            is_projected: true
          });
        }

        if (t.repeat_type === 'weekly') {
          currentDate = addDays(currentDate, 7);
        } else if (t.repeat_type === 'biweekly' || t.repeat_type === 'bi-weekly') {
          currentDate = addDays(currentDate, 14);
        } else if (t.repeat_type === 'monthly') {
          currentDate = addDays(currentDate, 28);
        } else {
          break; // Project or unknown don't repeat automatically
        }
      }
    }
  });

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

  const plannedTasks = sortTasksByTime(assignedTasks.filter(t => t.repeat_type !== 'project' && t.repeat_type?.toLowerCase() !== 'daily'));
  const projectTasks = sortTasksByTime(assignedTasks.filter(t => t.repeat_type === 'project'));
  const instantiatedDailyTasks = assignedTasks.filter(t => t.repeat_type?.toLowerCase() === 'daily');

  const baseDailyTasks = templates.filter((t: any) => t.repeat_type?.toLowerCase() === 'daily').map((t: any) => ({
    ...t,
    time: t.time_of_day || "Anytime",
    tag: t.repeat_type || "daily"
  }));

  const dailyTasks = sortTasksByTime([...instantiatedDailyTasks, ...baseDailyTasks.filter((bdt: any) => !instantiatedDailyTasks.some((idt: any) => idt.id === bdt.id))]);

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
      tag: t.repeat_type || "unknown"
    }));

  const taskCounts: Record<string, number> = {};
  Object.keys(calendarTasks).forEach(key => {
    taskCounts[key] = calendarTasks[key].length;
  });

  const highlightedDays = Object.keys(calendarTasks).map((d) => parseISO(d));

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
                const toOpen = [...openAccordions];
                if (!toOpen.includes("planned")) toOpen.push("planned");
                if (!toOpen.includes("project")) toOpen.push("project");
                setOpenAccordions(toOpen);
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
          <p className="text-xs text-muted-foreground mb-4">{plannedTasks.length + projectTasks.length + dailyTasks.length} tasks scheduled</p>

          <div className="overflow-y-auto flex-1 pr-1">
            <Accordion
              type="multiple"
              className="w-full space-y-4"
              value={openAccordions}
              onValueChange={setOpenAccordions}
            >

              {/* Daily Tasks */}
              <AccordionItem value="daily" className="border-b-0">
                <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                  Daily Tasks ({dailyTasks.length})
                </AccordionTrigger>
                <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                  {dailyTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No daily tasks</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {dailyTasks.map((t, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 group">
                          {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                          ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                          ) : <span className="w-14" />}
                          <span className="text-sm font-medium text-foreground flex-1">{t.name}</span>
                          <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                          <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                          <TaskFormModal
                            task={t}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Task">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

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
                        <div key={i} className={`flex items-center gap-3 p-3 group ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
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
                          <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                          <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                          <TaskFormModal
                            task={t}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Task">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              import('@/lib/api').then(m => m.unassignTask(t.id).then(() => {
                                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                              }))
                            }}
                            title="Remove from schedule"
                          >
                            Unassign
                          </Button>
                        </div>
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
                        <div key={i} className={`flex items-center gap-3 p-3 group ${t.status === 'Completed' ? 'opacity-70' : ''}`}>
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
                          <UserBadge userId={t.assigned_user || t.default_assigned_user} />
                          <Badge variant="secondary" className="text-xs capitalize">{t.tag}</Badge>
                          <TaskFormModal
                            task={t}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Task">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              import('@/lib/api').then(m => m.unassignTask(t.id).then(() => {
                                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                              }))
                            }}
                            title="Remove from schedule"
                          >
                            Unassign
                          </Button>
                        </div>
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
                Add Project Task for this Day
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
                        next_execution_date: new Date(format(selectedDate, 'yyyy-MM-dd') + "T00:00:00").toISOString()
                      };

                      fetch(`http://89.167.122.76:4080/tasks/templates/${taskToAssign.id}`, {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                        },
                        body: JSON.stringify(payload)
                      }).then(r => {
                        if (r.ok) {
                          queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
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
                        // Ensure local midnight
                        next_execution_date: new Date(format(selectedDate, 'yyyy-MM-dd') + "T00:00:00").toISOString()
                      };

                      fetch("http://89.167.122.76:4080/tasks/templates/", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                        },
                        body: JSON.stringify(payload)
                      }).then(r => {
                        if (r.ok) {
                          queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
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
      <div className="card-atmos">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-base font-semibold text-foreground">Unassigned Tasks</h3>
        </div>

        {unassignedTasks.length > 0 && (
          <div className="mb-4 pb-4 border-b flex justify-end gap-3 w-full items-center">
            <span className="text-sm text-muted-foreground mr-auto">
              <strong>{assignTpls.length}</strong> tasks selected.
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const token = localStorage.getItem('access_token');
                const promises = assignTpls.map(tplId => {
                  const t = unassignedTasks.find((ut: any) => ut.id.toString() === tplId);
                  if (!t) return Promise.resolve();
                  return fetch(`http://89.167.122.76:4080/tasks/templates/${t.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                      name: t.name,
                      description: t.description || "",
                      repeat_type: t.repeat_type,
                      time_of_day: t.time_of_day || "anytime",
                      zone_id: t.zone_id,
                      photo_required: t.photo_required,
                      next_execution_date: new Date(format(selectedDate, 'yyyy-MM-dd') + "T00:00:00").toISOString()
                    })
                  });
                });
                await Promise.all(promises);
                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                setAssignTpls([]);
                if (!openAccordions.includes("assigned")) {
                  setOpenAccordions([...openAccordions, "assigned"]);
                }
              }}
              disabled={assignTpls.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Assign Selected to {format(selectedDate, "MMM d")}
            </Button>
          </div>
        )}

        {unassignedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">All tasks have been scheduled.</p>
        ) : (
          <Accordion type="multiple" className="space-y-3 w-full">
            {["project", "weekly", "biweekly", "monthly"].map(tagType => {
              const typeTasks = sortTasksByTime(unassignedTasks.filter((t: any) => t.tag === tagType));
              if (typeTasks.length === 0) return null;

              return (
                <AccordionItem key={tagType} value={tagType} className="border-b-0">
                  <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-sm border hover:bg-muted/50 transition-colors">
                    <div className="flex gap-2 items-center">
                      <span className="capitalize">{tagType}</span>
                      <Badge variant="secondary" className="ml-2">{typeTasks.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="border border-t-0 rounded-b-md p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-card overflow-visible">
                    {typeTasks.map((t: any) => (
                      <div key={t.id}
                        onClick={() => setAssignTpls(prev => prev.includes(t.id.toString()) ? prev.filter(id => id !== t.id.toString()) : [...prev, t.id.toString()])}
                        className={`border rounded p-3 flex items-center gap-3 group cursor-pointer transition-all ${assignTpls.includes(t.id.toString()) ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'border-border hover:border-primary/50'}`}>
                        <Checkbox className="mt-0.5 pointer-events-none" checked={assignTpls.includes(t.id.toString())} />
                        {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                        ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                        ) : <Badge variant="secondary" className="text-[10px] w-[86px] justify-center text-muted-foreground bg-muted/30">Anytime</Badge>}
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{t.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary flex-shrink-0"
                            title="Assign to Selected Date"
                            onClick={(e) => {
                              e.stopPropagation();
                              const payload = {
                                name: t.name,
                                description: t.description || "",
                                repeat_type: t.repeat_type,
                                time_of_day: t.time_of_day || "anytime",
                                zone_id: t.zone_id,
                                photo_required: t.photo_required,
                                next_execution_date: new Date(format(selectedDate, 'yyyy-MM-dd') + "T00:00:00").toISOString()
                              };
                              fetch(`http://89.167.122.76:4080/tasks/templates/${t.id}`, {
                                method: "PUT",
                                headers: {
                                  "Content-Type": "application/json",
                                  "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                                },
                                body: JSON.stringify(payload)
                              }).then(r => {
                                if (r.ok) {
                                  queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                  if (!openAccordions.includes("assigned")) {
                                    setOpenAccordions([...openAccordions, "assigned"]);
                                  }
                                } else {
                                  alert("Failed to assign task");
                                }
                              });
                            }}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <TaskFormModal
                            task={t}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Edit Task">
                                <Pencil className="w-4 h-4" />
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

            {/* Catch-all for unknown tags */}
            {(() => {
              const otherTasks = sortTasksByTime(unassignedTasks.filter((t: any) => !["project", "weekly", "biweekly", "monthly"].includes(t.tag)));
              if (otherTasks.length === 0) return null;
              return (
                <AccordionItem value="other" className="border-b-0">
                  <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-sm border hover:bg-muted/50 transition-colors">
                    <div className="flex gap-2 items-center">
                      <span>Other</span>
                      <Badge variant="secondary" className="ml-2">{otherTasks.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="border border-t-0 rounded-b-md p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-card overflow-visible">
                    {otherTasks.map((t: any) => (
                      <div key={t.id}
                        onClick={() => setAssignTpls(prev => prev.includes(t.id.toString()) ? prev.filter(id => id !== t.id.toString()) : [...prev, t.id.toString()])}
                        className={`border rounded p-3 flex items-center gap-3 group cursor-pointer transition-all ${assignTpls.includes(t.id.toString()) ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'border-border hover:border-primary/50'}`}>
                        <Checkbox className="mt-0.5 pointer-events-none" checked={assignTpls.includes(t.id.toString())} />
                        {(t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] w-14 justify-center">Morning 🌅</Badge>
                        ) : (t.time_of_day || t.template?.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[10px] w-14 justify-center">Evening 🌙</Badge>
                        ) : <Badge variant="secondary" className="text-[10px] w-[86px] justify-center text-muted-foreground bg-muted/30">Anytime</Badge>}
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{t.name}</span>
                        <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{t.tag}</Badge>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary flex-shrink-0"
                            title="Assign to Selected Date"
                            onClick={(e) => {
                              e.stopPropagation();
                              const payload = {
                                name: t.name,
                                description: t.description || "",
                                repeat_type: t.repeat_type,
                                time_of_day: t.time_of_day || "anytime",
                                zone_id: t.zone_id,
                                photo_required: t.photo_required,
                                next_execution_date: new Date(format(selectedDate, 'yyyy-MM-dd') + "T00:00:00").toISOString()
                              };
                              fetch(`http://89.167.122.76:4080/tasks/templates/${t.id}`, {
                                method: "PUT",
                                headers: {
                                  "Content-Type": "application/json",
                                  "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                                },
                                body: JSON.stringify(payload)
                              }).then(r => {
                                if (r.ok) {
                                  queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                  if (!openAccordions.includes("assigned")) {
                                    setOpenAccordions([...openAccordions, "assigned"]);
                                  }
                                } else {
                                  alert("Failed to assign task");
                                }
                              });
                            }}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <TaskFormModal
                            task={t}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Edit Task">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })()}
          </Accordion>
        )}
      </div>
    </div>
  );
}
