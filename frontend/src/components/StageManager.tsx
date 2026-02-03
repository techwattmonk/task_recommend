import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Clock, 
  User, 
  Play, 
  CheckCircle, 
  ArrowRight, 
  AlertTriangle,
  Timer,
  FileText,
  Users
} from 'lucide-react';
import { api } from '@/lib/api';
import { 
  Employee, 
  FileTracking,
  StageAssignment,
  StageHistory,
  FileTrackingResponse
} from '@/types/stageTracking';

interface StageManagerProps {
  fileId: string;
  onUpdate?: () => void;
}

const StageManager: React.FC<StageManagerProps> = ({ fileId, onUpdate }) => {
  const [tracking, setTracking] = useState<FileTracking | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [notes, setNotes] = useState('');
  const [nextStageEmployee, setNextStageEmployee] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [fileId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [trackingRes, employeesRes] = await Promise.all([
        api.get<FileTrackingResponse>(`/stage-tracking/file/${fileId}`),
        api.get<Employee[]>('/employees/')
      ]);

      setTracking(trackingRes.data.tracking);
      setEmployees(employeesRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignEmployee = async () => {
    if (!selectedEmployee) return;
    
    try {
      setActionLoading(true);
      await api.post('/stage-tracking/assign', {
        file_id: fileId,
        employee_code: selectedEmployee,
        notes: notes
      });

      setAssignDialogOpen(false);
      setSelectedEmployee('');
      setNotes('');
      fetchData();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to assign employee:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartWork = async () => {
    if (!tracking?.current_assignment?.employee_code) return;
    
    try {
      setActionLoading(true);
      await api.post(`/stage-tracking/start-work?file_id=${fileId}&employee_code=${tracking.current_assignment.employee_code}`);

      fetchData();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to start work:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteStage = async () => {
    if (!tracking?.current_assignment?.employee_code) return;
    
    try {
      setActionLoading(true);
      await api.post('/stage-tracking/complete-stage', {
        file_id: fileId,
        employee_code: tracking.current_assignment.employee_code,
        completion_notes: notes,
        next_stage_employee_code: nextStageEmployee || undefined
      });

      setCompleteDialogOpen(false);
      setNotes('');
      setNextStageEmployee('');
      fetchData();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to complete stage:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getStageColor = (stage: string) => {
    const colors = {
      PRELIMS: 'bg-blue-100 text-blue-800',
      PRODUCTION: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-gray-100 text-gray-800',
      QC: 'bg-orange-100 text-orange-800',
      DELIVERED: 'bg-green-100 text-green-800'
    };
    return colors[stage as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-600';
      case 'IN_PROGRESS': return 'text-blue-600';
      case 'PENDING': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getSLAStatusColor = (status: string) => {
    switch (status) {
      case 'within_ideal': return 'text-green-600';
      case 'over_ideal': return 'text-yellow-600';
      case 'over_max': return 'text-red-600';
      case 'escalation_needed': return 'text-red-800 font-bold';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!tracking) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No tracking data found for this file. The file may not have been properly initialized.
        </AlertDescription>
      </Alert>
    );
  }

  const currentStageHistory = tracking.stage_history.find(h => h.stage === tracking.current_stage);
  const canStartWork = tracking.current_assignment && !tracking.current_assignment.started_at;
  const canComplete = tracking.current_assignment && tracking.current_assignment.started_at && !currentStageHistory?.completed_stage_at;

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Current Stage: {tracking.current_stage}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getStageColor(tracking.current_stage)}>
                {tracking.current_stage}
              </Badge>
              <Badge variant={tracking.current_status === 'DELIVERED' ? 'default' : 'secondary'}>
                {tracking.current_status}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm text-gray-600">Current Assignment</Label>
              {tracking.current_assignment ? (
                <div className="flex items-center gap-2 mt-1">
                  <User className="w-4 h-4 text-gray-500" />
                  <span>{tracking.current_assignment.employee_name}</span>
                </div>
              ) : (
                <span className="text-gray-500">Not assigned</span>
              )}
            </div>
            <div>
              <Label className="text-sm text-gray-600">Duration</Label>
              {tracking.current_assignment?.duration_minutes ? (
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className={getSLAStatusColor(tracking.current_assignment.sla_status?.status || '')}>
                    {formatDuration(tracking.current_assignment.duration_minutes)}
                  </span>
                </div>
              ) : (
                <span className="text-gray-500">Not started</span>
              )}
            </div>
            <div>
              <Label className="text-sm text-gray-600">Penalty Points</Label>
              <div className="flex items-center gap-2 mt-1">
                <AlertTriangle className="w-4 h-4 text-gray-500" />
                <span className={tracking.total_penalty_points > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                  {tracking.total_penalty_points}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            {!tracking.current_assignment && (
              <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Users className="w-4 h-4 mr-2" />
                    Assign Employee
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Employee to {tracking.current_stage}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
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
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this assignment..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAssignEmployee} disabled={!selectedEmployee || actionLoading}>
                        {actionLoading ? 'Assigning...' : 'Assign'}
                      </Button>
                      <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {canStartWork && (
              <Button size="sm" onClick={handleStartWork} disabled={actionLoading}>
                <Play className="w-4 h-4 mr-2" />
                Start Work
              </Button>
            )}

            {canComplete && (
              <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete Stage
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete {tracking.current_stage} Stage</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="completion-notes">Completion Notes</Label>
                      <Textarea
                        id="completion-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Describe what was completed..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="next-employee">Assign to Next Stage (optional)</Label>
                      <Select value={nextStageEmployee} onValueChange={setNextStageEmployee}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose employee for next stage" />
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
                    <div className="flex gap-2">
                      <Button onClick={handleCompleteStage} disabled={actionLoading}>
                        {actionLoading ? 'Completing...' : 'Complete Stage'}
                      </Button>
                      <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage History */}
      <Card>
        <CardHeader>
          <CardTitle>Stage History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tracking.stage_history.map((history, index) => (
              <div key={index} className="border-l-4 border-blue-200 pl-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getStageColor(history.stage)}>
                      {history.stage}
                    </Badge>
                    <Badge variant={history.status === 'COMPLETED' ? 'default' : 'secondary'}>
                      {history.status}
                    </Badge>
                  </div>
                  {history.sla_breached && (
                    <Badge variant="destructive">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      SLA Breached
                    </Badge>
                  )}
                </div>

                {history.assigned_to && (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>{history.assigned_to.employee_name}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Assigned: {new Date(history.assigned_to.assigned_at).toLocaleString()}</span>
                      </div>
                      {history.assigned_to.started_at && (
                        <div className="flex items-center gap-1">
                          <Play className="w-3 h-3" />
                          <span>Started: {new Date(history.assigned_to.started_at).toLocaleString()}</span>
                        </div>
                      )}
                      {history.completed_stage_at && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Completed: {new Date(history.completed_stage_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {history.assigned_to.duration_minutes && (
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-gray-500" />
                        <span>Duration: </span>
                        <span className={getSLAStatusColor(history.assigned_to.sla_status?.status || '')}>
                          {formatDuration(history.assigned_to.duration_minutes)}
                        </span>
                        {history.assigned_to.penalty_points > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            -{history.assigned_to.penalty_points} pts
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StageManager;
