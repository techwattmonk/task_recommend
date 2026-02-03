import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Users, 
  FileText, 
  TrendingUp,
  Award,
  Activity
} from 'lucide-react';
import { getAutomationMetrics, getWorkflowHistory } from '@/lib/api';

interface WorkflowResult {
  workflow_id: string;
  file_id: string;
  filename: string;
  status: string;
  started_at: string;
  completed_at: string;
  stages_completed: Array<{
    stage: string;
    completed_at: string;
    employee: string;
    duration_minutes: number;
  }>;
  total_duration_minutes: number;
}

interface AutomationMetrics {
  total_workflows: number;
  completed_workflows: number;
  running_workflows: number;
  average_completion_hours: number;
  success_rate: number;
}

export default function AutomationDashboard() {
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [metricsResponse, historyResponse] = await Promise.all([
        getAutomationMetrics(),
        getWorkflowHistory()
      ]);

      setMetrics(metricsResponse.metrics);
      setWorkflows(historyResponse.workflows || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployeePerformance = (workflows: WorkflowResult[]) => {
    const employeeStats: Record<string, {
      tasksCompleted: number;
      totalDuration: number;
      avgDuration: number;
      stages: Record<string, number>;
    }> = {};

    workflows.forEach(workflow => {
      workflow.stages_completed.forEach(stage => {
        const employee = stage.employee;
        if (!employeeStats[employee]) {
          employeeStats[employee] = {
            tasksCompleted: 0,
            totalDuration: 0,
            avgDuration: 0,
            stages: {}
          };
        }
        
        employeeStats[employee].tasksCompleted += 1;
        employeeStats[employee].totalDuration += stage.duration_minutes;
        employeeStats[employee].stages[stage.stage] = 
          (employeeStats[employee].stages[stage.stage] || 0) + 1;
      });
    });

    // Calculate averages
    Object.values(employeeStats).forEach(stats => {
      stats.avgDuration = stats.totalDuration / stats.tasksCompleted;
    });

    return employeeStats;
  };

  const getStageEfficiency = (workflows: WorkflowResult[]) => {
    const stageStats: Record<string, {
      totalFiles: number;
      avgDuration: number;
      fastestTime: number;
      slowestTime: number;
    }> = {};

    workflows.forEach(workflow => {
      workflow.stages_completed.forEach(stage => {
        if (!stageStats[stage.stage]) {
          stageStats[stage.stage] = {
            totalFiles: 0,
            avgDuration: 0,
            fastestTime: Infinity,
            slowestTime: 0
          };
        }
        
        stageStats[stage.stage].totalFiles += 1;
        stageStats[stage.stage].fastestTime = Math.min(
          stageStats[stage.stage].fastestTime, 
          stage.duration_minutes
        );
        stageStats[stage.stage].slowestTime = Math.max(
          stageStats[stage.stage].slowestTime, 
          stage.duration_minutes
        );
      });
    });

    // Calculate averages
    Object.keys(stageStats).forEach(stage => {
      const totalDuration = workflows
        .flatMap(w => w.stages_completed)
        .filter(s => s.stage === stage)
        .reduce((sum, s) => sum + s.duration_minutes, 0);
      
      stageStats[stage].avgDuration = totalDuration / stageStats[stage].totalFiles;
      if (stageStats[stage].fastestTime === Infinity) {
        stageStats[stage].fastestTime = 0;
      }
    });

    return stageStats;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Activity className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const employeePerformance = getEmployeePerformance(workflows);
  const stageEfficiency = getStageEfficiency(workflows);
  const topEmployees = Object.entries(employeePerformance)
    .sort(([,a], [,b]) => b.tasksCompleted - a.tasksCompleted)
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Automation Dashboard</h1>
          <p className="text-gray-600">Real-time performance tracking and analytics</p>
        </div>
        <Button onClick={loadDashboardData}>
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workflows</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_workflows || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.running_workflows || 0} currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.success_rate.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.completed_workflows || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Completion</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.average_completion_hours.toFixed(1) || 0}h</div>
            <p className="text-xs text-muted-foreground">
              Per file processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(employeePerformance).length}</div>
            <p className="text-xs text-muted-foreground">
              Participating in automation
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Top Performers
            </CardTitle>
            <CardDescription>
              Employees with most completed tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topEmployees.map(([employee, stats], index) => (
                <div key={employee} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{employee}</p>
                      <p className="text-sm text-gray-500">
                        {stats.tasksCompleted} tasks • {stats.avgDuration.toFixed(0)}min avg
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {stats.tasksCompleted}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stage Efficiency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Stage Efficiency
            </CardTitle>
            <CardDescription>
              Average completion time per stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stageEfficiency).map(([stage, stats]) => (
                <div key={stage} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{stage}</span>
                    <span>{stats.avgDuration.toFixed(0)}min avg</span>
                  </div>
                  <Progress value={(stats.avgDuration / 60) * 100} className="h-2" />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Fastest: {stats.fastestTime}min</span>
                    <span>Slowest: {stats.slowestTime}min</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Workflows */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Workflow Activity</CardTitle>
          <CardDescription>
            Latest file processing workflows and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workflows.slice(-10).reverse().map((workflow) => (
              <div key={workflow.workflow_id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="font-medium">{workflow.filename}</h4>
                    <p className="text-sm text-gray-500">
                      {workflow.file_id} • Started {new Date(workflow.started_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={workflow.status === 'completed' ? 'default' : 'secondary'}>
                    {workflow.status}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 mt-3">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">
                    {workflow.stages_completed.length} stages completed
                  </span>
                  <span className="text-gray-400">•</span>
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">
                    {workflow.total_duration_minutes} minutes total
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {workflow.stages_completed.map((stage, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {stage.stage}: {stage.employee}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
