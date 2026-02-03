import React, { useState, useEffect } from 'react';
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
  Download
} from 'lucide-react';
import { api } from '@/lib/api';
import { 
  Employee, 
  PerformanceData, 
  SLAReport,
  PerformanceResponse,
  SLAReportResponse
} from '@/types/stageTracking';

const EmployeePerformanceDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [slaReport, setSlaReport] = useState<SLAReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30'); // days
  const [dataSource, setDataSource] = useState<'clickhouse' | 'mongodb' | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchSLAReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only run on mount
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      fetchPerformanceData(selectedEmployee);
    }
  }, [selectedEmployee, timeRange]);

  const fetchEmployees = async () => {
    try {
      const response = await api.get<Employee[]>('/employees/');
      setEmployees(response.data || []);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchPerformanceData = async (employeeCode: string) => {
    try {
      setLoading(true);
      // Try ClickHouse analytics first (100x faster)
      try {
        const clickhouseResponse = await api.get(`/analytics/employees/top-performers?days=${timeRange}&limit=50`);
        const chData = clickhouseResponse.data as { success?: boolean; data?: unknown[] };
        if (chData.success && chData.data) {
          const performers = chData.data;
          const employeeData = performers.find((p: unknown) => (p as unknown[])[0] === employeeCode);
          if (employeeData) {
            // Convert ClickHouse data to PerformanceData format
            const empArray = employeeData as unknown[];
            const performanceData: PerformanceData = {
              employee_code: empArray[0] as string,
              active_assignments: 0, // Not available in ClickHouse yet
              completed_stages: (empArray[2] as number) - ((empArray[5] as number) || 0),
              total_penalty_points: (empArray[5] as number) || 0,
              average_stage_duration_minutes: empArray[3] as number,
              active_work: [], // Not available in ClickHouse yet
              completed_work: [] // Not available in ClickHouse yet
            };
            setPerformanceData(performanceData);
            setDataSource('clickhouse');
            console.log('[Performance] ClickHouse data loaded for employee:', employeeCode, performanceData);
            return;
          }
        }
      } catch (chError) {
        console.log('[Performance] ClickHouse not available, falling back to MongoDB');
      }
      
      // Fallback to MongoDB
      const response = await api.get(`/stage-tracking/employee/${employeeCode}/performance?days=${timeRange}`);
      const data = response.data as { success?: boolean; performance?: PerformanceData };
      setPerformanceData(data.performance || null);
      setDataSource('mongodb');
      console.log('[Performance] MongoDB data loaded for employee:', employeeCode, data.performance);
    } catch (error) {
      console.error('[Performance] Failed to fetch performance data:', error);
      setPerformanceData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSLAReport = async () => {
    try {
      // Try ClickHouse SLA analytics first (100x faster)
      try {
        const clickhouseResponse = await api.get('/analytics/sla/compliance?days=30');
        const chData = clickhouseResponse.data as { success?: boolean; data?: unknown[] };
        if (chData.success && chData.data && chData.data.length > 0) {
          // Convert ClickHouse data to SLAReport format
          const slaData = chData.data;
          let totalStages = 0;
          let completedStages = 0;
          let withinIdeal = 0;
          let overIdeal = 0;
          let overMax = 0;
          const byStage: Record<string, unknown> = {};
          
          slaData.forEach((stage: unknown[]) => {
            const stageArray = stage as unknown[];
            const stageName = stageArray[0] as string;
            const total = stageArray[2] as number;
            const breached = stageArray[3] as number;
            const breachRate = stageArray[4] as number;
            
            totalStages += total;
            completedStages += total;
            withinIdeal += Math.floor(total * (1 - breachRate / 100));
            overIdeal += Math.ceil(total * breachRate / 100);
            overMax += breached;
            
            byStage[stageName] = {
              total: total,
              completed: total,
              breached: breached,
              breach_rate: breachRate
            };
          });
          
          const slaReport: SLAReport = {
            total_stages: totalStages,
            completed_stages: completedStages,
            within_ideal: withinIdeal,
            over_ideal: overIdeal,
            over_max: overMax,
            escalations: overMax,
            by_stage: byStage as Record<string, { total: number; completed: number; within_ideal: number; over_ideal: number; over_max: number; escalations: number }>
          };
          
          setSlaReport(slaReport);
          console.log('[Performance] ClickHouse SLA report loaded:', slaReport);
          return;
        }
      } catch (chError) {
        console.log('[Performance] ClickHouse SLA not available, falling back to MongoDB');
      }
      
      // Fallback to MongoDB
      const response = await api.get('/stage-tracking/sla-report?days=30');
      const data = response.data as { success?: boolean; report?: SLAReport };
      setSlaReport(data.report || null);
      console.log('[Performance] MongoDB SLA report loaded:', data.report);
    } catch (error) {
      console.error('[Performance] Failed to fetch SLA report:', error);
      setSlaReport(null);
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
      // Duration - lower is better
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

  const exportPerformanceData = () => {
    if (!performanceData) return;
    
    const csvContent = [
      ['Employee Code', 'Employee Name', 'Active Assignments', 'Completed Stages', 'Total Penalties', 'Avg Duration (min)'],
      [
        performanceData.employee_code,
        employees.find(e => e.employee_code === performanceData.employee_code)?.employee_name || '',
        performanceData.active_assignments.toString(),
        performanceData.completed_stages.toString(),
        performanceData.total_penalty_points.toString(),
        performanceData.average_stage_duration_minutes.toString()
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Employee Performance Dashboard</h1>
          <p className="text-gray-600">Track employee performance, penalties, and SLA compliance</p>
          {dataSource && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={dataSource === 'clickhouse' ? 'default' : 'secondary'} className="text-xs">
                {dataSource === 'clickhouse' ? '⚡ ClickHouse (100x faster)' : '📊 MongoDB'}
              </Badge>
              {dataSource === 'clickhouse' && (
                <span className="text-xs text-green-600">Real-time analytics</span>
              )}
            </div>
          )}
        </div>
        {performanceData && (
          <Button onClick={exportPerformanceData} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        )}
      </div>

      {/* Employee Selection */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="employee">Select Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.employee_code} value={emp.employee_code}>
                      {emp.employee_name} - {emp.current_role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="timeRange">Time Range (days)</Label>
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
              <Button 
                onClick={() => selectedEmployee && fetchPerformanceData(selectedEmployee)}
                disabled={!selectedEmployee || loading}
              >
                <Activity className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEmployee && performanceData && (
        <>
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Assignments</p>
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

          {/* Performance Badges */}
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
                      <span>Completion Rate</span>
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
                      <span>Penalty Ratio</span>
                      <span>
                        {performanceData.completed_stages > 0 
                          ? Math.round((performanceData.total_penalty_points / performanceData.completed_stages) * 10) / 10
                          : 0} pts/stage
                      </span>
                    </div>
                    <Progress 
                      value={Math.min((performanceData.total_penalty_points / Math.max(performanceData.completed_stages, 1)) * 10, 100)} 
                      className="h-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Work History */}
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">Active Work ({performanceData.active_work.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed Work ({performanceData.completed_work.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Current Assignments</CardTitle>
                </CardHeader>
                <CardContent>
                  {performanceData.active_work.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Timer className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No active assignments</p>
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
            </TabsContent>

            <TabsContent value="completed" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Completed Work</CardTitle>
                </CardHeader>
                <CardContent>
                  {performanceData.completed_work.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No completed work in this period</p>
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

export default EmployeePerformanceDashboard;
