import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Employee } from "@/types";
import { User, Clock, Briefcase, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface EmployeeCardProps {
  employee: Employee;
  index?: number;
}

const availabilityColors = {
  available: "bg-success",
  busy: "bg-warning",
  offline: "bg-muted-foreground",
};

export function EmployeeCard({ employee, index = 0 }: EmployeeCardProps) {
  const availability = employee.employee_status?.availability || "available";
  
  // Note: Removed automatic task loading on mount to improve performance
  // Tasks will be loaded only when viewing employee profile page
  
  return (
    <Card 
      variant="interactive"
      className="p-5 animate-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative">
          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div className={cn(
            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card",
            availabilityColors[availability as keyof typeof availabilityColors]
          )} />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground truncate">
            {employee.employee_name}
          </h4>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
              #{employee.employee_code}
            </span>
          </p>
          
          <div className="mt-2 space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {employee.current_role}
            </p>
            {employee.current_experience_years && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {employee.current_experience_years.toFixed(1)} years
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Skills */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(() => {
          const skills = [];
          
          // Try skills field first (primary location from database)
          if (employee.skills?.structural_design) skills.push(...employee.skills.structural_design);
          if (employee.skills?.electrical_design) skills.push(...employee.skills.electrical_design);
          if (employee.skills?.coordination) skills.push(...employee.skills.coordination);
          
          // Fallback to technical_skills if skills is empty
          if (skills.length === 0) {
            if (employee.technical_skills?.structural_design) skills.push(...employee.technical_skills.structural_design);
            if (employee.technical_skills?.electrical_design) skills.push(...employee.technical_skills.electrical_design);
            if (employee.technical_skills?.coordination) skills.push(...employee.technical_skills.coordination);
          }
          
          // Display first 3 skills
          return skills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-xs">
              {skill}
            </Badge>
          ));
        })()}
        {(() => {
          // Count total skills from both fields
          const skillsList = [];
          
          // Try skills field first
          if (employee.skills?.structural_design) skillsList.push(...employee.skills.structural_design);
          if (employee.skills?.electrical_design) skillsList.push(...employee.skills.electrical_design);
          if (employee.skills?.coordination) skillsList.push(...employee.skills.coordination);
          
          // Fallback to technical_skills
          if (skillsList.length === 0) {
            if (employee.technical_skills?.structural_design) skillsList.push(...employee.technical_skills.structural_design);
            if (employee.technical_skills?.electrical_design) skillsList.push(...employee.technical_skills.electrical_design);
            if (employee.technical_skills?.coordination) skillsList.push(...employee.technical_skills.coordination);
          }
          
          const totalSkills = skillsList.length;
          
          return totalSkills > 3 && (
            <Badge variant="muted" className="text-xs">
              +{totalSkills - 3}
            </Badge>
          );
        })()}
      </div>
      
      {/* Action */}
      <div className="mt-4">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to={`/employees/${employee.employee_code}`}>
            <Eye className="h-3 w-3" />
            View Profile
          </Link>
        </Button>
      </div>
    </Card>
  );
}
