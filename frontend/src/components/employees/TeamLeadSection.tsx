import { useState } from "react";
import { ChevronDown, ChevronRight, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmployeeCard } from "./EmployeeCard";
import { Employee } from "@/types";
import { cn } from "@/lib/utils";

interface TeamLeadSectionProps {
  teamLead: Employee;
  members: Employee[];
  defaultExpanded?: boolean;
}

export function TeamLeadSection({ teamLead, members, defaultExpanded = true }: TeamLeadSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  const availableCount = members.filter(m => m.employee_status?.availability === "available").length;
  
  return (
    <div className="space-y-4">
      {/* Team Lead Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50",
          "hover:bg-card hover:border-primary/30 transition-all duration-200",
          "group cursor-pointer"
        )}
      >
        {/* Expand Icon */}
        <div className="text-muted-foreground group-hover:text-primary transition-colors">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </div>
        
        {/* Team Lead Avatar */}
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        
        {/* Team Lead Info */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {teamLead.employee_name}
            </h3>
            <Badge variant="outline" className="text-xs">
              #{teamLead.employee_code}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {teamLead.current_role} • {teamLead.shift} Shift
          </p>
        </div>
        
        {/* Team Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{members.length} members</span>
          </div>
          <Badge variant={availableCount > 0 ? "default" : "secondary"} className="text-xs">
            {availableCount} available
          </Badge>
        </div>
      </button>
      
      {/* Team Members Grid */}
      {isExpanded && (
        <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up">
          {members.map((employee, index) => (
            <EmployeeCard 
              key={employee.employee_code} 
              employee={employee} 
              index={index} 
            />
          ))}
          {members.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No team members assigned
            </div>
          )}
        </div>
      )}
    </div>
  );
}