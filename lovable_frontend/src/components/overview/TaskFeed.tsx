import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDashboardData, markTaskComplete, revertTask } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderKanban,
  Edit3,
  RotateCcw,
  Image as ImageIcon,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { UserBadge } from "@/components/UserBadge";

interface Task {
  id: string;
  name: string;
  timeOfDay?: string;
  dueTime?: string;
  frequency?: string;
  done: boolean;
  photo?: string;
  photoUploadedBy?: number;
  photoCreatedAt?: string;
  comment?: string;
  description?: string;
  repeatType?: string;
  nextExecution?: string;
  zoneId?: number;
  photoRequired?: boolean;
  assignedUser?: number;
}

import { Progress } from "@/components/ui/progress";

type Tab = "today" | "completed" | "rates" | "staff";

export function TaskFeed({ filter }: { filter?: string | null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData
  });

  const completeMutation = useMutation({
    mutationFn: markTaskComplete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success("Task completed!");
    },
  });

  const revertMutation = useMutation({
    mutationFn: revertTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success("Task returned to queue");
    },
  });

  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    if (filter === "Completed") {
      setTab("completed");
    } else if (filter === "Completion Rate") {
      setTab("rates");
    } else if (filter === "Staff On Shift") {
      setTab("staff");
    } else if (filter) {
      setTab("today");
    }
  }, [filter]);

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editFreq, setEditFreq] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNext, setEditNext] = useState("");

  const [viewTask, setViewTask] = useState<Task | null>(null);

  const [redoTask, setRedoTask] = useState<Task | null>(null);
  const [redoComment, setRedoComment] = useState("");

  const [completeComment, setCompleteComment] = useState("");
  const [completePhotoBase64, setCompletePhotoBase64] = useState("");
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  const formatTask = (t: any) => ({
    id: t.id.toString(),
    name: t.template?.name || `Task #${t.id}`,
    timeOfDay: t.template?.time_of_day || "Anytime",
    done: t.status === "Completed",
    comment: t.comments?.[0]?.text, // Assumes backend dashboard endpoint injects recent comment if any
    photo: t.photos?.[0]?.url,
    photoUploadedBy: t.photos?.[0]?.uploaded_by,
    photoCreatedAt: t.photos?.[0]?.created_at,
    description: t.template?.description,
    repeatType: t.template?.repeat_type,
    nextExecution: t.template?.next_execution_date,
    zoneId: t.zone_id,
    photoRequired: t.template?.photo_required,
    assignedUser: t.assigned_user || t.template?.default_assigned_user,
  });

  const activeShifts = data?.active_shifts || [];

  function getSupervisorName(userId?: number) {
    if (!userId) return "Unknown";
    const shift = activeShifts.find((s: any) => s.user_id === userId);
    return shift?.user_name || `User ID: ${userId}`;
  }

  const overdueTasksRaw = (data?.overdue_tasks_list || []).map((t: any) => ({
    ...formatTask(t),
    dueTime: "Overdue"
  }));

  const allTodayRaw = data?.today_tasks || [];
  const dailyTasksRaw = allTodayRaw.filter((t: any) => t.template?.repeat_type === "daily").map(formatTask);
  const longTermTasksRaw = allTodayRaw.filter((t: any) => ["weekly", "bi-weekly", "biweekly", "monthly"].includes(t.template?.repeat_type)).map(formatTask);
  const projectTasksRaw = allTodayRaw.filter((t: any) => t.template?.repeat_type === "project").map(formatTask);

  const tasksRaw = [
    ...overdueTasksRaw.map((t: any) => ({ ...t, timeOfDay: undefined })),
    ...dailyTasksRaw,
    ...longTermTasksRaw,
    ...projectTasksRaw,
  ];

  let todayTasks = tasksRaw.filter((t: any) => !t.done);

  if (filter === "Carry-over Load") {
    todayTasks = todayTasks.filter((t: any) => overdueTasksRaw.some((o: any) => o.id === t.id));
  } else if (filter === "Completed") {
    // If completed is selected, todayTasks doesn't matter much since tab is set to completed, but let's be safe.
  }

  const completedTasks = allTodayRaw.filter((t: any) => t.status === "Completed" || t.done).map(formatTask) as Task[];

  const overdue = todayTasks.filter((t: any) =>
    overdueTasksRaw.some((o: any) => o.id === t.id)
  );
  const daily = todayTasks.filter((t: any) =>
    dailyTasksRaw.some((d: any) => d.id === t.id)
  );
  const longTerm = todayTasks.filter((t: any) =>
    longTermTasksRaw.some((l: any) => l.id === t.id)
  );
  const project = todayTasks.filter((t: any) =>
    projectTasksRaw.some((p: any) => p.id === t.id)
  );

  function handleComplete(task: Task) {
    setCompletingTask(task);
    setCompleteComment("");
    setCompletePhotoBase64("");
  }

  function confirmComplete() {
    if (!completingTask) return;
    completeMutation.mutate({
      task_id: parseInt(completingTask.id),
      comments: completeComment,
      photo_data_base64: completePhotoBase64 || undefined
    });
    setCompletingTask(null);
  }

  function handleEdit(task: Task) {
    setEditTask(task);
    setEditName(task.name);
    setEditDesc(task.description || "");
    setEditFreq(task.repeatType || "daily");
    setEditTime(task.timeOfDay || "anytime");
    setEditNext(task.nextExecution ? task.nextExecution.split('T')[0] : "");
  }

  function saveEdit() {
    if (!editTask) return;
    // API logic to edit name unimplemented for MVP
    setEditTask(null);
  }

  function handleRedo(task: Task) {
    setRedoTask(task);
    setRedoComment("");
  }

  function confirmRedo() {
    if (!redoTask) return;
    revertMutation.mutate({ task_id: parseInt(redoTask.id), comments: redoComment });
    setRedoTask(null);
    setViewTask(null);
  }

  function TaskRow({ task }: { task: Task }) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 border-b border-border last:border-b-0 group">
        <Checkbox
          checked={task.done}
          onCheckedChange={() => !task.done && handleComplete(task)}
        />
        <span
          className={`flex-1 text-sm font-medium cursor-pointer hover:text-primary transition-colors ${task.done
            ? "line-through text-muted-foreground"
            : "text-foreground"
            }`}
          onClick={() => handleEdit(task)}
        >
          {task.name}
        </span>
        <UserBadge userId={task.assignedUser} />
        {task.timeOfDay && (
          <span className="text-xs text-muted-foreground">{task.timeOfDay}</span>
        )}
        {task.dueTime && (
          <span className="text-xs text-destructive font-medium">
            {task.dueTime}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => handleEdit(task)}
        >
          <Edit3 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  function CompletedRow({ task }: { task: Task }) {
    const formattedTime = task.photoCreatedAt
      ? new Date(task.photoCreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : "";
    const supervisorName = task.photoUploadedBy ? getSupervisorName(task.photoUploadedBy) : "";

    return (
      <div
        className="flex items-center gap-3 py-3 px-4 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setViewTask(task)}
      >
        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground line-through truncate">
            {task.name}
          </p>
          {(formattedTime || supervisorName) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formattedTime} {supervisorName ? `• ${supervisorName}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {task.comment && (
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          {task.photo && (
            <div className="w-6 h-6 rounded overflow-hidden border border-border">
              <img src={task.photo} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="card-atmos p-8 text-center text-muted-foreground">Loading tasks...</div>;

  return (
    <div className="card-atmos">
      {/* Today Tab */}
      {tab === "today" && (
        <Accordion type="multiple" defaultValue={[]} className="space-y-3">
          {overdue.length > 0 && (
            <AccordionItem value="overdue" className="border-0">
              <div className="status-overdue rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-semibold text-destructive">
                      Overdue Carry-over
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {overdue.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {overdue.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </AccordionContent>
              </div>
            </AccordionItem>
          )}

          {daily.length > 0 && (
            <AccordionItem value="daily" className="border-0">
              <div className="status-daily rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-sm font-semibold text-foreground">
                      Daily Tasks
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {daily.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {daily.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </AccordionContent>
              </div>
            </AccordionItem>
          )}

          {longTerm.length > 0 && (
            <AccordionItem value="longterm" className="border-0">
              <div className="status-longterm rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-info" />
                    <span className="text-sm font-semibold text-foreground">
                      Long Term
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {longTerm.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {longTerm.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </AccordionContent>
              </div>
            </AccordionItem>
          )}

          {project.length > 0 && (
            <AccordionItem value="project" className="border-0">
              <div className="status-project rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-success" />
                    <span className="text-sm font-semibold text-foreground">
                      Project Tasks
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {project.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {project.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </AccordionContent>
              </div>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* Completion Rates Tab */}
      {tab === "rates" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Completion by Category</h3>
          </div>
          <div className="space-y-6 bg-card rounded-xl border border-border p-6">
            {(() => {
              const calculateRate = (pool: any[]) => {
                if (pool.length === 0) return 0;
                const completed = pool.filter(t => t.status === "Completed").length;
                return Math.round((completed / pool.length) * 100);
              };

              const dailyPool = allTodayRaw.filter((t: any) => t.template?.repeat_type === "daily");
              const weeklyPool = allTodayRaw.filter((t: any) => ["weekly", "bi-weekly", "biweekly", "monthly"].includes(t.template?.repeat_type));
              const projectPool = allTodayRaw.filter((t: any) => t.template?.repeat_type === "project");

              const subRates = [
                { label: "Daily Tasks", rate: calculateRate(dailyPool), count: dailyPool.length, completed: dailyPool.filter(t => t.status === "Completed").length, color: "bg-success" },
                { label: "Long-term (Weekly/Monthly)", rate: calculateRate(weeklyPool), count: weeklyPool.length, completed: weeklyPool.filter(t => t.status === "Completed").length, color: "bg-info" },
                { label: "Project Tasks", rate: calculateRate(projectPool), count: projectPool.length, completed: projectPool.filter(t => t.status === "Completed").length, color: "bg-primary" }
              ].filter(r => r.count > 0);

              if (subRates.length === 0) {
                return <p className="text-sm text-muted-foreground text-center">No tasks available for percentage breakdown.</p>;
              }

              return subRates.map((sub, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-foreground">{sub.label}</span>
                    <span className="text-muted-foreground">{sub.completed} / {sub.count} ({sub.rate}%)</span>
                  </div>
                  <Progress value={sub.rate} className="h-2" indicatorClassName={sub.color} />
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Completed Tab */}
      {tab === "completed" && (
        <div className="rounded-lg border border-border overflow-hidden">
          {completedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No completed tasks yet
            </p>
          ) : (
            completedTasks.map((t) => <CompletedRow key={t.id} task={t} />)
          )}
        </div>
      )}

      {/* Staff Tab */}
      {tab === "staff" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Active Staff Today
            </h3>
            <span className="text-sm text-muted-foreground">{data?.active_staff_list?.length || 0} online</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(!data?.active_staff_list || data.active_staff_list.length === 0) ? (
              <p className="text-sm text-muted-foreground">No staff members have logged in today.</p>
            ) : (
              data.active_staff_list.map((staff: any) => (
                <div key={staff.id} className="card-atmos p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-base">{staff.user_name}</span>
                    <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {staff.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <Clock className="w-4 h-4" />
                    <span>Last Login: </span>
                    <span className="font-medium text-foreground">
                      {staff.last_login ? new Date(staff.last_login).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Assigned</p>
                      <p className="font-semibold text-lg">{staff.tasks_assigned_today}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Completed</p>
                      <p className="font-semibold text-lg text-success">{staff.tasks_completed_today}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent className="animate-modal-in max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Task Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Clean Main Lobby" className="mt-1" />
            </div>
            <div>
              <Label>Description & Instructions</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Detailed instructions for the task..." className="mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequency</Label>
                <Select value={editFreq} onValueChange={setEditFreq}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Shift / Time of Day</Label>
                <Select value={editTime} onValueChange={setEditTime}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Shift 1</SelectItem>
                    <SelectItem value="2">Shift 2</SelectItem>
                    <SelectItem value="anytime">Anytime (Daily only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Next Execution Date</Label>
              <Input type="date" value={editNext} onChange={(e) => setEditNext(e.target.value)} className="mt-1" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditTask(null)}>Cancel</Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Task Dialog */}
      <Dialog open={!!completingTask} onOpenChange={() => setCompletingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              Mark "{completingTask?.name}" as completed. Add an optional comment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {completingTask?.photoRequired && (
              <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-2">
                <Label className="font-semibold text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Photo Required
                </Label>
                <p className="text-xs text-muted-foreground">This task requires a photo to be completed.</p>
                <div className="pt-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setCompletePhotoBase64(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      } else {
                        setCompletePhotoBase64("");
                      }
                    }}
                  />
                </div>
              </div>
            )}
            <Textarea
              value={completeComment}
              onChange={(e) => setCompleteComment(e.target.value)}
              placeholder="Add a comment (optional)..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletingTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmComplete}
              disabled={completingTask?.photoRequired ? !completePhotoBase64 : false}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Completed Task Dialog */}
      <Dialog open={!!viewTask} onOpenChange={() => setViewTask(null)}>
        <DialogContent className="animate-modal-in max-w-lg">
          <DialogHeader>
            <DialogTitle>Completed Task Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-muted-foreground">Task Name</Label>
              <p className="text-sm font-medium">{viewTask?.name}</p>
            </div>
            {viewTask?.description && (
              <div>
                <Label className="text-muted-foreground">Description & Instructions</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{viewTask.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Frequency</Label>
                <p className="text-sm capitalize mt-1">{viewTask?.repeatType || "Daily"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Time of Day</Label>
                <p className="text-sm capitalize mt-1">{viewTask?.timeOfDay || "Anytime"}</p>
              </div>
            </div>

            {(viewTask?.comment || viewTask?.photo) && (
              <div className="pt-4 border-t border-border space-y-4">
                <h4 className="text-sm font-semibold">Completion Report</h4>
                {viewTask?.comment && (
                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Comment</p>
                    <p className="text-sm text-foreground">{viewTask.comment}</p>
                  </div>
                )}
                {viewTask?.photo && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Photo</p>
                    <img
                      src={viewTask.photo}
                      alt="Proof"
                      className="rounded-lg w-full"
                    />
                  </div>
                )}
              </div>
            )}

            {!viewTask?.comment && !viewTask?.photo && (
              <p className="text-sm text-muted-foreground text-center py-4 border-t border-border mt-4">
                No comments or photos attached.
              </p>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between w-full mt-2">
            <Button
              variant="ghost"
              onClick={() => setViewTask(null)}
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (viewTask) {
                  setViewTask(null);
                  handleRedo(viewTask);
                }
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Send to Redo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redo Task Dialog */}
      <Dialog open={!!redoTask} onOpenChange={() => setRedoTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back to Tasks</DialogTitle>
            <DialogDescription>
              Send "{redoTask?.name}" back with an optional comment.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={redoComment}
            onChange={(e) => setRedoComment(e.target.value)}
            placeholder="Why does this need to be redone?..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedoTask(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRedo}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Send to Redo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
