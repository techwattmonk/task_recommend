import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, CheckCircle, Clock, BarChart3 } from "lucide-react";

export interface ReportingManagerStats {
  reporting_manager_code: string;
  reporting_manager_name: string;
  employees: Array<{
    employee_code: string;
    employee_name: string;
    employee_role: string;
    task_count: number;
    completed_tasks?: number;
    in_progress_tasks?: number;
    avg_duration_minutes?: number;
    tasks: Array<{
      task_id: string;
      task_title: string;
      status: string;
      assigned_at: string;
      completed_at: string | null;
    }>;
  }>;
  unique_employees: number;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  assigned_tasks: number;
  completion_rate: number;
  avg_duration_minutes?: number;
  p95_duration_minutes?: number;
  breaches_count?: number;
}

interface ReportingManagerStatsProps {
  data: ReportingManagerStats[];
}

export function TeamLeadStats({ data }: ReportingManagerStatsProps) {
  // Filter out empty teams
  const validTeams = data.filter(team => 
    team.reporting_manager_name && 
    team.reporting_manager_name.trim() !== "" && 
    team.total_tasks > 0
  );

  if (validTeams.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Reporting Manager Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No reporting manager assignments found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Reporting Manager Statistics</h2>
      </div>
      
      <div className="grid gap-6">
        {validTeams.map((team) => (
          <Card key={team.reporting_manager_code} className="overflow-hidden">
            <CardHeader className="bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{team.reporting_manager_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Reporting Manager Code: {team.reporting_manager_code}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <Users className="h-3 w-3 mr-1" />
                    {team.unique_employees} members
                  </Badge>
                  {typeof team.breaches_count === 'number' && (
                    <Badge variant="secondary" className="bg-red-100 text-red-800">
                      {team.breaches_count} breaches
                    </Badge>
                  )}
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {team.completion_rate.toFixed(1)}% complete
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{team.total_tasks}</div>
                  <p className="text-xs text-muted-foreground">Total Tasks</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{team.completed_tasks}</div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{team.assigned_tasks}</div>
                  <p className="text-xs text-muted-foreground">Assigned</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{team.in_progress_tasks}</div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </div>

              {(typeof team.avg_duration_minutes === 'number' || typeof team.p95_duration_minutes === 'number') && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-xl font-semibold text-muted-foreground">{Math.round(team.avg_duration_minutes || 0)}m</div>
                    <p className="text-xs text-muted-foreground">Avg Duration</p>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-semibold text-muted-foreground">{Math.round(team.p95_duration_minutes || 0)}m</div>
                    <p className="text-xs text-muted-foreground">P95 Duration</p>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span>Completion Rate</span>
                  <span>{team.completion_rate.toFixed(1)}%</span>
                </div>
                <Progress value={team.completion_rate} className="h-2" />
              </div>

              {/* Employee Details */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Team Members
                </h4>
                <div className="grid gap-3">
                  {team.employees.map((employee) => (
                    <div key={employee.employee_code} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{employee.employee_name}</p>
                          <Badge variant="outline" className="text-xs">
                            #{employee.employee_code}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{employee.employee_role}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {employee.task_count} task{employee.task_count !== 1 ? 's' : ''}
                          </span>
                          {typeof employee.completed_tasks === 'number' && employee.completed_tasks > 0 && (
                            <span className="text-xs text-green-600">
                              ✓ {employee.completed_tasks} completed
                            </span>
                          )}
                          {typeof employee.in_progress_tasks === 'number' && employee.in_progress_tasks > 0 && (
                            <span className="text-xs text-blue-600">
                              ⏳ {employee.in_progress_tasks} in progress
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {employee.tasks.slice(0, 3).map((task) => (
                          <Badge
                            key={task.task_id}
                            variant={
                              task.status === 'COMPLETED' ? 'default' :
                              task.status === 'ASSIGNED' ? 'secondary' : 'outline'
                            }
                            className="text-xs"
                          >
                            {task.status === 'COMPLETED' ? '✓' : 
                             task.status === 'ASSIGNED' ? '📋' : '⏳'}
                          </Badge>
                        ))}
                        {employee.tasks.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{employee.tasks.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
