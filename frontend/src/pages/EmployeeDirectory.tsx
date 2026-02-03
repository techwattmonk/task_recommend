import { useState, useEffect, useMemo } from "react";
import { Search, Filter, Users, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamLeadSection } from "@/components/employees/TeamLeadSection";
import { getEmployeesGroupedByTeamLead } from "@/lib/api";
import { TeamLeadGroup } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

export default function EmployeeDirectory() {
  const [teamsData, setTeamsData] = useState<TeamLeadGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamLeadFilter, setTeamLeadFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    loadTeamsData();
  }, []);

  const loadTeamsData = async () => {
    setIsLoading(true);
    try {
      const data = await getEmployeesGroupedByTeamLead();
      setTeamsData(data);
    } catch (error) {
      console.error("Failed to load teams data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTeamsData = useMemo(() => {
    if (!Array.isArray(teamsData)) return [];
    let filtered = teamsData;
    
    // Filter by team lead
    if (teamLeadFilter && teamLeadFilter !== "all") {
      filtered = filtered.filter(team => team.team_lead_code === teamLeadFilter);
    }
    
    // Filter members by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.map(team => ({
        ...team,
        employees: team.employees.filter(emp =>
          emp.employee_name.toLowerCase().includes(query) ||
          (emp.current_role || '').toLowerCase().includes(query) ||
          (emp.technical_skills && (
            (emp.technical_skills.structural_design?.some(skill => 
              skill.toLowerCase().includes(query)
            ) || false) ||
            (emp.technical_skills.electrical_design?.some(skill => 
              skill.toLowerCase().includes(query)
            ) || false) ||
            (emp.technical_skills.coordination?.some(skill => 
              skill.toLowerCase().includes(query)
            ) || false)
          ))
        )
      })).filter(team => team.employees && team.employees.length > 0 || 
        team.team_lead_name.toLowerCase().includes(query));
    }
    
    return filtered;
  }, [teamsData, searchQuery, teamLeadFilter]);

  const totalEmployees = useMemo(() => {
    if (!Array.isArray(filteredTeamsData)) return 0;
    return filteredTeamsData.reduce((sum, team) => sum + (team.employees ? team.employees.length : 0), 0);
  }, [filteredTeamsData]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Employee Directory
          </h1>
          <p className="text-muted-foreground mt-1">
            {totalEmployees} employees across {Array.isArray(filteredTeamsData) ? filteredTeamsData.length : 0} teams
          </p>
        </div>
        <Button 
          onClick={() => navigate('/employees/register')}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Register New Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, skill, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={teamLeadFilter} onValueChange={setTeamLeadFilter}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by Team Lead" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {Array.isArray(teamsData) && teamsData.map((team) => (
              <SelectItem key={team.team_lead_code} value={team.team_lead_code}>
                {team.team_lead_name}'s Team
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Teams List */}
      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50">
                <Skeleton className="w-5 h-5" />
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="p-5 rounded-xl border border-border bg-card">
                    <div className="flex items-start gap-4">
                      <Skeleton className="w-14 h-14 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : Array.isArray(filteredTeamsData) && filteredTeamsData.length > 0 ? (
        <div className="space-y-6">
          {filteredTeamsData.map((team) => {
            // Create a proper Employee object for the team lead
            const teamLeadEmployee = team.team_lead_info || {
              employee_code: team.team_lead_code,
              employee_name: team.team_lead_name,
              current_role: "Team Lead",
              shift: "Day",
              technical_skills: [],
              employee_status: { availability: "ACTIVE" }
            };
            
            return (
              <TeamLeadSection
                key={team.team_lead_code}
                teamLead={teamLeadEmployee as import('@/lib/api').Employee}
                members={team.employees}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-lg text-muted-foreground">No teams found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
}