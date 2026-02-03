import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Recommendation } from "@/types";
import { User, Briefcase, Clock, Eye, UserPlus, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useState } from "react";

interface EmployeeRecommendationCardProps {
  recommendation: Recommendation;
  rank: number;
  onViewProfile?: () => void;
  onAssign?: () => void;
}

const rankIcons = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
const rankColors = [
  "border-yellow-500/30 bg-yellow-500/5",
  "border-gray-400/30 bg-gray-400/5",
  "border-amber-600/30 bg-amber-600/5",
  "",
  "",
];

export function EmployeeRecommendationCard({ 
  recommendation, 
  rank, 
  onViewProfile, 
  onAssign 
}: EmployeeRecommendationCardProps) {
  // Use match_percentage if available, otherwise calculate from similarity_score
  const matchPercentage = recommendation.match_percentage || Math.round((recommendation.similarity_score || 0) * 100);
  const [showAllSkills, setShowAllSkills] = useState(false);
  
  // Extract skills from categorized structure
  const extractSkills = (skills: any) => {
    const skillList = [];
    if (skills?.structural_design) skillList.push(...skills.structural_design);
    if (skills?.electrical_design) skillList.push(...skills.electrical_design);
    if (skills?.coordination) skillList.push(...skills.coordination);
    return skillList;
  };
  
  const displaySkills = extractSkills(recommendation.technical_skills);
  const skillsToShow = showAllSkills ? displaySkills : displaySkills.slice(0, 4);
  const hasMoreSkills = displaySkills.length > 4;
  
  return (
    <Card 
      variant="interactive"
      className={cn(
        "p-4 animate-slide-up",
        rank < 3 && rankColors[rank]
      )}
      style={{ animationDelay: `${rank * 100}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Rank & Avatar */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xl">{rankIcons[rank]}</span>
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold text-foreground">
                {recommendation.employee_name}
              </h4>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {recommendation.current_role}
              </p>
            </div>
            
            {/* Match Score */}
            <div className="text-right">
              <div className={cn(
                "text-2xl font-bold",
                matchPercentage >= 90 ? "text-success" : 
                matchPercentage >= 70 ? "text-primary" : 
                "text-warning"
              )}>
                {matchPercentage}%
              </div>
              <p className="text-xs text-muted-foreground">match</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                matchPercentage >= 90 ? "bg-success" : 
                matchPercentage >= 70 ? "bg-primary" : 
                "bg-warning"
              )}
              style={{ width: `${matchPercentage}%` }}
            />
          </div>
          
          {/* Skills */}
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {skillsToShow.map((skill, index) => (
                <Badge 
                  key={skill} 
                  variant="outline" 
                  className="text-xs"
                >
                  {skill}
                </Badge>
              ))}
              
              {/* Show expand/collapse button if there are more skills */}
              {hasMoreSkills && (
                <Badge 
                  variant="muted" 
                  className="text-xs cursor-pointer hover:bg-muted-80 transition-colors"
                  onClick={() => setShowAllSkills(!showAllSkills)}
                >
                  {showAllSkills ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{displaySkills.length - 4}
                    </>
                  )}
                </Badge>
              )}
            </div>
            
            {/* Show indicator for normalized vs raw data */}
            {recommendation.normalized_skills && recommendation.normalized_skills.length > 0 && (
              <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Clean normalized skills
              </p>
            )}
          </div>
          
          {/* Experience */}
          {recommendation.experience_years && (
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recommendation.experience_years.toFixed(1)} years of experience
            </p>
          )}
          
          {/* Task Count */}
          {recommendation.current_task_count !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <Badge 
                variant={recommendation.current_task_count === 0 ? "secondary" : 
                        recommendation.current_task_count <= 2 ? "outline" : "destructive"}
                className="text-xs"
              >
                <FileText className="h-3 w-3 mr-1" />
                {recommendation.current_task_count} tasks
              </Badge>
              {recommendation.current_task_count === 0 && (
                <span className="text-xs text-green-600">Available</span>
              )}
              {recommendation.current_task_count > 0 && recommendation.current_task_count <= 2 && (
                <span className="text-xs text-blue-600">Light load</span>
              )}
              {recommendation.current_task_count > 2 && (
                <span className="text-xs text-orange-600">Busy</span>
              )}
            </div>
          )}
          
          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/employees/${recommendation.employee_code}`}>
                <Eye className="h-3 w-3 mr-1" />
                Profile
              </Link>
            </Button>
            <Button size="sm" onClick={onAssign}>
              <UserPlus className="h-3 w-3 mr-1" />
              Assign
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
