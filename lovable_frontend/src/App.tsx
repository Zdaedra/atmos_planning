import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { DepartmentProvider } from "@/lib/department";
import OverviewPage from "@/pages/OverviewPage";
import CalendarPage from "@/pages/CalendarPage";
import TasksPage from "@/pages/TasksPage";
import StaffStatsPage from "@/pages/StaffStatsPage";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import AiRecommendations from "@/pages/AiRecommendations";
import AlertsSettingsPage from "@/pages/AlertsSettingsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DepartmentProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/stats" element={<StaffStatsPage />} />
            <Route path="/users" element={<Navigate to="/stats" replace />} />
            <Route path="/ai" element={<AiRecommendations />} />
            <Route path="/settings/alerts" element={<AlertsSettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </DepartmentProvider>
  </QueryClientProvider>
);

export default App;
