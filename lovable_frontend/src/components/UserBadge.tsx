import { useQuery } from "@tanstack/react-query";
import { fetchSupervisors } from "@/lib/api";

interface UserBadgeProps {
    userId?: number | null;
}

export function UserBadge({ userId }: UserBadgeProps) {
    const { data: supervisors = [] } = useQuery({
        queryKey: ['supervisors'],
        queryFn: fetchSupervisors,
        staleTime: 5 * 60 * 1000 // 5 mins
    });

    if (!userId) return null;

    const user = supervisors.find((s: any) => s.id === userId);
    if (!user) return null;

    return (
        <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary w-fit flex-shrink-0"
            title={`Assigned to ${user.name}`}
        >
            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold">
                {user.name.substring(0, 2).toUpperCase()}
            </div>
            <span className="text-[10px] font-medium leading-none truncate max-w-[80px]">{user.name.split(' ')[0]}</span>
        </div>
    );
}
