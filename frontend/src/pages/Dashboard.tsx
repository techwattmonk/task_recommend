import { Users, FileStack, CheckCircle, Clock, Plus, Search, BarChart3, Loader2, Calendar, UserCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { TeamLeadStats } from "@/components/dashboard/TeamLeadStats";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getEmployees, getEmployeeTasks, getPermitFiles, getRecentActivity, getCompletedToday, getTeamLeadStats, getReportingManagerOverview, getAllAssignedTasks, getStageTrackingDashboard } from "@/lib/api";

interface TeamLeadStat {
  reporting_manager_code: string;
  reporting_manager_name: string;
  employees: unknown[];
  unique_employees: number;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  assigned_tasks: number;
  completion_rate: number;
}

interface ActivityItem {
  id: string;
  type: 'task_completed' | 'task_assigned' | 'file_uploaded' | 'user_assigned' | 'status_changed';
  message: string;
  timestamp: Date;
  user?: string;
  employee_name?: string;
  task_title?: string;
  team_lead?: string;
}

interface ActivityData {
  activity_id: string;
  activity_type: string;
  description: string;
  activity_time: string;
  employee_name?: string;
  task_title?: string;
  team_lead?: string;
}

export default function Dashboard() {
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [permitFilesCount, setPermitFilesCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [teamLeadStats, setTeamLeadStats] = useState<TeamLeadStat[]>([]);
  const [slaBreachesCount, setSlaBreachesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only run on mount
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load real-time data from stage tracking dashboard
      try {
        const dashboardData = await getStageTrackingDashboard();
        if (dashboardData.success) {
          const { summary, sla_breaches } = dashboardData.data;
          
          // Update counts from backend
          setActiveTasksCount(summary.active_files || 0);
          setSlaBreachesCount(summary.breaches_count || 0);
          setCompletedTodayCount(summary.delivered_today_count || 0);
          
          console.log('[Dashboard] Loaded real-time data from backend:', summary);
        }
      } catch (error) {
        console.log('[Dashboard] Stage tracking not available, using fallback APIs');
        // Fallback to existing APIs
        await Promise.all([
          loadActiveTasksCount(),
          loadPermitFilesCount(),
          loadCompletedToday(),
          loadRecentActivities(),
          loadTeamLeadStats()
        ]);
      }
      
      // Always load team lead stats separately
      await loadTeamLeadStats();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadActiveTasksCount = async () => {
    try {
      // Use single API call like Task Board
      const data = await getAllAssignedTasks();
      const tasksArray = Array.isArray(data) ? data : (data?.tasks || []);
      
      // Count only active tasks (exclude COMPLETED) like Task Board
      const activeTasks = tasksArray.filter(task => task.status !== 'COMPLETED').length;
      
      setActiveTasksCount(activeTasks);
      console.log('[Dashboard] Active tasks count:', activeTasks, '(excluding COMPLETED)');
    } catch (error) {
      console.error('Error loading active tasks:', error);
    }
  };

  const loadPermitFilesCount = async () => {
    try {
      const files = await getPermitFiles();
      setPermitFilesCount(files.length);
    } catch (error) {
      console.error('Error loading permit files:', error);
    }
  };

  const loadRecentActivities = async () => {
    try {
      const activityData = await getRecentActivity();
      const activitiesArray = Array.isArray(activityData) ? activityData : (Array.isArray((activityData as { activities?: unknown[] })?.activities) ? (activityData as { activities: unknown[] }).activities : []);
      const activities: ActivityItem[] = activitiesArray.map((activity: unknown) => {
        const a = activity as ActivityData;
        return {
        id: a.activity_id,
        type: a.activity_type === 'completed' ? 'task_completed' : 'task_assigned',
        message: a.description,
        timestamp: new Date(a.activity_time),
        user: a.employee_name,
        employee_name: a.employee_name,
        task_title: a.task_title,
        team_lead: a.team_lead
      };
      });
      setRecentActivities(activities);
    } catch (error) {
      console.error('Error loading recent activities:', error);
      setRecentActivities([]);
    }
  };

  const loadCompletedToday = async () => {
    try {
      const completedData = await getCompletedToday();
      if (Array.isArray(completedData)) {
        setCompletedTodayCount(completedData.length);
      } else {
        setCompletedTodayCount((completedData as { total_completed?: number })?.total_completed ?? 0);
      }
    } catch (error) {
      console.error('Error loading completed today:', error);
    }
  };

  const loadTeamLeadStats = async () => {
    try {
      try {
        const statsData = await getReportingManagerOverview(7, 5);
        setTeamLeadStats((statsData as { team_stats?: TeamLeadStat[] }).team_stats || []);
        return;
      } catch (e) {
        const legacy = await getTeamLeadStats();
        const mapped = ((legacy as { team_stats?: unknown[] }).team_stats || []).map((t: unknown) => {
          const team = t as { team_lead_code?: string; team_lead_name?: string; employees?: unknown[]; unique_employees?: number; total_tasks?: number; completed_tasks?: number; in_progress_tasks?: number; assigned_tasks?: number; completion_rate?: number };
          return {
          reporting_manager_code: team.team_lead_code,
          reporting_manager_name: team.team_lead_name,
          employees: team.employees || [],
          unique_employees: team.unique_employees,
          total_tasks: team.total_tasks,
          completed_tasks: team.completed_tasks,
          in_progress_tasks: team.in_progress_tasks,
          assigned_tasks: team.assigned_tasks,
          completion_rate: team.completion_rate,
        };
        });
        setTeamLeadStats(mapped);
      }
    } catch (error) {
      console.error('Error loading team lead stats:', error);
      setTeamLeadStats([]);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your task assignment system
          </p>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link to="/employees">
          <StatCard 
            title="Total Employees"
            value={78}
            icon={Users}
            trend={{ value: 5, isPositive: true }}
          />
        </Link>
        <StatCard 
          title="Active Tasks"
          value={isLoading ? "..." : activeTasksCount}
          icon={Clock}
          trend={{ value: activeTasksCount, isPositive: true }}
        />
        <StatCard 
          title="Completed Today"
          value={isLoading ? "..." : completedTodayCount}
          icon={UserCheck}
          trend={completedTodayCount > 0 ? { value: 12, isPositive: true } : undefined}
        />
        <Link to="/stage-tracking">
          <StatCard 
            title="SLA Breaches"
            value={isLoading ? "..." : slaBreachesCount}
            icon={AlertTriangle}
            trend={slaBreachesCount > 0 ? { value: slaBreachesCount, isPositive: false } : { value: 0, isPositive: true }}
          />
        </Link>
        <Link to="/permit-files">
          <StatCard 
            title="Permit Files"
            value={permitFilesCount}
            icon={FileStack}
            trend={{ value: 0, isPositive: false }}
          />
        </Link>
      </div>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/recommender" className="group">
          <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Search className="h-6 w-6 text-primary-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">AI Task Recommender</h3>
            <p className="text-sm text-muted-foreground">
              Find the best employee for any task using AI-powered matching
            </p>
          </div>
        </Link>
        
        <Link to="/employees" className="group">
          <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6 text-success" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Employee Directory</h3>
            <p className="text-sm text-muted-foreground">
              Browse all employees, their skills, and availability
            </p>
          </div>
        </Link>
        
        <Link to="/permit-files" className="group">
          <div className="p-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart3 className="h-6 w-6 text-warning" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Workflow Reports</h3>
            <p className="text-sm text-muted-foreground">
              Track permit files through PRELIMS → PRODUCTION → QC
            </p>
          </div>
        </Link>
      </div>
      
      {/* Team Lead Statistics */}
      <TeamLeadStats data={teamLeadStats as import('@/components/dashboard/TeamLeadStats').ReportingManagerStats[]} />
        
      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  );
}
