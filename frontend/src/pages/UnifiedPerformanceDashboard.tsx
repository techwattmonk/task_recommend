import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Timer,
  Award,
  Target,
  Activity,
  Download,
  Users,
  Filter,
  Search,
  FileText,
  BarChart3,
  ArrowLeft
} from 'lucide-react';
import { api } from '@/lib/api';
import { 
  Employee, 
  PerformanceData, 
  SLAReport,
  PerformanceResponse,
  SLAReportResponse,
  Task,
  TaskBoardData,
  EmployeeTasks
} from '@/types/stageTracking';

const UnifiedPerformanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reportingManagers, setReportingManagers] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedReportingManager, setSelectedReportingManager] = useState('');
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [slaReport, setSlaReport] = useState<SLAReport | null>(null);
  const [employeeTasks, setEmployeeTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30'); // days
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchSLAReport();
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      fetchPerformanceData(selectedEmployee);
      fetchEmployeeTasks(selectedEmployee);
      fetchCompletedTasks(selectedEmployee);
    }
  }, [selectedEmployee, timeRange]);

  useEffect(() => {
    // Clear selected employee when manager changes
    setSelectedEmployee('');
    setPerformanceData(null);
    setEmployeeTasks([]);
    setCompletedTasks([]);
    
    if (selectedReportingManager && selectedReportingManager !== 'all') {
      // Auto-select first direct report if none selected
      const directReports = getDirectReports(selectedReportingManager);
      if (directReports.length > 0) {
        setSelectedEmployee(directReports[0].employee_code);
      }
    }
  }, [selectedReportingManager]);

  const fetchEmployees = async () => {
    try {
      const response = await api.get<Employee[]>('/employees/');
      const employeesData = response.data || [];
      setEmployees(employeesData);
      
      // Extract unique reporting managers - people who are actually managers of others
      const managerMap = new Map<string, Employee>();
      
      employeesData.forEach(emp => {
        // Add reporting_manager if it exists
        if (emp.reporting_manager) {
          const manager = employeesData.find(e => e.employee_code === emp.reporting_manager);
          if (manager && !managerMap.has(emp.reporting_manager)) {
            managerMap.set(emp.reporting_manager, manager);
          }
        }
        // Add reporting_manager_2 if it exists
        if (emp.reporting_manager_2) {
          const manager = employeesData.find(e => e.employee_code === emp.reporting_manager_2);
          if (manager && !managerMap.has(emp.reporting_manager_2)) {
            managerMap.set(emp.reporting_manager_2, manager);
          }
        }
      });
      
      const managersList = Array.from(managerMap.values());
      console.log(`Found ${managersList.length} actual reporting managers`);
      setReportingManagers(managersList);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchPerformanceData = async (employeeCode: string) => {
    try {
      setLoading(true);
      const response = await api.get<PerformanceResponse>(`/stage-tracking/employee/${employeeCode}/performance?days=${timeRange}`);
      setPerformanceData(response.data.performance);
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeTasks = async (employeeCode: string) => {
    try {
      const response = await api.get<{ tasks: Task[] }>(`/employee-tasks/${employeeCode}`);
      setEmployeeTasks(response.data.tasks || []);
    } catch (error) {
      console.error('Failed to fetch employee tasks:', error);
    }
  };

  const fetchCompletedTasks = async (employeeCode: string) => {
    try {
      // Fetch completed tasks for the employee
      const response = await api.get<{ tasks: Task[] }>(`/tasks/employee/${employeeCode}/completed`);
      setCompletedTasks(response.data.tasks || []);
    } catch (error) {
      console.error('Failed to fetch completed tasks:', error);
    }
  };

  const fetchSLAReport = async () => {
    try {
      const response = await api.get<SLAReportResponse>('/stage-tracking/sla-report?days=30');
      setSlaReport(response.data.report);
    } catch (error) {
      console.error('Failed to fetch SLA report:', error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getPerformanceColor = (score: number, type: 'penalty' | 'duration') => {
    if (type === 'penalty') {
      if (score === 0) return 'text-green-600';
      if (score < 5) return 'text-yellow-600';
      if (score < 10) return 'text-orange-600';
      return 'text-red-600';
    } else {
      if (score < 30) return 'text-green-600';
      if (score < 60) return 'text-yellow-600';
      if (score < 120) return 'text-orange-600';
      return 'text-red-600';
    }
  };

  const getPerformanceBadge = (score: number, type: 'penalty' | 'duration') => {
    if (type === 'penalty') {
      if (score === 0) return { text: 'Excellent', color: 'bg-green-100 text-green-800' };
      if (score < 5) return { text: 'Good', color: 'bg-yellow-100 text-yellow-800' };
      if (score < 10) return { text: 'Needs Improvement', color: 'bg-orange-100 text-orange-800' };
      return { text: 'Poor', color: 'bg-red-100 text-red-800' };
    } else {
      if (score < 30) return { text: 'Fast', color: 'bg-green-100 text-green-800' };
      if (score < 60) return { text: 'Normal', color: 'bg-yellow-100 text-yellow-800' };
      if (score < 120) return { text: 'Slow', color: 'bg-orange-100 text-orange-800' };
      return { text: 'Very Slow', color: 'bg-red-100 text-red-800' };
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesManager = !selectedReportingManager || 
                          selectedReportingManager === 'all' ||
                          emp.reporting_manager === selectedReportingManager || 
                          emp.reporting_manager_2 === selectedReportingManager;
    return matchesSearch && matchesManager;
  });

  // Get employees who report to the selected manager
  const getDirectReports = (managerCode: string) => {
    return employees.filter(emp => 
      emp.reporting_manager === managerCode || 
      emp.reporting_manager_2 === managerCode
    );
  };

  // Get employees to show in dropdown based on selected manager
  const getEmployeesForSelection = () => {
    if (!selectedReportingManager || selectedReportingManager === 'all') {
      return filteredEmployees;
    }
    return getDirectReports(selectedReportingManager).filter(emp =>
      emp.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const exportPerformanceData = () => {
    if (!performanceData) return;
    
    const csvContent = [
      ['Employee Code', 'Employee Name', 'Active Assignments', 'Completed Stages', 'Total Penalties', 'Avg Duration (min)', 'Active Tasks', 'Completed Tasks'],
      [
        performanceData.employee_code,
        employees.find(e => e.employee_code === performanceData.employee_code)?.employee_name || '',
        performanceData.active_assignments.toString(),
        performanceData.completed_stages.toString(),
        performanceData.total_penalty_points.toString(),
        performanceData.average_stage_duration_minutes.toString(),
        employeeTasks.length.toString(),
        completedTasks.length.toString()
      ]
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_${performanceData.employee_code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getTaskStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'todo': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Employee Performance Dashboard</h1>
            <p className="text-gray-600">Track performance, tasks, and SLA compliance with advanced filtering</p>
          </div>
        </div>
        {performanceData && (
          <Button onClick={exportPerformanceData} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        )}
      </div>

      {/* Filters Section */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Reporting Manager</Label>
              <Select value={selectedReportingManager} onValueChange={setSelectedReportingManager}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Managers</SelectItem>
                  {reportingManagers.map(manager => (
                    <SelectItem key={manager.employee_code} value={manager.employee_code}>
                      {manager.employee_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedReportingManager && selectedReportingManager !== 'all' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {getDirectReports(selectedReportingManager).length} direct reports
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="employee">Select Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {getEmployeesForSelection().map(emp => (
                    <SelectItem key={emp.employee_code} value={emp.employee_code}>
                      {emp.employee_name} - {emp.current_role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="time-range">Time Range (days)</Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEmployee && performanceData && (
        <>
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Stages</p>
                    <p className="text-2xl font-bold">{performanceData.active_assignments}</p>
                  </div>
                  <User className="w-8 h-8 text-blue-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Completed Stages</p>
                    <p className="text-2xl font-bold text-green-600">{performanceData.completed_stages}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Tasks</p>
                    <p className="text-2xl font-bold text-blue-600">{employeeTasks.length}</p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Completed Tasks</p>
                    <p className="text-2xl font-bold text-green-600">{completedTasks.length}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Penalty Points</p>
                    <p className={`text-2xl font-bold ${getPerformanceColor(performanceData.total_penalty_points, 'penalty')}`}>
                      {performanceData.total_penalty_points}
                    </p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Duration</p>
                    <p className={`text-2xl font-bold ${getPerformanceColor(performanceData.average_stage_duration_minutes, 'duration')}`}>
                      {formatDuration(performanceData.average_stage_duration_minutes)}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Performance Analysis */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Performance Overview</TabsTrigger>
              <TabsTrigger value="active-tasks">Active Tasks ({employeeTasks.length})</TabsTrigger>
              <TabsTrigger value="completed-tasks">Completed Tasks ({completedTasks.length})</TabsTrigger>
              <TabsTrigger value="activity">Complete Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Performance Rating</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span>Penalty Performance</span>
                        <Badge className={getPerformanceBadge(performanceData.total_penalty_points, 'penalty').color}>
                          {getPerformanceBadge(performanceData.total_penalty_points, 'penalty').text}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Speed Performance</span>
                        <Badge className={getPerformanceBadge(performanceData.average_stage_duration_minutes, 'duration').color}>
                          {getPerformanceBadge(performanceData.average_stage_duration_minutes, 'duration').text}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Efficiency Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Stage Completion Rate</span>
                          <span>
                            {performanceData.completed_stages > 0 
                              ? Math.round((performanceData.completed_stages / (performanceData.completed_stages + performanceData.active_assignments)) * 100)
                              : 0}%
                          </span>
                        </div>
                        <Progress value={performanceData.completed_stages > 0 
                          ? (performanceData.completed_stages / (performanceData.completed_stages + performanceData.active_assignments)) * 100 
                          : 0} 
                        className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Task Completion Rate</span>
                          <span>
                            {employeeTasks.length + completedTasks.length > 0 
                              ? Math.round((completedTasks.length / (employeeTasks.length + completedTasks.length)) * 100)
                              : 0}%
                          </span>
                        </div>
                        <Progress 
                          value={employeeTasks.length + completedTasks.length > 0 
                            ? (completedTasks.length / (employeeTasks.length + completedTasks.length)) * 100 
                            : 0} 
                          className="h-2"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="active-tasks" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Current Active Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  {employeeTasks.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No active tasks assigned</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {employeeTasks.map((task, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-lg">{task.title}</h4>
                              <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Badge className={getTaskStatusColor(task.status)}>
                                {task.status}
                              </Badge>
                              {task.file_id && (
                                <Badge variant="outline">{task.file_id}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div>Assigned: {new Date(task.assigned_at).toLocaleString()}</div>
                            {task.due_date && (
                              <div>Due: {new Date(task.due_date).toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="completed-tasks" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Completed Tasks History</CardTitle>
                </CardHeader>
                <CardContent>
                  {completedTasks.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No completed tasks in this period</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {completedTasks.map((task, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-lg">{task.title}</h4>
                              <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Badge className="bg-green-100 text-green-800">
                                Completed
                              </Badge>
                              {task.file_id && (
                                <Badge variant="outline">{task.file_id}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div>Assigned: {new Date(task.assigned_at).toLocaleString()}</div>
                            {task.due_date && (
                              <div>Due: {new Date(task.due_date).toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Stage Work</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {performanceData.active_work.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <Timer className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No active stage work in this period</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {performanceData.active_work.map((work, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-medium">{work.file_id}</h4>
                                <p className="text-sm text-gray-600">{work.stage}</p>
                              </div>
                              <Badge variant="outline">Active</Badge>
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div>Assigned: {new Date(work.assigned_at).toLocaleString()}</div>
                              {work.started_at && (
                                <div>Started: {new Date(work.started_at).toLocaleString()}</div>
                              )}
                              {work.duration_minutes && (
                                <div>Duration: {formatDuration(work.duration_minutes)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Completed Stage Work</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {performanceData.completed_work.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No completed stage work in this period</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {performanceData.completed_work.map((work, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-medium">{work.file_id}</h4>
                                <p className="text-sm text-gray-600">{work.stage}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="default">Completed</Badge>
                                {work.penalty_points > 0 && (
                                  <Badge variant="destructive">-{work.penalty_points} pts</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div>Completed: {new Date(work.completed_at).toLocaleString()}</div>
                              <div>Duration: {formatDuration(work.duration_minutes)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* SLA Overview */}
      {slaReport && (
        <Card>
          <CardHeader>
            <CardTitle>Team SLA Overview (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{slaReport.total_stages}</p>
                <p className="text-sm text-gray-600">Total Stages</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{slaReport.within_ideal}</p>
                <p className="text-sm text-gray-600">Within Ideal</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{slaReport.over_ideal}</p>
                <p className="text-sm text-gray-600">Over Ideal</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{slaReport.over_max}</p>
                <p className="text-sm text-gray-600">Over Max</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-800">{slaReport.escalations}</p>
                <p className="text-sm text-gray-600">Escalations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UnifiedPerformanceDashboard;
