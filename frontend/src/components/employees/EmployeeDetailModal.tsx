import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Employee, Task } from "@/types";
import { X, Mail, Phone, Calendar, Briefcase, User, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmployeeDetailModalProps {
  employee: Employee | null;
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
  onAssignTask: () => void;
  isAssigned?: boolean;
}

export function EmployeeDetailModal({ 
  employee, 
  tasks, 
  isOpen, 
  onClose, 
  onAssignTask,
  isAssigned = false 
}: EmployeeDetailModalProps) {
  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">Employee Details</DialogTitle>
              <DialogDescription>
                View detailed information about {employee?.employee_name}, including skills, experience, and assigned tasks.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Employee Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <User className="h-12 w-12 text-primary" />
                </div>
                
                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-bold">
                        {employee.employee_name}
                      </h1>
                      <p className="text-muted-foreground">
                        #{employee.employee_code}
                      </p>
                      {employee.current_role && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {employee.current_role}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={onAssignTask}
                        disabled={isAssigned}
                        variant={isAssigned ? "secondary" : "default"}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {isAssigned ? "Assigned" : "Assign Task"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Code:</span>
                  <span className="font-medium">{employee.employee_code}</span>
                </div>
                {employee.date_of_birth && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date of Birth:</span>
                    <span className="font-medium">{employee.date_of_birth}</span>
                  </div>
                )}
                {employee.joining_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Joining Date:</span>
                    <span className="font-medium">{employee.joining_date}</span>
                  </div>
                )}
                {employee.contact_email && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {employee.contact_email}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Professional Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Professional Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {employee.current_role && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Role:</span>
                    <span className="font-medium">{employee.current_role}</span>
                  </div>
                )}
                {employee.shift && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shift:</span>
                    <span className="font-medium">{employee.shift}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Experience:</span>
                  <span className="font-medium">
                    {employee.current_experience_years || 0} years
                    {employee.previous_experience_years && ` (+${employee.previous_experience_years} previous)`}
                  </span>
                </div>
                {employee.reporting_manager && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reporting Manager:</span>
                    <span className="font-medium">{employee.reporting_manager}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Technical Skills</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Display categorized skills */}
              <div className="space-y-4">
                {(() => {
                  // Get skills from either field with priority to 'skills'
                  const getSkills = () => {
                    const skills = {
                      structural_design: [],
                      electrical_design: [],
                      coordination: []
                    };
                    
                    // Try skills field first (primary location from database)
                    if (employee.skills?.structural_design) skills.structural_design = employee.skills.structural_design;
                    if (employee.skills?.electrical_design) skills.electrical_design = employee.skills.electrical_design;
                    if (employee.skills?.coordination) skills.coordination = employee.skills.coordination;
                    
                    // Fallback to technical_skills if skills is empty
                    if (skills.structural_design.length === 0 && skills.electrical_design.length === 0 && skills.coordination.length === 0) {
                      if (employee.technical_skills?.structural_design) skills.structural_design = employee.technical_skills.structural_design;
                      if (employee.technical_skills?.electrical_design) skills.electrical_design = employee.technical_skills.electrical_design;
                      if (employee.technical_skills?.coordination) skills.coordination = employee.technical_skills.coordination;
                    }
                    
                    return skills;
                  };
                  
                  const skills = getSkills();
                  
                  return (
                    <>
                      {/* Structural Design Skills */}
                      {skills.structural_design && skills.structural_design.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Structural Design:</p>
                          <div className="flex flex-wrap gap-2">
                            {skills.structural_design.map((skill, index) => (
                              <Badge key={`structural-${index}`} variant="default" className="bg-blue-100 text-blue-800 border-blue-200">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Electrical Design Skills */}
                      {skills.electrical_design && skills.electrical_design.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Electrical Design:</p>
                          <div className="flex flex-wrap gap-2">
                            {skills.electrical_design.map((skill, index) => (
                              <Badge key={`electrical-${index}`} variant="default" className="bg-green-100 text-green-800 border-green-200">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Coordination Skills */}
                      {skills.coordination && skills.coordination.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Coordination:</p>
                          <div className="flex flex-wrap gap-2">
                            {skills.coordination.map((skill, index) => (
                              <Badge key={`coordination-${index}`} variant="default" className="bg-purple-100 text-purple-800 border-purple-200">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Show raw skills if no categorized skills */}
                      {skills.structural_design.length === 0 && skills.electrical_design.length === 0 && skills.coordination.length === 0 && employee.raw_technical_skills && (
                    <div>
                      <p className="text-sm text-orange-600 font-medium mb-2">Raw Skills Description:</p>
                      <p className="text-sm text-muted-foreground">{employee.raw_technical_skills}</p>
                    </div>
                  )}
                </>
                  );
                })()}
              </div>
              
              {/* If no skills at all */}
              {(!employee.skills && !employee.technical_skills && !employee.raw_technical_skills) && (
                <p className="text-muted-foreground">No technical skills listed</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Tasks ({tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.length > 0 ? (
                tasks.map((task, idx) => (
                  <div key={idx} className="flex items-start justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex-1">
                      <p className="font-medium">{task.task_assigned || task.task_description}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Assigned {new Date(task.time_assigned || task.assigned_at).toLocaleDateString()} at {new Date(task.time_assigned || task.assigned_at).toLocaleTimeString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        By: {task.assigned_by}
                      </p>
                    </div>
                    <Badge variant={task.status === 'ASSIGNED' ? 'warning' : 'success'}>
                      {task.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No tasks assigned yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
