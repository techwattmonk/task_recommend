import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import SmartRecommender from '@/pages/SmartRecommender';
import EmployeeDirectory from '@/pages/EmployeeDirectory';
import EmployeeRegistration from '@/pages/EmployeeRegistration';
import EmployeeProfile from '@/pages/EmployeeProfile';
import EmployeeProfileEdit from '@/pages/EmployeeProfileEdit';
import PermitFilesPage from '@/pages/PermitFilesPage';
import TaskBoard from '@/pages/TaskBoard';
import TeamLeadTaskBoard from '@/pages/TeamLeadTaskBoard';
import StageTrackingDashboard from '@/pages/StageTrackingDashboard';
import UnifiedPerformanceDashboard from '@/pages/UnifiedPerformanceDashboard';
import NotFound from '@/pages/NotFound';
import NotificationPopup from '@/components/NotificationPopup';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <NotificationPopup />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/recommender" element={<SmartRecommender />} />
            <Route path="/employees" element={<EmployeeDirectory />} />
            <Route path="/employees/register" element={<EmployeeRegistration />} />
            <Route path="/employees/:id" element={<EmployeeProfile />} />
            <Route path="/employees/:id/edit" element={<EmployeeProfileEdit />} />
            <Route path="/permit-files" element={<PermitFilesPage />} />
            <Route path="/permit-files/:id" element={<PermitFilesPage />} />
            <Route path="/task-board" element={<TaskBoard />} />
            <Route path="/team-lead-board" element={<TeamLeadTaskBoard />} />
            <Route path="/stage-tracking" element={<StageTrackingDashboard />} />
            <Route path="/employee-performance" element={<UnifiedPerformanceDashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
