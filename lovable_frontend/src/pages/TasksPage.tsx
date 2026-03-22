import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTaskTemplates } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Search, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import TaskFormModal from "@/components/TaskFormModal";
import { UserBadge } from "@/components/UserBadge";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

function categoryColor(cat: string) {
  switch (cat) {
    case "Daily": return "bg-success/10 text-success";
    case "Weekly": return "bg-info/10 text-info";
    case "Monthly": return "bg-primary/10 text-primary";
    case "Bi-weekly": return "bg-primary/10 text-primary";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: fetchTaskTemplates
  });

  const filtered = templates.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const dailyTasks = filtered.filter((t: any) => t.repeat_type?.toLowerCase() === 'daily');
  const weeklyTasks = filtered.filter((t: any) => t.repeat_type?.toLowerCase() === 'weekly');
  const biWeeklyTasks = filtered.filter((t: any) => t.repeat_type?.toLowerCase() === 'biweekly' || t.repeat_type?.toLowerCase() === 'bi-weekly');
  const monthlyTasks = filtered.filter((t: any) => t.repeat_type?.toLowerCase() === 'monthly');
  const projectTasks = filtered.filter((t: any) => t.repeat_type?.toLowerCase() === 'project');

  const assignedTypes = ['daily', 'weekly', 'biweekly', 'bi-weekly', 'monthly', 'project'];
  const notAssignedTasks = filtered.filter((t: any) => !t.repeat_type || !assignedTypes.includes(t.repeat_type.toLowerCase()));

  const handleClearDate = async (taskId: number) => {
    try {
      const { unassignTask } = await import('@/lib/api');
      await unassignTask(taskId);
      queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
    } catch (e) {
      console.error(e);
    }
  };

  const renderTable = (tasksToRender: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>Task</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Time Constraint</TableHead>
          <TableHead className="w-20">Edit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasksToRender.length === 0 ? (
          <TableRow><TableCell colSpan={5} className="text-center py-8">No tasks found</TableCell></TableRow>
        ) : (
          tasksToRender.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell><Checkbox /></TableCell>
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <div className="hover-card">{t.name}</div>
                  <UserBadge userId={t.default_assigned_user} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge className={categoryColor(t.repeat_type)} variant="secondary">
                    {t.repeat_type}
                  </Badge>
                  {t.next_execution_date && t.repeat_type !== "daily" && (
                    <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/30">
                      {t.next_execution_date.split('T')[0]}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {(t.time_of_day || 'anytime').toLowerCase() === 'morning' ? (
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">Morning 🌅</Badge>
                ) : (t.time_of_day || 'anytime').toLowerCase() === 'evening' ? (
                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">Evening 🌙</Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground bg-muted/30">Anytime</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TaskFormModal
                    task={t}
                    trigger={
                      <Button variant="ghost" size="sm" title="Edit Task">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    }
                  />
                  {t.next_execution_date && t.repeat_type !== "daily" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Clear assigned date"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleClearDate(t.id)}
                    >
                      <span className="text-xs font-semibold">Clear</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
        <div className="flex gap-3">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Import via CSV/AI
          </Button>
          <TaskFormModal
            trigger={
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            }
          />
        </div>
      </div>

      <div className="card-atmos">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading templates...</div>
        ) : (
          <Accordion type="multiple" className="w-full space-y-4">
            <AccordionItem value="daily" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Daily ({dailyTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(dailyTasks)}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="weekly" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Weekly ({weeklyTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(weeklyTasks)}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="biweekly" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Bi-Weekly ({biWeeklyTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(biWeeklyTasks)}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="monthly" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Monthly ({monthlyTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(monthlyTasks)}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="project" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Project ({projectTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(projectTasks)}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="notassigned" className="border-b-0">
              <AccordionTrigger className="bg-muted/30 px-4 rounded-t-md hover:no-underline font-semibold text-lg border">
                Not Assigned ({notAssignedTasks.length})
              </AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-0 overflow-visible">
                {renderTable(notAssignedTasks)}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
}
