import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, User, Mail, Briefcase, Clock, Users, Save, X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getMyProfile, updateMyProfile, updateMyTechnicalSkills, getAvailableManagers } from "@/lib/api";

interface Employee {
  employee_code: string;
  employee_name: string;
  current_role: string;
  shift: string;
  experience_years: number;
  contact_email: string;
  reporting_manager: string;
  raw_technical_skills: string;
  skills: {
    structural_design: string[];
    electrical_design: string[];
    coordination: string[];
  };
}

interface Manager {
  employee_code: string;
  employee_name: string;
  current_role: string;
}

export default function EmployeeProfileEdit() {
  const { id: employeeCode } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [availableManagers, setAvailableManagers] = useState<Manager[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    employee_name: "",
    current_role: "",
    shift: "",
    experience_years: 0,
    contact_email: "",
    reporting_manager: "",
    raw_technical_skills: "",
  });
  
  const [skills, setSkills] = useState({
    structural_design: [] as string[],
    electrical_design: [] as string[],
    coordination: [] as string[],
  });
  
  const [newSkill, setNewSkill] = useState({
    category: "structural_design" as keyof typeof skills,
    skill: "",
  });

  useEffect(() => {
    console.log('🔍 EmployeeProfileEdit - URL Parameters:', { id: employeeCode });
    if (employeeCode) {
      loadProfileData();
    } else {
      console.error('❌ No employee code provided in URL');
      toast({
        title: "Error",
        description: "No employee code provided. Please navigate from the employee directory.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [employeeCode]);

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      
      // Load employee profile and available managers in parallel
      const [profileData, managersData] = await Promise.all([
        getMyProfile(),
        getAvailableManagers(),
      ]);
      
      console.log('🔍 Managers data received:', managersData);
      
      if (profileData.success) {
        const employeeData = profileData.data;
        console.log('🔍 Profile data received:', employeeData);
        console.log('🔍 Skills data:', employeeData.skills);
        console.log('🔍 Technical skills data:', employeeData.technical_skills);
        
        setEmployee(employeeData);
        
        // Set form data
        setFormData({
          employee_name: employeeData.employee_name || "",
          current_role: employeeData.current_role || "",
          shift: employeeData.shift || "",
          experience_years: employeeData.experience_years || 0,
          contact_email: employeeData.contact_email || "",
          reporting_manager: employeeData.reporting_manager || "",
          raw_technical_skills: employeeData.raw_technical_skills || "",
        });
        
        // Set skills - handle multiple possible skill field structures
        let skillsData: {
          structural_design?: string[];
          electrical_design?: string[];
          coordination?: string[];
          technical?: any;
          software?: string[];
          soft?: string[];
          languages?: string[];
          certifications?: string[];
        } = {};
        
        console.log('🔍 All employee data keys:', Object.keys(employeeData));
        
        // Try different possible field names and structures
        if (employeeData.skills && typeof employeeData.skills === 'object') {
          console.log('🔍 Using skills field:', employeeData.skills);
          
          const skillsObj = employeeData.skills as any;
          
          // Check if it's the new structure with structural_design, electrical_design, coordination
          if (skillsObj.structural_design || skillsObj.electrical_design || skillsObj.coordination) {
            skillsData = {
              structural_design: skillsObj.structural_design || [],
              electrical_design: skillsObj.electrical_design || [],
              coordination: skillsObj.coordination || []
            };
          } 
          // Check if it's the old structure with technical, software, etc.
          else if (skillsObj.technical || skillsObj.software || skillsObj.soft) {
            skillsData = {
              structural_design: skillsObj.technical?.structural_design || skillsObj.software || [],
              electrical_design: skillsObj.technical?.electrical_design || skillsObj.software || [],
              coordination: skillsObj.soft || []
            };
          }
          // Fallback - try to extract any arrays
          else {
            skillsData = {
              structural_design: Array.isArray(skillsObj.structural_design) ? skillsObj.structural_design : [],
              electrical_design: Array.isArray(skillsObj.electrical_design) ? skillsObj.electrical_design : [],
              coordination: Array.isArray(skillsObj.coordination) ? skillsObj.coordination : []
            };
          }
        } else if (employeeData.technical_skills && typeof employeeData.technical_skills === 'object') {
          console.log('🔍 Using technical_skills field:', employeeData.technical_skills);
          skillsData = employeeData.technical_skills as any;
        } else if (employeeData.skills_structural_design || employeeData.skills_electrical_design || employeeData.skills_coordination) {
          // Handle flat skill structure
          skillsData = {
            structural_design: employeeData.skills_structural_design || [],
            electrical_design: employeeData.skills_electrical_design || [],
            coordination: employeeData.skills_coordination || []
          };
        }
        
        console.log('🔍 Final skills data to set:', skillsData);
        
        const finalSkills = {
          structural_design: Array.isArray(skillsData.structural_design) ? skillsData.structural_design : [],
          electrical_design: Array.isArray(skillsData.electrical_design) ? skillsData.electrical_design : [],
          coordination: Array.isArray(skillsData.coordination) ? skillsData.coordination : [],
        };
        
        console.log('🔍 Final skills array:', finalSkills);
        setSkills(finalSkills);
      }
      
      setAvailableManagers(managersData);
    } catch (error) {
      console.error("Error loading profile data:", error);
      toast({
        title: "Error",
        description: "Failed to load profile data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleAddSkill = () => {
    if (newSkill.skill.trim()) {
      setSkills(prev => ({
        ...prev,
        [newSkill.category]: [...prev[newSkill.category], newSkill.skill.trim()],
      }));
      setNewSkill(prev => ({ ...prev, skill: "" }));
      setHasChanges(true);
    }
  };

  const handleRemoveSkill = (category: keyof typeof skills, skillToRemove: string) => {
    setSkills(prev => ({
      ...prev,
      [category]: prev[category].filter(skill => skill !== skillToRemove),
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      toast({
        title: "No Changes",
        description: "No changes to save.",
      });
      return;
    }

    try {
      setIsSaving(true);
      
      // Update basic profile
      const profileUpdate = { ...formData };
      Object.keys(profileUpdate).forEach(key => {
        if (profileUpdate[key as keyof typeof profileUpdate] === "") {
          delete profileUpdate[key as keyof typeof profileUpdate];
        }
      });
      
      const profileResponse = await updateMyProfile(profileUpdate);
      
      // Update technical skills
      const skillsResponse = await updateMyTechnicalSkills(skills);
      
      if (profileResponse.success && skillsResponse.success) {
        toast({
          title: "Success!",
          description: "Profile updated successfully.",
        });
        
        // Handle team change notification
        if (profileResponse.team_change) {
          toast({
            title: "Team Changed",
            description: profileResponse.team_change.message,
          });
        }
        
        setHasChanges(false);
        
        // Navigate back to profile view
        setTimeout(() => {
          navigate(`/employees/${employeeCode}`, { 
            state: { from: 'profile-edit', profileUpdated: true } 
          });
        }, 1500);
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      const confirmLeave = window.confirm("You have unsaved changes. Are you sure you want to leave?");
      if (!confirmLeave) return;
    }
    
    navigate(`/employees/${employeeCode}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Employee not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Profile
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Profile</h1>
            <p className="text-muted-foreground">
              Employee Code: {employee.employee_code}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee_name">Full Name</Label>
              <Input
                id="employee_name"
                name="employee_name"
                value={formData.employee_name}
                onChange={(e) => handleInputChange("employee_name", e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => handleInputChange("contact_email", e.target.value)}
                placeholder="your.email@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="current_role">Current Role</Label>
              <Input
                id="current_role"
                name="current_role"
                value={formData.current_role}
                onChange={(e) => handleInputChange("current_role", e.target.value)}
                placeholder="Your current role"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="shift">Shift</Label>
              <Select value={formData.shift} onValueChange={(value) => handleInputChange("shift", value)} name="shift">
                <SelectTrigger id="shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Day">Day</SelectItem>
                  <SelectItem value="Night">Night</SelectItem>
                  <SelectItem value="Rotational">Rotational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="experience_years">Experience (Years)</Label>
              <Input
                id="experience_years"
                name="experience_years"
                type="number"
                step="0.1"
                value={formData.experience_years}
                onChange={(e) => handleInputChange("experience_years", parseFloat(e.target.value) || 0)}
                placeholder="Years of experience"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Reporting Manager</Label>
              <Select 
                value={formData.reporting_manager} 
                onValueChange={(value) => handleInputChange("reporting_manager", value)}
                name="reporting_manager"
              >
                <SelectTrigger id="reporting_manager">
                  <SelectValue placeholder="Select reporting manager" />
                </SelectTrigger>
                <SelectContent>
                  {availableManagers.map((manager) => {
                    console.log('🔍 Rendering manager:', manager);
                    return (
                      <SelectItem key={manager.employee_code} value={manager.employee_code}>
                        {manager.employee_name} ({manager.employee_code}) - {manager.current_role}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Technical Skills
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Skill */}
          <div className="flex gap-2">
            <Select 
              value={newSkill.category} 
              onValueChange={(value) => setNewSkill(prev => ({ ...prev, category: value as keyof typeof skills }))}
              name="skill_category"
            >
              <SelectTrigger id="skill_category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="structural_design">Structural Design</SelectItem>
                <SelectItem value="electrical_design">Electrical Design</SelectItem>
                <SelectItem value="coordination">Coordination</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              id="skill_name"
              name="skill_name"
              placeholder="Enter skill name"
              value={newSkill.skill}
              onChange={(e) => setNewSkill(prev => ({ ...prev, skill: e.target.value }))}
              onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
              className="flex-1"
            />
            
            <Button onClick={handleAddSkill}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          <Separator />

          {/* Skills by Category */}
          {Object.entries(skills).map(([category, skillList]) => (
            <div key={category} className="space-y-2">
              <Label className="text-base font-medium">
                {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Label>
              <div className="flex flex-wrap gap-2">
                {skillList.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {skill}
                    <button
                      onClick={() => handleRemoveSkill(category as keyof typeof skills, skill)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {skillList.length === 0 && (
                  <p className="text-sm text-muted-foreground">No skills added yet.</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Raw Technical Skills Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Skills Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="raw_technical_skills">Detailed Skills Description</Label>
            <Textarea
              id="raw_technical_skills"
              name="raw_technical_skills"
              value={formData.raw_technical_skills}
              onChange={(e) => handleInputChange("raw_technical_skills", e.target.value)}
              placeholder="Provide a detailed description of your technical skills, experience, and expertise..."
              rows={6}
            />
            <p className="text-sm text-muted-foreground">
              This detailed description helps in better task matching and recommendations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
