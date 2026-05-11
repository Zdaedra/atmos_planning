import { ClipboardList, Wrench } from "lucide-react";
import { useDepartment, Department } from "@/lib/department";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Item {
    key: Department;
    label: string;
    icon: typeof Wrench;
}

const items: Item[] = [
    { key: "maintenance", label: "Maintenance", icon: ClipboardList },
    { key: "service", label: "Service", icon: Wrench },
];

export function DepartmentSwitcher() {
    const { department, setDepartment } = useDepartment();
    const qc = useQueryClient();

    const onPick = (d: Department) => {
        if (d === department) return;
        setDepartment(d);
        // Invalidate all data queries — every fetch is keyed by department.
        qc.invalidateQueries();
    };

    return (
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/50 px-4 sm:px-6 py-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-2">Department</span>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {items.map((it) => {
                    const active = department === it.key;
                    return (
                        <button
                            key={it.key}
                            type="button"
                            onClick={() => onPick(it.key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                active
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <it.icon className="w-3.5 h-3.5" />
                            {it.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
