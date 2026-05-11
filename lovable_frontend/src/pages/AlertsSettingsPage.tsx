import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Save, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AlertGroup {
    repeat_type: string;
    default: number;
    override: number | null;
    effective: number;
    template_count: number;
}

interface SettingsResponse {
    groups: AlertGroup[];
}

async function fetchSettings(): Promise<SettingsResponse> {
    const token = localStorage.getItem("access_token");
    const res = await fetch("https://api.trypranaextract.com/ai/alerts/settings", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load");
    return res.json();
}

async function saveGroup(repeat_type: string, days: number | null) {
    const token = localStorage.getItem("access_token");
    const qs = days === null ? "" : `?overdue_alert_days=${days}`;
    const res = await fetch(`https://api.trypranaextract.com/ai/alerts/settings/${repeat_type}${qs}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json())?.detail || "Save failed");
    return res.json();
}

const GROUP_LABEL: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
    custom: "Custom (every N days)",
    project: "Project",
};

function GroupCard({ g }: { g: AlertGroup }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<string>(g.effective.toString());

    useEffect(() => {
        setDraft(g.effective.toString());
    }, [g.effective]);

    const mutation = useMutation({
        mutationFn: (vars: { rt: string; days: number | null }) => saveGroup(vars.rt, vars.days),
        onSuccess: () => {
            toast.success(`${GROUP_LABEL[g.repeat_type] || g.repeat_type} saved`);
            queryClient.invalidateQueries({ queryKey: ["alertSettings"] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const onSave = () => {
        const trimmed = draft.trim();
        if (!trimmed) {
            mutation.mutate({ rt: g.repeat_type, days: null });
            return;
        }
        const n = parseInt(trimmed, 10);
        if (Number.isNaN(n) || n < 0) {
            toast.error("Введите положительное число дней.");
            return;
        }
        mutation.mutate({ rt: g.repeat_type, days: n });
    };

    const onReset = () => mutation.mutate({ rt: g.repeat_type, days: null });

    const isCustom = g.override !== null;

    return (
        <div className="card-atmos">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="text-lg font-semibold capitalize">{GROUP_LABEL[g.repeat_type] || g.repeat_type}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {g.template_count} task{g.template_count === 1 ? "" : "s"} in this group
                    </p>
                </div>
                {isCustom ? (
                    <Badge variant="default" className="text-[10px]">Custom</Badge>
                ) : (
                    <Badge variant="secondary" className="text-[10px]">Default</Badge>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    min={0}
                    placeholder={String(g.default)}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-24 h-9 text-sm"
                />
                <span className="text-sm text-muted-foreground">дней просрочки</span>
            </div>

            <div className="flex items-center gap-2 mt-3">
                <Button
                    size="sm"
                    onClick={onSave}
                    disabled={mutation.isPending || draft === g.effective.toString()}
                >
                    <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
                {isCustom && (
                    <Button size="sm" variant="ghost" onClick={onReset} disabled={mutation.isPending}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                    </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                    Default: {g.default}d
                </span>
            </div>
        </div>
    );
}

export default function AlertsSettingsPage() {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["alertSettings"],
        queryFn: fetchSettings,
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                        <Bell className="w-6 h-6 text-primary" /> AI Alerts Settings
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Сколько дней просрочки требуется, чтобы задача из группы попала в AI-фид.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["alertSettings"] })}
                >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
            </div>

            {isLoading ? (
                <div className="card-atmos text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(data?.groups || []).map((g) => (
                        <GroupCard key={g.repeat_type} g={g} />
                    ))}
                </div>
            )}
        </div>
    );
}
