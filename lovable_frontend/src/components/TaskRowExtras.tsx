import { format, differenceInCalendarDays } from "date-fns";

type TaskLike = {
    status?: string;
    scheduled_date?: string | null;
    actual_completed_at?: string | null;
    photos?: Array<string | { url?: string }>;
};

function _photoUrls(photos: TaskLike["photos"]): string[] {
    if (!photos || photos.length === 0) return [];
    return photos
        .map((p) => (typeof p === "string" ? p : p?.url || ""))
        .filter(Boolean);
}

export function TaskPhotos({ task, max = 3 }: { task: TaskLike; max?: number }) {
    const urls = _photoUrls(task.photos).slice(0, max);
    if (urls.length === 0) return null;
    return (
        <div className="flex gap-1 flex-shrink-0">
            {urls.map((u, i) => (
                <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block"
                >
                    <img
                        src={u}
                        alt="proof"
                        className="h-8 w-8 object-cover rounded-md border border-border/50 hover:opacity-80"
                    />
                </a>
            ))}
        </div>
    );
}

export function OverdueBadge({ task }: { task: TaskLike }) {
    if (!task.scheduled_date) return null;
    if (task.status === "Completed") return null;

    const sched = new Date(task.scheduled_date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const schedDay = new Date(sched.getFullYear(), sched.getMonth(), sched.getDate());

    const days = differenceInCalendarDays(today, schedDay);
    if (days <= 0) return null;

    return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 whitespace-nowrap">
            Просрочено с {format(schedDay, "d MMM")} ({days} {days === 1 ? "день" : days < 5 ? "дня" : "дней"})
        </span>
    );
}
