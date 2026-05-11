import { Navigate, Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { DepartmentSwitcher } from "./DepartmentSwitcher";
import { getAuthToken, fetchMe, startShift } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function AppLayout() {
  const token = getAuthToken();
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!token,
  });

  const startShiftMutation = useMutation({
    mutationFn: startShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const needsShiftStart = !!(
    me &&
    me.role !== 'admin' &&
    me.role !== 'system_admin' &&
    (!me.last_login || !isToday(new Date(me.last_login)))
  );

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-0 md:ml-[260px] min-h-screen">
        <DepartmentSwitcher />
        <Outlet />
      </main>

      {/* Admin or debug bypass feedback hidden visually but present in DOM if needed */}
      <span id="shift-debug-state" className="hidden" data-needs-shift={needsShiftStart} data-last-login={me?.last_login || 'none'} />

      {/* Shift Checker Overlay (Bulletproof DOM rendering) */}
      {needsShiftStart && !isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md p-8 rounded-xl shadow-2xl border border-border flex flex-col items-center animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold mb-2">Start Your Shift</h2>
            <p className="text-center text-muted-foreground mb-8">
              Welcome back, <span className="font-semibold text-foreground">{me?.name}</span>! Please confirm you are starting your shift for today to unlock the system.
            </p>
            <Button
              size="lg"
              className="w-full sm:w-auto px-8 gap-2"
              onClick={() => startShiftMutation.mutate()}
              disabled={startShiftMutation.isPending}
            >
              <LogIn className="w-5 h-5" />
              {startShiftMutation.isPending ? "Starting..." : "Start Shift"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
