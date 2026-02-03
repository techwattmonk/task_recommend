import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Briefcase, Clock, Users, Save, Plus, Trash2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getAvailableManagers, registerNewEmployee } from "@/lib/api";

interface Manager {
  employee_code: string;
  employee_name: string;
  current_role: string;
}

interface NewEmployeeData {
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

export default function EmployeeRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [availableManagers, setAvailableManagers] = useState<Manager[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredEmployeeCode, setRegisteredEmployeeCode] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    employee_code: "",
    employee_name: "",
    current_role: "",
    shift: "",
    experience_years: 0,
    contact_email: "",
    reporting_manager: "",
    raw_technical_skills: "",
  });

  // Skills state
  const [skills, setSkills] = useState({
    structural_design: [],
    electrical_design: [],
    coordination: [],
  });

  // New skill input state
  const [newSkill, setNewSkill] = useState({
    category: "",
    skill: "",
  });

  // Load available managers on component mount
  useEffect(() => {
    loadAvailableManagers();
  }, []);

  const loadAvailableManagers = async () => {
    try {
      const managersData = await getAvailableManagers();
      setAvailableManagers(managersData);
    } catch (error) {
      console.error("Error loading managers:", error);
    }
  };

  const handleInputChange = (field: keyof NewEmployeeData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSkillChange = (category: keyof typeof skills, skillList: string[]) => {
    setSkills(prev => ({
      ...prev,
      [category]: skillList
    }));
  };

  const handleAddSkill = () => {
    if (newSkill.category && newSkill.skill) {
      setSkills(prev => ({
        ...prev,
        [newSkill.category]: [...prev[newSkill.category as keyof typeof skills], newSkill.skill]
      }));
      
      // Clear new skill input
      setNewSkill({ category: "", skill: "" });
      
      toast({
        title: "Skill Added",
        description: `${newSkill.skill} added to ${newSkill.category.replace('_', ' ')}`,
      });
    }
  };

  const handleRemoveSkill = (category: keyof typeof skills, skillToRemove: string) => {
    setSkills(prev => ({
      ...prev,
      [category]: prev[category].filter(skill => skill !== skillToRemove)
    }));
  };

  const handleRegister = async () => {
    if (!formData.employee_code || !formData.employee_name || !formData.current_role || !formData.contact_email || !formData.reporting_manager) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in All required fields.",
        variant: "destructive",
      });
      return;
    }

    // Validate skills
    const hasSkills = Object.values(skills).some(skillArray => skillArray.length > 0);
    if (!hasSkills) {
      toast({
        title: "No Skills Added",
        description: "Please add at least one technical skill.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Prepare employee data with skills
      const employeeData = {
        ...formData,
        skills: skills
      };
      
      // Create new employee profile
      const response = await registerNewEmployee(employeeData);
      
      if (response.success) {
        setRegisteredEmployeeCode(formData.employee_code);
        setIsRegistered(true);
        
        toast({
          title: "Registration Successful!",
          description: `Employee ${formData.employee_name} has been registered and added to ${formData.reporting_manager}'s team.`,
        });
      } else {
        throw new Error(response.message || "Registration failed");
      }
    } catch (error) {
      console.error("Error registering employee:", error);
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Failed to register employee. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewProfile = () => {
    navigate(`/employees/${registeredEmployeeCode}`);
  };

  const handleRegisterAnother = () => {
    // Reset form
    setFormData({
      employee_code: "",
      employee_name: "",
      current_role: "",
      shift: "",
      experience_years: 0,
      contact_email: "",
      reporting_manager: "",
      raw_technical_skills: "",
    });
    setSkills({
      structural_design: [],
      electrical_design: [],
      coordination: [],
    });
    setIsRegistered(false);
    setRegisteredEmployeeCode("");
  };

  // Show registration success or form
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/employees')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Register New Employee</h1>
            <p className="text-muted-foreground">
              Add a new employee to the system and assign them to a team
            </p>
          </div>
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
              <Label htmlFor="employee_code">Employee Code *</Label>
              <Input
                id="employee_code"
                name="employee_code"
                value={formData.employee_code}
                onChange={(e) => handleInputChange("employee_code", e.target.value)}
                placeholder="e.g., 1050"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="employee_name">Full Name *</Label>
              <Input
                id="employee_name"
                name="employee_name"
                value={formData.employee_name}
                onChange={(e) => handleInputChange("employee_name", e.target.value)}
                placeholder="Enter employee's full name"
                required
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => handleInputChange("contact_email", e.target.value)}
                placeholder="employee.email@example.com"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="current_role">Current Role *</Label>
              <Input
                id="current_role"
                name="current_role"
                value={formData.current_role}
                onChange={(e) => handleInputChange("current_role", e.target.value)}
                placeholder="e.g., Structural Designer"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="shift">Shift *</Label>
              <Select value={formData.shift} onValueChange={(value) => handleInputChange("shift", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Day">Day</SelectItem>
                  <SelectItem value="Night">Night</SelectItem>
                  <SelectItem value="Rotational">Rotational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>Reporting Manager *</Label>
              <Select 
                value={formData.reporting_manager} 
                onValueChange={(value) => handleInputChange("reporting_manager", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reporting manager" />
                </SelectTrigger>
                <SelectContent>
                  {availableManagers.map((manager) => (
                    <SelectItem key={manager.employee_code} value={manager.employee_code}>
                      {manager.employee_name} ({manager.employee_code}) - {manager.current_role}
                    </SelectItem>
                  ))}
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
              <SelectTrigger id="skill_category" className="w-48">
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
                      <Trash2 className="h-3 w-3" />
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
        <CardContent className="space-y-2">
          <Label htmlFor="raw_technical_skills">Detailed Skills Description</Label>
          <Textarea
            id="raw_technical_skills"
            name="raw_technical_skills"
            value={formData.raw_technical_skills}
            onChange={(e) => handleInputChange("raw_technical_skills", e.target.value)}
            placeholder="Provide a detailed description of the employee's technical skills, experience, and expertise..."
            rows={6}
          />
          <p className="text-sm text-muted-foreground">
            This detailed description helps in better task matching and recommendations.
          </p>
        </CardContent>
      </Card>

      {/* Register Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Ready to Register?</h3>
              <p className="text-sm text-muted-foreground">
                The employee will be automatically added to their reporting manager's team.
              </p>
            </div>
            <Button 
              onClick={handleRegister} 
              disabled={isLoading}
              size="lg"
            >
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Registering..." : "Register Employee"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
