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
import SchedulePage from "@/pages/steam/SchedulePage";
import BookingsPage from "@/pages/steam/BookingsPage";
import SteamSettingsPage from "@/pages/steam/SettingsPage";
import TodayPage from "@/pages/steam/TodayPage";
import ReceptionPage from "@/pages/steam/ReceptionPage";

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
            <Route path="/steam/reception" element={<ReceptionPage />} />
            <Route path="/steam/today" element={<TodayPage />} />
            <Route path="/steam/schedule" element={<SchedulePage />} />
            <Route path="/steam/bookings" element={<BookingsPage />} />
            {/* /steam/staff (magic-link Staff page) removed — tablet auth is now
                shared-password (Settings → Tablet passwords). Old URL bounces to
                Settings so any stale bookmarks land somewhere useful. */}
            <Route path="/steam/staff" element={<Navigate to="/steam/settings" replace />} />
            <Route path="/steam/settings" element={<SteamSettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </DepartmentProvider>
  </QueryClientProvider>
);

export default App;
