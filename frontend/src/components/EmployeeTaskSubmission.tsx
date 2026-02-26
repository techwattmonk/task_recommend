import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Clock, Calendar, Send } from "lucide-react";
import { getMyTasks, submitTaskCompletion, type MyTasksResponse, type AssignedTaskApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface EmployeeTaskSubmissionProps {
  employeeCode: string;
}

export default function EmployeeTaskSubmission({ employeeCode }: EmployeeTaskSubmissionProps) {
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskApi[]>([]);
  const [completedTasks, setCompletedTasks] = useState<AssignedTaskApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<AssignedTaskApi | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTasks();
  }, [employeeCode]);

  const loadTasks = async () => {
    try {
      const data: MyTasksResponse = await getMyTasks(employeeCode);
      setAssignedTasks(data.assigned_tasks || []);
      setCompletedTasks(data.completed_tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      toast({
        title: "Error",
        description: "Failed to load your tasks",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitTask = async () => {
    if (!selectedTask) return;

    setIsSubmitting(true);
    try {
      await submitTaskCompletion(
        employeeCode,
        selectedTask.task_id,
        completionNotes || undefined,
        hoursWorked ? parseFloat(hoursWorked) : undefined
      );

      toast({
        title: "Task Completed!",
        description: "Your task has been submitted successfully.",
      });

      // Reset form and reload tasks
      setSelectedTask(null);
      setCompletionNotes("");
      setHoursWorked("");
      await loadTasks();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit task completion",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>My Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-3">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>My Tasks</span>
            <div className="flex gap-2">
              <Badge variant="secondary">{assignedTasks.length} Assigned</Badge>
              <Badge variant="default">{completedTasks.length} Completed</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No tasks assigned to you</p>
            </div>
          ) : (
            assignedTasks.map((task, index) => (
              <div key={`assigned-${task.task_id}-${index}`} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium">{task.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Assigned: {task.assigned_at ? new Date(task.assigned_at as string).toLocaleDateString() : 'No date'}
                    </span>
                    <Badge variant="outline">{task.status}</Badge>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      onClick={() => setSelectedTask(task)}
                      className="ml-4"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Complete
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Complete Task</DialogTitle>
                      <DialogDescription>
                        Submit the completion details for "{selectedTask?.title}". Add notes about the work completed and hours spent.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Task</Label>
                        <p className="font-medium">{selectedTask?.title}</p>
                      </div>
                      
                      <div>
                        <Label htmlFor="hours">Hours Worked (Optional)</Label>
                        <Input
                          id="hours"
                          name="hoursWorked"
                          type="number"
                          step="0.5"
                          placeholder="e.g., 2.5"
                          value={hoursWorked}
                          onChange={(e) => setHoursWorked(e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="notes">Completion Notes (Optional)</Label>
                        <Textarea
                          id="notes"
                          name="completionNotes"
                          placeholder="Describe what you accomplished..."
                          value={completionNotes}
                          onChange={(e) => setCompletionNotes(e.target.value)}
                          rows={3}
                        />
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => {
                          setSelectedTask(null);
                          setCompletionNotes("");
                          setHoursWorked("");
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSubmitTask}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <>Submitting...</>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              Submit Completion
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {completedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedTasks.map((task, index) => (
              <div key={`completed-${task.task_id}-${index}`} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                <div>
                  <h4 className="font-medium">{task.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>
                      Completed: {task.completion_time ? new Date(task.completion_time as string).toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                </div>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  Completed
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
