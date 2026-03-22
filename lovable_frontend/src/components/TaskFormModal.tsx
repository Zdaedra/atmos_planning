import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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

export default function TaskFormModal({ trigger, task }: { trigger: React.ReactNode, task?: any }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(task?.name || "");
    const [description, setDescription] = useState(task?.description || "");
    const [repeatType, setRepeatType] = useState(task?.repeat_type?.toLowerCase() || "daily");
    const [timeOfDay, setTimeOfDay] = useState(task?.time_of_day?.toLowerCase() || "anytime");
    const [nextExecutionDate, setNextExecutionDate] = useState(task?.next_execution_date ? format(new Date(task.next_execution_date), 'yyyy-MM-dd') : "");
    const [photoRequired, setPhotoRequired] = useState(task?.photo_required || false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const queryClient = useQueryClient();

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            if (!task) {
                setName("");
                setDescription("");
                setRepeatType("daily");
                setTimeOfDay("anytime");
                setNextExecutionDate("");
                setPhotoRequired(false);
            } else {
                setName(task.name || "");
                setDescription(task.description || "");
                setRepeatType(task.repeat_type?.toLowerCase() || "daily");
                setTimeOfDay(task.time_of_day?.toLowerCase() || "anytime");
                setNextExecutionDate(task.next_execution_date ? format(new Date(task.next_execution_date), 'yyyy-MM-dd') : "");
                setPhotoRequired(task.photo_required || false);
            }
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert("Name is required");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                name,
                description,
                repeat_type: repeatType,
                time_of_day: timeOfDay,
                zone_id: task?.zone_id || 1, // Default to 1
                photo_required: photoRequired,
                next_execution_date: nextExecutionDate ? new Date(nextExecutionDate + "T00:00:00").toISOString() : null
            };

            const url = task ? `http://89.167.122.76:4080/tasks/templates/${task.id}` : "http://89.167.122.76:4080/tasks/templates/";
            const method = task ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                setOpen(false);
            } else {
                const err = await res.json();
                alert(`Failed to save task: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("An error occurred while saving the task.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="animate-modal-in max-w-lg">
                <DialogHeader>
                    <DialogTitle>{task ? "Edit Task Rule" : "New Task Rule"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                    <div>
                        <Label>Task Name</Label>
                        <Input placeholder="e.g. Clean Main Lobby" className="mt-1" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div>
                        <Label>Description & Instructions</Label>
                        <Textarea placeholder="Detailed instructions for the task..." className="mt-1" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div>
                        <Label>Frequency</Label>
                        <Select value={repeatType} onValueChange={setRepeatType}>
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
                        <Label>Time of Day</Label>
                        <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="morning">Morning (Утро)</SelectItem>
                                <SelectItem value="evening">Evening (Вечер)</SelectItem>
                                <SelectItem value="anytime">Anytime (Любое время)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Next Execution Date</Label>
                        <Input type="date" className="mt-1" value={nextExecutionDate} onChange={e => setNextExecutionDate(e.target.value)} />
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox id={`edit-task-photo-${task?.id || 'new'}`} checked={photoRequired} onCheckedChange={(c) => setPhotoRequired(c as boolean)} />
                        <Label htmlFor={`edit-task-photo-${task?.id || 'new'}`} className="text-sm font-normal">Requires photo proof on completion</Label>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Save Rule"}
                        </Button>
                        {task && (
                            <Button variant="destructive" className="flex-1" onClick={async () => {
                                if (confirm("Are you sure?")) {
                                    try {
                                        const res = await fetch(`http://89.167.122.76:4080/tasks/templates/${task.id}`, {
                                            method: "DELETE",
                                            headers: { "Authorization": `Bearer ${localStorage.getItem('access_token')}` }
                                        });
                                        if (res.ok) {
                                            queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
                                            setOpen(false);
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }
                            }}>Delete task</Button>
                        )}
                        <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
