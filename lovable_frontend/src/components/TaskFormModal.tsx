import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useDepartment } from "@/lib/department";
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
    const [repeatIntervalDays, setRepeatIntervalDays] = useState<string>(task?.repeat_interval_days ? String(task.repeat_interval_days) : "");
    const [timeOfDay, setTimeOfDay] = useState(task?.time_of_day?.toLowerCase() || "anytime");
    const [nextExecutionDate, setNextExecutionDate] = useState(task?.next_execution_date ? format(new Date(task.next_execution_date), 'yyyy-MM-dd') : "");
    const [photoRequired, setPhotoRequired] = useState(task?.photo_required || false);
    type SupplyRow = { name: string; qty: string };
    const normalizeSupply = (raw: any): SupplyRow[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map((r) => ({ name: r?.name || "", qty: r?.qty || "" }));
        }
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.map((r) => ({ name: r?.name || "", qty: r?.qty || "" }));
            } catch { /* ignore */ }
            // Legacy free-text — represent as a single line.
            return raw.trim() ? [{ name: raw.trim(), qty: "" }] : [];
        }
        return [];
    };
    const [supplyRows, setSupplyRows] = useState<SupplyRow[]>(normalizeSupply(task?.supply));
    const [supplyDaysBefore, setSupplyDaysBefore] = useState<string>(task?.supply_days_before != null ? String(task.supply_days_before) : "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const queryClient = useQueryClient();
    const { department } = useDepartment();
    const effectiveDept = (task?.department || department) as string;
    const isService = effectiveDept === "service";

    // Service tasks never repeat as plain "daily" — fall back to weekly automatically.
    useEffect(() => {
        if (isService && repeatType === "daily") {
            setRepeatType("weekly");
        }
    }, [isService, repeatType]);

    const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Wipe-on-focus so the default value is replaced as soon as the user types.
        e.target.select();
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            if (!task) {
                setName("");
                setDescription("");
                setRepeatType("daily");
                setRepeatIntervalDays("");
                setTimeOfDay("anytime");
                setNextExecutionDate("");
                setPhotoRequired(false);
                setSupplyRows([]);
                setSupplyDaysBefore("");
            } else {
                setName(task.name || "");
                setDescription(task.description || "");
                setRepeatType(task.repeat_type?.toLowerCase() || "daily");
                setRepeatIntervalDays(task.repeat_interval_days != null ? String(task.repeat_interval_days) : "");
                setTimeOfDay(task.time_of_day?.toLowerCase() || "anytime");
                setNextExecutionDate(task.next_execution_date ? format(new Date(task.next_execution_date), 'yyyy-MM-dd') : "");
                setPhotoRequired(task.photo_required || false);
                setSupplyRows(normalizeSupply(task.supply));
                setSupplyDaysBefore(task.supply_days_before != null ? String(task.supply_days_before) : "");
            }
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert("Name is required");
            return;
        }
        const intervalNum = parseInt((repeatIntervalDays || "").trim(), 10);
        if (repeatType === "custom" && (!intervalNum || intervalNum < 1)) {
            alert("Enter at least 1 day for the custom interval.");
            return;
        }
        const supplyDaysNum = parseInt((supplyDaysBefore || "").trim(), 10);

        setIsSubmitting(true);
        try {
            const cleanSupply = supplyRows
                .map((r) => ({ name: r.name.trim(), qty: r.qty.trim() }))
                .filter((r) => r.name);
            const payload: Record<string, unknown> = {
                name,
                description,
                repeat_type: repeatType,
                repeat_interval_days: repeatType === "custom" ? intervalNum : null,
                time_of_day: timeOfDay,
                zone_id: task?.zone_id || 1,
                photo_required: photoRequired,
                next_execution_date: nextExecutionDate ? nextExecutionDate + "T00:00:00Z" : null,
                department: task?.department || department,
                supply: isService && cleanSupply.length ? cleanSupply : null,
                supply_days_before: isService && cleanSupply.length && !Number.isNaN(supplyDaysNum) ? supplyDaysNum : null,
            };

            const url = task ? `https://api.trypranaextract.com/tasks/templates/${task.id}` : "https://api.trypranaextract.com/tasks/templates/";
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
                queryClient.invalidateQueries({ queryKey: ['adminCalendar'] });
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
            <DialogContent className="animate-modal-in max-w-lg max-h-[90vh] overflow-y-auto">
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
                                {!isService && <SelectItem value="daily">Daily</SelectItem>}
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="custom">Custom (every N days)</SelectItem>
                                <SelectItem value="mini">Mini task (one-off)</SelectItem>
                                <SelectItem value="project">Project</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {repeatType === "custom" && (
                        <div>
                            <Label>Repeat every (days)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                placeholder="e.g. 3"
                                className="mt-1"
                                value={repeatIntervalDays}
                                onFocus={selectAllOnFocus}
                                onChange={(e) => setRepeatIntervalDays(e.target.value.replace(/[^0-9]/g, ""))}
                            />
                            <p className="text-xs text-muted-foreground mt-1">e.g. 2 = every 2 days, 3 = every 3 days, etc.</p>
                        </div>
                    )}
                    <div>
                        <Label>Shift / Time of Day</Label>
                        <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Shift 1</SelectItem>
                                <SelectItem value="2">Shift 2</SelectItem>
                                <SelectItem value="anytime">Both shifts</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">"Both shifts" — supervisors of both shifts see and complete the task.</p>
                    </div>
                    <div>
                        <Label>Next Execution Date</Label>
                        <Input type="date" className="mt-1" value={nextExecutionDate} onChange={e => setNextExecutionDate(e.target.value)} />
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox id={`edit-task-photo-${task?.id || 'new'}`} checked={photoRequired} onCheckedChange={(c) => setPhotoRequired(c as boolean)} />
                        <Label htmlFor={`edit-task-photo-${task?.id || 'new'}`} className="text-sm font-normal">Requires photo proof on completion</Label>
                    </div>

                    {isService && (
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Supply (Service only)</p>

                            <div>
                                <Label className="mb-1 block">Supply list</Label>
                                <div className="space-y-2">
                                    {supplyRows.length === 0 && (
                                        <p className="text-xs text-muted-foreground">Add items — name and quantity.</p>
                                    )}
                                    {supplyRows.map((row, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Input
                                                placeholder="Name (e.g. M8 bolts)"
                                                className="flex-1 h-8 text-sm"
                                                value={row.name}
                                                onChange={(e) => {
                                                    const next = [...supplyRows];
                                                    next[i] = { ...next[i], name: e.target.value };
                                                    setSupplyRows(next);
                                                }}
                                            />
                                            <Input
                                                placeholder="Qty (4 pcs, 2 m)"
                                                className="w-32 h-8 text-sm"
                                                value={row.qty}
                                                onChange={(e) => {
                                                    const next = [...supplyRows];
                                                    next[i] = { ...next[i], qty: e.target.value };
                                                    setSupplyRows(next);
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive h-8 px-2"
                                                onClick={() => setSupplyRows(supplyRows.filter((_, j) => j !== i))}
                                                title="Remove row"
                                            >×</Button>
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 h-7"
                                    onClick={() => setSupplyRows([...supplyRows, { name: "", qty: "" }])}
                                >+ Add item</Button>
                            </div>

                            {supplyRows.some((r) => r.name.trim()) && (
                                <div>
                                    <Label>Days before the task to start supply</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={60}
                                        placeholder="e.g. 2"
                                        className="mt-1 w-24"
                                        value={supplyDaysBefore}
                                        onFocus={selectAllOnFocus}
                                        onChange={(e) => setSupplyDaysBefore(e.target.value.replace(/[^0-9]/g, ""))}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        A separate Supply task will appear in supervisors' lists N days before the task date.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Save Rule"}
                        </Button>
                        {task && (
                            <Button variant="destructive" className="flex-1" onClick={async () => {
                                if (confirm("Are you sure?")) {
                                    try {
                                        const res = await fetch(`https://api.trypranaextract.com/tasks/templates/${task.id}`, {
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
