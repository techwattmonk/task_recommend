import { useState, useEffect, useRef } from "react";
import { Sparkles, Users, ArrowRight, Loader2, CheckCircle, Search, Eye, Upload, FileText, X, Briefcase, Plus, FolderOpen, ChevronDown, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getEmployeesGroupedByTeamLead, getEmployeeRecommendations, getEmployeeTaskStats, getEmployeeTasks, assignTaskToEmployee, getUnassignedFiles, smartUploadAndAssign, getFileStageHistory } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Employee, PermitFile, Recommendation, StageHistoryEntry, TeamLeadGroup, Task } from "@/types";
import { EmployeeDetailModal } from "@/components/employees/EmployeeDetailModal";

export default function SmartRecommender() {
  const [step, setStep] = useState<'select-lead' | 'view-tasks'>('select-lead');
  const [teams, setTeams] = useState<TeamLeadGroup[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamLeadGroup | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [expandedTaskCards, setExpandedTaskCards] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("team-members");
  type TeamsCacheValue = TeamLeadGroup[] | number;
  const [teamsDataCache, setTeamsDataCache] = useState<Map<string, TeamsCacheValue>>(new Map());
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{id: string, name: string} | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUnassignedFiles, setShowUnassignedFiles] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  type AutoAssignedTeamLead = { name?: string };
  type AutoAssignedEmployee = { employee_name?: string; employee_code?: string };
  type EmployeeTaskStatsResponse = {
    total_tasks?: number;
    active_tasks?: number;
    completed_tasks?: number;
  };

  type SmartUploadAssignResult = {
    file_id: string;
    resumed?: boolean;
    team_lead?: AutoAssignedTeamLead | null;
    employee?: AutoAssignedEmployee | null;
    task_id?: string | null;
    team_lead_name?: string;
    employee_name?: string;
  };

  type UnassignedFile = PermitFile & {
    current_stage?: string;
  };

  const [autoAssignedTeamLead, setAutoAssignedTeamLead] = useState<AutoAssignedTeamLead | null>(null);
  const [autoAssignedEmployee, setAutoAssignedEmployee] = useState<AutoAssignedEmployee | null>(null);
  const [autoAssignedTaskId, setAutoAssignedTaskId] = useState<string | null>(null);
  const [hasComputed, setHasComputed] = useState(false);
  const [lastTaskContext, setLastTaskContext] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeTasks, setEmployeeTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [employeeTaskCounts, setEmployeeTaskCounts] = useState<Map<string, { total: number, active: number, completed: number }>>(new Map());
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [employeesWithTasks, setEmployeesWithTasks] = useState<Set<string>>(new Set());
  const [loadingEmployeeTasks, setLoadingEmployeeTasks] = useState<Set<string>>(new Set());
  const [unassignedFiles, setUnassignedFiles] = useState<UnassignedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UnassignedFile | null>(null);
  const [fileTaskDescription, setFileTaskDescription] = useState('');
  const [showFileAssignment, setShowFileAssignment] = useState(false);
  const [fileAssignmentEmployees, setFileAssignmentEmployees] = useState<Employee[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [employeesWithSkill, setEmployeesWithSkill] = useState<Employee[]>([]);

  const [stageGateDialogOpen, setStageGateDialogOpen] = useState(false);
  const [stageGateDialogTitle, setStageGateDialogTitle] = useState<string>("Stage order warning");
  const [stageGateDialogDescription, setStageGateDialogDescription] = useState<string>("");
  const pendingStageGateActionRef = useRef<null | (() => Promise<void>)>(null);

  // Helper function to extract skills from various data structures
  const extractSkills = (skills: unknown): string[] => {
    if (!skills) return [];
    
    // If skills is an array, return it directly
    if (Array.isArray(skills)) {
      return skills;
    }
    
    // If skills is an object with nested arrays, flatten them
    if (typeof skills === 'object') {
      const skillArrays = Object.values(skills).filter(Array.isArray);
      return skillArrays.flat() as string[];
    }
    
    return [];
  };

  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  // Type assertion for Employee with task properties
  type EmployeeWithTasks = Employee & {
    active_task_count?: number;
    total_task_count?: number;
    current_tasks?: Task[];
    tasks_loaded?: boolean;
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const detectRequestedStage = (taskDesc: string): 'PRELIMS' | 'PRODUCTION' | 'QC' | null => {
    const descriptionLower = (taskDesc || '').toLowerCase();
    if (!descriptionLower.trim()) return null;

    const stageKeywords: Record<'PRELIMS' | 'PRODUCTION' | 'QC', string[]> = {
      PRELIMS: [
        'arora', 'sales proposal', 'salesproposal', 'sales', 'proposal',
        'cad', 'layout', 'preliminary', 'prelim', 'initial', 'basic',
        'draft', 'sketch', 'plan', 'design review', 'concept'
      ],
      PRODUCTION: [
        'structural', 'electrical', 'production', 'manufacturing',
        'fabrication', 'construction', 'implementation', 'build',
        'structural design', 'electrical design', 'drawing', 'detailing'
      ],
      QC: [
        'quality', 'analytics', 'analysis', 'review', 'inspection',
        'testing', 'audit', 'check', 'verification', 'validation',
        'quality control', 'quality assurance', 'qa', 'qc'
      ]
    };

    const scoreFor = (keywords: string[]) => {
      let score = 0;
      for (const keyword of keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        const matches = descriptionLower.match(regex);
        score += matches ? matches.length : 0;
      }
      return score;
    };

    const scores = {
      PRELIMS: scoreFor(stageKeywords.PRELIMS),
      PRODUCTION: scoreFor(stageKeywords.PRODUCTION),
      QC: scoreFor(stageKeywords.QC),
    };

    const best = (Object.keys(scores) as Array<keyof typeof scores>)
      .sort((a, b) => scores[b] - scores[a])[0];

    return scores[best] > 0 ? (best as 'PRELIMS' | 'PRODUCTION' | 'QC') : null;
  };

  const normalizeStageForOrder = (rawStage: string | null | undefined): 'PRELIMS' | 'PRODUCTION' | 'QC' | null => {
    if (!rawStage) return null;
    const s = String(rawStage).toUpperCase();
    if (s === 'PRELIMS') return 'PRELIMS';
    if (s === 'PRODUCTION' || s === 'COMPLETED') return 'PRODUCTION';
    if (s === 'QC' || s === 'DELIVERED') return 'QC';
    return null;
  };

  const openStageGateDialog = (title: string, description: string, action: () => Promise<void>) => {
    setStageGateDialogTitle(title);
    setStageGateDialogDescription(description);
    pendingStageGateActionRef.current = action;
    setStageGateDialogOpen(true);
  };

  const runWithStageGating = async (fileId: string, taskDesc: string, action: () => Promise<void>) => {
    const requestedStage = detectRequestedStage(taskDesc);
    if (!requestedStage) {
      await action();
      return;
    }

    try {
      const history = await getFileStageHistory(fileId);
      const stageHistory = history?.stage_history || [];
      const currentStageNormalized = normalizeStageForOrder(history?.current_stage);

      const hasCompleted = (stage: string) =>
        (stageHistory as StageHistoryEntry[]).some((h) => String(h.stage).toUpperCase() === stage && String(h.status).toUpperCase() === 'COMPLETED');

      let violationMessage: string | null = null;

      if (requestedStage === 'PRODUCTION' && !hasCompleted('PRELIMS')) {
        violationMessage = 'This file does not show PRELIMS as completed. PRODUCTION work should typically start only after PRELIMS is completed.';
      }

      if (requestedStage === 'QC' && !(hasCompleted('PRODUCTION') || hasCompleted('COMPLETED'))) {
        violationMessage = 'This file does not show PRODUCTION as completed. QC work should typically start only after PRODUCTION is completed.';
      }

      const stageOrder: Record<'PRELIMS' | 'PRODUCTION' | 'QC', number> = { PRELIMS: 0, PRODUCTION: 1, QC: 2 };
      if (currentStageNormalized && stageOrder[requestedStage] < stageOrder[currentStageNormalized]) {
        violationMessage = `This file appears to already be at ${currentStageNormalized}. You are assigning a ${requestedStage} task (earlier stage).`;
      }

      if (violationMessage) {
        openStageGateDialog(
          'Stage order warning',
          `${violationMessage}\n\nDo you want to continue anyway?`,
          action
        );
        return;
      }
    } catch (e) {
      console.warn('Stage gating check failed; proceeding without gating confirmation.', e);
    }

    await action();
  };

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTeams uses local cache flags; keep initial load mount-only to preserve current fetch behavior
  }, []);

  useEffect(() => {
    // Load tasks for visible employees when team changes
    if (selectedTeam) {
      loadVisibleEmployeeTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep this effect keyed only on selectedTeam (avoid refetching when internal helper refs/sets change)
  }, [selectedTeam]);

  useEffect(() => {
    // Load unassigned files when component mounts
    loadUnassignedFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unassigned files are loaded once on mount by design
  }, []);

  const loadTeams = async (forceRefresh = false) => {
    // Prevent duplicate calls
    if (isLoadingTeams && !forceRefresh) {
      console.log('[API] Teams already loading, skipping duplicate call...');
      return;
    }

    // Check cache first
    const cacheKey = 'all_teams_data';
    const cachedData = teamsDataCache.get(cacheKey);
    const cacheTime = teamsDataCache.get(`${cacheKey}_time`);
    
    // Use cache if less than 2 minutes old and not forcing refresh
    if (!forceRefresh && Array.isArray(cachedData) && typeof cacheTime === 'number' && (Date.now() - cacheTime) < 120000) {
      console.log('[API] Using cached teams data');
      setTeams(cachedData as TeamLeadGroup[]);
      return;
    }

    setIsLoadingTeams(true);
    setIsLoading(true);
    
    try {
      console.log('[API] Loading teams...');
      const response = await getEmployeesGroupedByTeamLead();
      console.log(`[API] Loaded ${response.length} teams`);
      
      const filteredTeams = response.map(team => ({
        ...team,
        employees: team.employees.map(employee => ({
          ...employee,
          active_task_count: 0,
          total_task_count: 0,
          current_tasks: [],
          tasks_loaded: false
        }))
      }));
      
      setTeams(filteredTeams);
      
      const cacheKey = 'all_teams';
      const newCache = new Map(teamsDataCache);
      newCache.set(cacheKey, filteredTeams);
      newCache.set(`${cacheKey}_time`, Date.now());
      setTeamsDataCache(newCache);
      
      console.log(`[API] Teams loaded successfully without individual task queries`);
    } catch (error) {
      console.error('[ERROR] Failed to load teams:', error);
      toast({
        title: "Error loading teams",
        description: "Failed to load team data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTeams(false);
      setIsLoading(false);
    }
  };

  const handleRefreshTeams = async () => {
    console.log('[API] Manual refresh requested, clearing cache...');
    setTeamsDataCache(new Map()); // Clear cache
    await loadTeams(true); // Force refresh
  };

  const handleSelectTeam = (team: TeamLeadGroup) => {
    setSelectedTeam(team);
    setStep('view-tasks');
    // Don't reload teams data - it's already loaded and cached
    console.log(`[API] Selected team: ${team.team_lead_name}, using cached data`);
  };

  const handleTaskDescriptionChange = (value: string) => {
    setTaskDescription(value);
    // Clear recommendations if task description changes
    if (hasComputed && value !== lastTaskContext.split('|')[0]) {
      setRecommendations([]);
      setHasComputed(false);
      setLastTaskContext('');
    }
  };

  const handleFileUpload = (file: {id: string, name: string}) => {
    setUploadedFile(file);
    // Clear recommendations if file changes
    if (hasComputed) {
      setRecommendations([]);
      setHasComputed(false);
      setLastTaskContext('');
    }
  };

  const handleTeamChange = (team: TeamLeadGroup | null) => {
    setSelectedTeam(team);
    // Clear recommendations if team changes
    if (hasComputed) {
      setRecommendations([]);
      setHasComputed(false);
      setLastTaskContext('');
    }
  };

  const handleViewEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
    setIsLoadingTasks(true);
    
    try {
      const tasksData = await getEmployeeTasks(employee.employee_code);
      setEmployeeTasks(tasksData.tasks || []);
    } catch (error) {
      console.error('Failed to load employee tasks:', error);
      setEmployeeTasks([]);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
    setEmployeeTasks([]);
  };

  const handleAssignTask = async (employee: Employee) => {
    if (!taskDescription.trim()) {
      toast({
        title: "Please enter a task description",
        variant: "destructive",
      });
      return;
    }

    const finalTaskDescription = uploadedFile && uploadedFile.id
      ? `Review permit file ${uploadedFile.id} - ${taskDescription}`
      : taskDescription;

    const assignedBy = localStorage.getItem('employeeCode') || '1030';

    const performAssignment = async () => {
      console.log(`[DEBUG] Assigning task to ${employee.employee_code}: ${finalTaskDescription}`);

      if (uploadedFile && uploadedFile.id) {
        await assignTaskToEmployee(employee.employee_code, finalTaskDescription, assignedBy, uploadedFile.id);
      } else {
        await assignTaskToEmployee(employee.employee_code, finalTaskDescription, assignedBy);
      }

      toast({
        title: "Task Assigned!",
        description: `Task assigned to ${employee.employee_name}${uploadedFile && uploadedFile.id ? ` for file ${uploadedFile.id}` : ''}`,
      });

      const refreshPromises = [];

      if (hasComputed) {
        refreshPromises.push(handleGetRecommendations());
      }

      refreshPromises.push(loadEmployeeTasks(employee));
      await Promise.all(refreshPromises);

      setTeams([...teams]);
    };

    try {
      if (uploadedFile && uploadedFile.id) {
        await runWithStageGating(uploadedFile.id, finalTaskDescription, performAssignment);
      } else {
        await performAssignment();
      }
    } catch (error) {
      console.error('[ERROR] Task assignment failed:', error);
      toast({
        title: "Error assigning task",
        variant: "destructive",
      });
    }
  };

  const handleAssignTaskFromModal = () => {
    // Function kept for modal compatibility but does nothing
    console.log('Task assignment disabled - showing workload info instead');
  };

  const toggleTaskCardExpansion = (employeeCode: string) => {
    setExpandedTaskCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeCode)) {
        newSet.delete(employeeCode);
      } else {
        newSet.add(employeeCode);
      }
      return newSet;
    });
  };

  const toggleSkillsExpansion = (employeeCode: string) => {
    setExpandedSkills(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeCode)) {
        newSet.delete(employeeCode);
      } else {
        newSet.add(employeeCode);
      }
      return newSet;
    });
  };

  const loadEmployeeTasks = async (employee: Employee) => {
    // Skip if already loaded or currently loading
    if (employeesWithTasks.has(employee.employee_code) || loadingEmployeeTasks.has(employee.employee_code)) {
      return;
    }

    try {
      console.log(`[API] Loading tasks for employee ${employee.employee_code}...`);
      
      // Set loading state
      setLoadingEmployeeTasks(prev => new Set(prev).add(employee.employee_code));
      
      // Load task statistics and current tasks in parallel
      const [taskStats, taskAssignment] = await Promise.all([
        getEmployeeTaskStats(employee.employee_code),
        getEmployeeTasks(employee.employee_code)
      ]);
      
      // Update employee with task data
      type TaskFromApi = Task & {
        original_filename?: string;
        created_at?: string;
        date_assigned?: string;
        completion_time?: string;
        file_id?: string | null;
      };

      const tasksFromApi = (taskAssignment?.tasks || []) as TaskFromApi[];

      const updatedEmployee = {
        ...employee,
        active_task_count: (asRecord(taskStats).active_tasks as number) || 0,
        total_task_count: (asRecord(taskStats).total_tasks as number) || 0,
        tasks_loaded: true,
        current_tasks: tasksFromApi.length > 0
          ? tasksFromApi.map(task => {
              // Use the enhanced title from backend, fallback to description or task_assigned
              const getTaskTitle = (t: TaskFromApi) => {
                // Prefer the enhanced title from backend (should now include manual titles like "structural Loading")
                if (t.title && 
                    t.title !== 'Untitled Task' && 
                    t.title !== 'Current Assigned Task' && 
                    t.title !== 'Unknown Task') {
                  return t.title;
                }
                
                // Fallback to original filename with context
                if (t.original_filename && t.original_filename !== 'General Task') {
                  const taskDesc = (t.description || '').toLowerCase();
                  if (taskDesc.includes('review') || taskDesc.includes('prelims')) {
                    return `Review: ${t.original_filename}`;
                  } else if (taskDesc.includes('production') || taskDesc.includes('produce')) {
                    return `Production: ${t.original_filename}`;
                  } else if (taskDesc.includes('qc') || taskDesc.includes('quality')) {
                    return `QC: ${t.original_filename}`;
                  } else {
                    return `Task: ${t.original_filename}`;
                  }
                }
                
                // Final fallback to description or task_assigned
                return t.description || t.task_assigned || 'Untitled Task';
              };
              
              return {
                task_id: task.task_id || `TASK-${Math.random().toString(36).substr(2, 9)}`,
                title: getTaskTitle(task),
                description: task.description || task.task_assigned || 'No description',
                status: task.status || 'ASSIGNED',
                assigned_at: task.assigned_at || task.created_at || new Date().toISOString(),
                due_date: task.completion_time || task.date_assigned || '',
                skills_required: [],
                file_id: task.file_id || null
              };
            })
          : []
      };
      
      // Update teams state with the updated employee
      setTeams(prevTeams => 
        prevTeams.map(team => ({
          ...team,
          employees: team.employees.map(emp => 
            emp.employee_code === employee.employee_code ? updatedEmployee : emp
          )
        }))
      );
      
      // Track that this employee's tasks are loaded
      setEmployeesWithTasks(prev => new Set(prev).add(employee.employee_code));
      
      console.log(`[DEBUG] Processed ${(employee as EmployeeWithTasks).current_tasks.length} tasks for ${employee.employee_code}`);
    } catch (error) {
      console.error(`[ERROR] Failed to load tasks for ${employee.employee_code}:`, error);
      
      // Mark as loaded even if failed to avoid retry loops
      setEmployeesWithTasks(prev => new Set(prev).add(employee.employee_code));
    } finally {
      // Remove loading state
      setLoadingEmployeeTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(employee.employee_code);
        return newSet;
      });
    }
  };

  const loadVisibleEmployeeTasks = async () => {
    // Load tasks for employees currently visible in viewport
    if (!selectedTeam) return;
    
    const visibleEmployees = selectedTeam.employees.slice(0, 12); // Load first 12 employees
    const employeesToLoad = visibleEmployees.filter(emp => !employeesWithTasks.has(emp.employee_code));
    
    if (employeesToLoad.length === 0) return;
    
    console.log(`[API] Loading tasks for ${employeesToLoad.length} visible employees...`);
    
    // Load in parallel but with concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < employeesToLoad.length; i += concurrencyLimit) {
      const batch = employeesToLoad.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(emp => loadEmployeeTasks(emp)));
    }
  };

  const loadUnassignedFiles = async () => {
    try {
      setIsLoadingFiles(true);
      const response = await getUnassignedFiles();
      setUnassignedFiles((response as UnassignedFile[]) || []);  // API now returns array directly
    } catch (error) {
      console.error('Failed to load unassigned files:', error);
      toast({
        title: "Error loading files",
        description: "Failed to load unassigned files",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileAssignment = (file: UnassignedFile) => {
    setSelectedFile(file);
    setFileTaskDescription(`Review and process ${file.file_id} - ${file.file_name || 'permit file'}`);
    setShowFileAssignment(true);
    
    // Load all employees for assignment
    if (teams.length > 0) {
      const allEmployees = teams.flatMap(team => team.employees);
      setFileAssignmentEmployees(allEmployees);
    }
  };

  const handleAssignFileTask = async (employee: Employee) => {
    if (!selectedFile || !fileTaskDescription.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a task description",
        variant: "destructive",
      });
      return;
    }

    try {
      const assignedBy = localStorage.getItem('employeeCode') || '1030';
      
      const result = await assignTaskToEmployee(employee.employee_code, fileTaskDescription, assignedBy, selectedFile.file_id);
      
      toast({
        title: "Task Assigned!",
        description: `File ${selectedFile.file_id} assigned to ${employee.employee_name}`,
      });
      
      // Show validation warning if present
      if ((result as any)?.validation_warning) {
        setTimeout(() => {
          toast({
            title: "Stage Validation Warning",
            description: (result as any).validation_warning,
            variant: "destructive",
            duration: 5000,
          });
        }, 1000);
      }

      // Close dialog and reset
      setShowFileAssignment(false);
      setSelectedFile(null);
      setFileTaskDescription('');
      
      // Refresh unassigned files
      await loadUnassignedFiles();
      
      // Refresh employee tasks if they're in current view
      if (selectedTeam) {
        const employeeInTeam = selectedTeam.employees.find(emp => emp.employee_code === employee.employee_code);
        if (employeeInTeam) {
          await loadEmployeeTasks(employeeInTeam);
        }
      }
      
    } catch (error) {
      console.error('Failed to assign file task:', error);
      toast({
        title: "Error assigning task",
        variant: "destructive",
      });
    }
  };

  const handleSkillClick = async (skill: string) => {
    try {
      setSelectedSkill(skill);
      setShowSkillModal(true);
      
      // Find all employees with this skill
      const allEmployees = teams.flatMap(team => team.employees);
      const matchingEmployees = allEmployees.filter(emp => {
        const skills = extractSkills(emp.technical_skills);
        return skills.some(s => 
          typeof s === 'string' && s.toLowerCase().includes(skill.toLowerCase())
        );
      });
      
      setEmployeesWithSkill(matchingEmployees);
    } catch (error) {
      console.error('Error finding employees with skill:', error);
      toast({
        title: "Error finding employees",
        description: "Could not find employees with this skill",
        variant: "destructive",
      });
    }
  };

  const loadTaskCounts = async (employees: (Employee | Recommendation)[]) => {
    const taskCounts = new Map();
    
    for (const emp of employees) {
      try {
        const stats = (await getEmployeeTaskStats(emp.employee_code)) as EmployeeTaskStatsResponse;
        taskCounts.set(emp.employee_code, {
          total: stats.total_tasks || 0,
          active: stats.active_tasks || 0,
          completed: stats.completed_tasks || 0
        });
      } catch (error) {
        console.error(`Failed to load task stats for ${emp.employee_code}:`, error);
        taskCounts.set(emp.employee_code, {
          total: 0,
          active: 0,
          completed: 0
        });
      }
    }
    
    setEmployeeTaskCounts(taskCounts);
  };

  const handleGetRecommendations = async () => {
    console.log('🔍 handleGetRecommendations called');
    console.log('📝 Task description:', taskDescription);
    console.log('👥 Selected team:', selectedTeam?.team_lead_code);
    
    if (!taskDescription.trim()) {
      toast({
        title: "Please enter a task description",
        variant: "destructive",
      });
      return;
    }

    // Remove file upload requirement for testing recommendations
    // Allow testing without file upload for better UX
    console.log('🚀 Starting recommendation request...');

    setIsLoadingRecommendations(true);
    try {
      // Use team lead filter to get team-specific recommendations
      const response = await getEmployeeRecommendations(
        taskDescription,
        selectedTeam?.team_lead_code || null, // Use selected team lead code
        10,
        0.3  // Lower threshold to get more matches
      );
      
      console.log('✅ Got recommendations:', response.length);
      console.log('✅ Recommendations data:', response);

      setRecommendations(response);
      setHasComputed(true);
      setLastTaskContext(taskDescription);
      
      // Switch to eligible employees tab to show recommendations
      setActiveTab("eligible-employees");
      
      // Auto-assign to best employee (first recommendation)
      if (response.length > 0) {
        const bestEmployee = response[0];
        console.log(`🎯 Auto-assigning task to best employee: ${bestEmployee.employee_name} (${bestEmployee.employee_code})`);
        
        try {
          const assignedBy = localStorage.getItem('employeeCode') || '1030';
          await assignTaskToEmployee(bestEmployee.employee_code, taskDescription, assignedBy);
          
          toast({
            title: "Task Auto-Assigned!",
            description: `Task assigned to ${bestEmployee.employee_name} (${bestEmployee.employee_code})`,
          });
        } catch (error) {
          console.error('[ERROR] Auto-assignment failed:', error);
          toast({
            title: "Auto-assignment failed",
            description: "Please assign manually from the list",
            variant: "destructive",
          });
        }
      }
      
      setStep('view-tasks');
    } catch (error) {
      toast({
        title: "Error getting recommendations",
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to get recommendations",
      });
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedPdfFile(file);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedPdfFile) {
      toast({
        title: "No file selected",
        description: "Please select a PDF file to upload",
        variant: "destructive",
      });
      return;
    }

    if (!taskDescription.trim()) {
      toast({
        title: "Please enter a task description",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const assignedBy = localStorage.getItem('employeeCode') || '1030';

      const result = (await smartUploadAndAssign(selectedPdfFile, taskDescription, assignedBy)) as SmartUploadAssignResult;

      setUploadedFile({
        id: result.file_id,
        name: selectedPdfFile.name,
      });

      setAutoAssignedTeamLead(result.team_lead || null);
      setAutoAssignedEmployee(result.employee || null);
      setAutoAssignedTaskId(result.task_id || null);

      toast({
        title: result.resumed ? "Workflow Resumed" : "Uploaded + Assigned",
        description: `File ${result.file_id} • Lead: ${result.team_lead_name || 'N/A'} • Employee: ${result.employee_name || 'N/A'}`,
      });

      setSelectedPdfFile(null);
    } catch (error) {
      toast({
        title: "Upload/assignment failed",
        description: error instanceof Error ? error.message : "Failed to upload/assign",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setSelectedPdfFile(null);
    setAutoAssignedTeamLead(null);
    setAutoAssignedEmployee(null);
    setAutoAssignedTaskId(null);
    // Clear recommendations if file is removed
    if (hasComputed) {
      setRecommendations([]);
      setHasComputed(false);
      setLastTaskContext('');
    }
  };

  const handleBackToTeams = () => {
    setStep('select-lead');
    setSelectedTeam(null);
    setTaskDescription("");
    setUploadedFile(null);
    setSelectedPdfFile(null);
    setRecommendations([]);
    setHasComputed(false);
    setLastTaskContext('');
    setEmployeeTaskCounts(new Map());
  };

  const handleStageGateCancel = () => {
    pendingStageGateActionRef.current = null;
    setStageGateDialogOpen(false);
  };

  const handleStageGateContinue = async () => {
    const action = pendingStageGateActionRef.current;
    pendingStageGateActionRef.current = null;
    setStageGateDialogOpen(false);
    if (action) {
      await action();
    }
  };

  const stageGateDialog = (
    <AlertDialog open={stageGateDialogOpen} onOpenChange={setStageGateDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{stageGateDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {stageGateDialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleStageGateCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleStageGateContinue}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (step === 'select-lead') {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        {stageGateDialog}
        {/* Page Header */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            System-Driven Assignment
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Smart Task Recommender
          </h1>
          <p className="text-lg text-muted-foreground">
            Upload a PDF and enter a task description. Team lead and employee are auto-selected.
          </p>
        </div>

        {/* System-driven Upload + Assign */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload & Auto-Assign
            </CardTitle>
            <CardDescription>
              State is detected from the first page of the PDF. Team lead selection is locked for the file lifetime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploadedFile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg border border-success bg-success/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">File ID: {uploadedFile.id}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {(autoAssignedTeamLead || autoAssignedEmployee || autoAssignedTaskId) && (
                  <div className="text-sm space-y-1">
                    {autoAssignedTeamLead?.name && (
                      <div>
                        <span className="text-muted-foreground">Team Lead:</span> {autoAssignedTeamLead.name}
                      </div>
                    )}
                    {autoAssignedEmployee?.employee_name && (
                      <div>
                        <span className="text-muted-foreground">Employee:</span> {autoAssignedEmployee.employee_name} ({autoAssignedEmployee.employee_code})
                      </div>
                    )}
                    {autoAssignedTaskId && (
                      <div>
                        <span className="text-muted-foreground">Task ID:</span> {autoAssignedTaskId}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {selectedPdfFile ? selectedPdfFile.name : "Click to select PDF file"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or drag and drop your file here
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="permit-file-upload-root"
                    name="permitFile"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Task Description</Label>
                  <Textarea
                    id="task-description-root"
                    name="taskDescription"
                    placeholder="e.g., Electrical design review for AZ residential permit set"
                    value={taskDescription}
                    onChange={(e) => handleTaskDescriptionChange(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {selectedPdfFile && (
                  <Button
                    onClick={handleUploadFile}
                    disabled={isUploading || !taskDescription.trim()}
                    className="w-full"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading & Assigning...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload & Auto-Assign
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Leads Grid (Monitoring Only) */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Card
                key={team.team_lead_code}
                className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all"
                onClick={() => handleSelectTeam(team)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{team.team_lead_name || team.team_lead_code}</CardTitle>
                      <p className="text-sm text-muted-foreground">#{team.team_lead_code}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{team.team_size} team members</span>
                    </div>
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Step 2: View Tasks
  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {stageGateDialog}
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={handleBackToTeams}>
          ← Back to Teams
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            View Task Status for {selectedTeam?.team_lead_name || selectedTeam?.team_lead_code}'s Team
          </h1>
          <p className="text-muted-foreground mt-1">
            {selectedTeam?.team_size} team members • Current workload distribution
          </p>
        </div>
      </div>

      {(autoAssignedTeamLead || autoAssignedEmployee || autoAssignedTaskId) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Latest System Assignment
            </CardTitle>
            <CardDescription>
              Team lead selection is system-driven based on detected state and load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {uploadedFile?.id && (
              <div>
                <span className="text-muted-foreground">File ID:</span> {uploadedFile.id}
              </div>
            )}
            {autoAssignedTeamLead?.name && (
              <div>
                <span className="text-muted-foreground">Team Lead:</span> {autoAssignedTeamLead.name}
              </div>
            )}
            {autoAssignedEmployee?.employee_name && (
              <div>
                <span className="text-muted-foreground">Employee:</span> {autoAssignedEmployee.employee_name} ({autoAssignedEmployee.employee_code})
              </div>
            )}
            {autoAssignedTaskId && (
              <div>
                <span className="text-muted-foreground">Task ID:</span> {autoAssignedTaskId}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Permit File (Optional)
          </CardTitle>
          <CardDescription>
            Upload a PDF file to associate with this task assignment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uploadedFile ? (
            <div className="flex items-center justify-between p-4 rounded-lg border border-success bg-success/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-sm">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">File ID: {uploadedFile.id}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div 
                className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {selectedPdfFile ? selectedPdfFile.name : "Click to select PDF file"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or drag and drop your file here
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="permit-file-upload"
                  name="permitFile"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              
              
              
              {selectedPdfFile && (
                <Button 
                  onClick={handleUploadFile} 
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Input */}
      <Card variant="glow">
        <CardHeader>
          <CardTitle>Task Description</CardTitle>
          <CardDescription>
            Describe the task you want to assign to team members
            {uploadedFile && <span className="text-success"> · File {uploadedFile.id} will be referenced</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            id="task-description"
            name="taskDescription"
            placeholder="e.g., Quality control review of electrical plan sets for residential solar installation"
            value={taskDescription}
            onChange={(e) => handleTaskDescriptionChange(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button 
              onClick={handleGetRecommendations}
              disabled={!taskDescription.trim() || isLoadingRecommendations}
              variant="outline"
              title="Find eligible employees based on task description"
            >
              <Search className="h-4 w-4 mr-2" />
              {isLoadingRecommendations ? "Finding..." : "Find Eligible Employees"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Access - Unassigned Files Button */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Quick Access
            </div>
          </CardTitle>
          <CardDescription>
            Quick tools for testing and managing file assignments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={() => setShowUnassignedFiles(!showUnassignedFiles)}
            variant="outline" 
            className="w-full justify-start"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            View Unassigned Files ({Array.isArray(unassignedFiles) ? unassignedFiles.length : 0})
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showUnassignedFiles ? 'rotate-180' : ''}`} />
          </Button>
          
          <Button 
            onClick={() => {
              // Set a sample task description for testing
              setTaskDescription("Quality control review of electrical plan sets for residential solar installation including panel layout and wiring diagrams");
              // Switch to eligible employees tab
              setActiveTab("eligible-employees");
              // Show unassigned files if not already shown
              if (!showUnassignedFiles) {
                setShowUnassignedFiles(true);
              }
            }}
            variant="outline" 
            className="w-full justify-start"
          >
            <Play className="h-4 w-4 mr-2" />
            Test Recommendation System
          </Button>
          
          <p className="text-xs text-muted-foreground">
            • Click "View Unassigned Files" to see all files needing assignment<br/>
            • Click "Test Recommendation System" to auto-fill sample task and test recommendations
          </p>
        </CardContent>
      </Card>

      {/* Expandable Unassigned Files Section */}
      {showUnassignedFiles && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Unassigned Files ({Array.isArray(unassignedFiles) ? unassignedFiles.length : 0})
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={loadUnassignedFiles}
                disabled={isLoadingFiles}
                title="Refresh unassigned files"
              >
                <Loader2 className={`h-4 w-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
            <CardDescription>
              Files that need task assignment. Click on a file to assign it to an employee.
            </CardDescription>
          </CardHeader>
        <CardContent>
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading files...</span>
            </div>
          ) : Array.isArray(unassignedFiles) && unassignedFiles.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No unassigned files available</p>
              <p className="text-xs text-muted-foreground mt-1">All files have been assigned to employees</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.isArray(unassignedFiles) && unassignedFiles.map((file, index) => (
                <Card 
                  key={file.file_id || `file-${index}`} 
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
                  onClick={() => handleFileAssignment(file)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{file.file_id}</span>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">File Name</p>
                        <p className="text-sm font-medium truncate">{file.file_name || 'Permit file'}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-xs">
                          {file.current_stage || file.workflow_step || 'PRELIMS'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {file.client || 'Unassigned'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'No date'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Team Members & Eligible Employees */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:min-w-[400px]">
            <TabsTrigger value="team-members">Team Members ({selectedTeam?.employees?.length || 0})</TabsTrigger>
            <TabsTrigger value="eligible-employees">Eligible Employees ({recommendations.length})</TabsTrigger>
          </TabsList>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshTeams}
            disabled={isLoadingTeams}
            className="w-full sm:w-auto"
          >
            {isLoadingTeams ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
        
        <TabsContent value="team-members" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {selectedTeam?.employees.map((employee) => {
              return (
                <Card key={employee.employee_code} className="flex flex-col h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{employee.employee_name}</CardTitle>
                        <p className="text-sm text-muted-foreground">#{employee.employee_code}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="shrink-0">{employee.current_role}</Badge>
                      <Badge variant="secondary" className="shrink-0">{employee.shift} Shift</Badge>
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        // Helper function to safely extract skills from object or array
                        const extractSkills = (skills: unknown): string[] => {
                          if (!skills) return [];
                          
                          // If skills is an array, return it directly
                          if (Array.isArray(skills)) {
                            return skills;
                          }
                          
                          // If skills is an object with categories, extract from each category
                          if (typeof skills === 'object' && skills !== null) {
                            const extracted: string[] = [];
                            const record = skills as Record<string, unknown>;
                            if (Array.isArray(record.structural_design)) {
                              extracted.push(...(record.structural_design as string[]));
                            }
                            if (Array.isArray(record.electrical_design)) {
                              extracted.push(...(record.electrical_design as string[]));
                            }
                            if (Array.isArray(record.coordination)) {
                              extracted.push(...(record.coordination as string[]));
                            }
                            return extracted;
                          }
                          
                          return [];
                        };
                        
                        // Extract skills from both skills and technical_skills structure
                        let skillList = extractSkills(employee.skills);
                        
                        // If no skills found, try technical_skills
                        if (skillList.length === 0) {
                          skillList = extractSkills(employee.technical_skills);
                        }
                        
                        const isExpanded = expandedSkills.has(employee.employee_code);
                        const displaySkills = isExpanded ? skillList : skillList.slice(0, 3);
                        
                        return (
                          <>
                            {displaySkills.map((skill, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                                onClick={() => handleSkillClick(typeof skill === 'string' ? skill : String(skill))}
                                title="Click to see all employees with this skill"
                              >
                                {typeof skill === 'string' ? skill.substring(0, 20) : skill}
                              </Badge>
                            ))}
                            {skillList.length > 3 && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                                onClick={() => toggleSkillsExpansion(employee.employee_code)}
                              >
                                {isExpanded ? 'Show less' : `+${skillList.length - 3}`}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="bg-muted rounded-md p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {(employee as EmployeeWithTasks).total_task_count || 0} Tasks
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(employee as EmployeeWithTasks).active_task_count || 0} Active • {((employee as EmployeeWithTasks).total_task_count || 0) - ((employee as EmployeeWithTasks).active_task_count || 0)} Completed
                      </div>
                      {(employee as EmployeeWithTasks).current_tasks && (employee as EmployeeWithTasks).current_tasks.length > 0 && (
                        <div className="mt-2 text-xs">
                          <div className="font-medium text-muted-foreground">Current Tasks:</div>
                          {expandedTaskCards.has(employee.employee_code) ? (
                            // Show all tasks when expanded
                            (employee as EmployeeWithTasks).current_tasks.map((task, idx) => (
                              <div key={idx} className="truncate text-muted-foreground flex items-center justify-between">
                                <span>• {task.title || task.task_id}</span>
                                <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                  task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                  task.status === 'DONE' || task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                  task.status === 'OPEN' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.status}
                                </span>
                              </div>
                            ))
                          ) : (
                            // Show only first 2 tasks when collapsed
                            (employee as EmployeeWithTasks).current_tasks.slice(0, 2).map((task, idx) => (
                              <div key={idx} className="truncate text-muted-foreground flex items-center justify-between">
                                <span>• {task.title || task.task_id}</span>
                                <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                  task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                  task.status === 'DONE' || task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                  task.status === 'OPEN' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.status}
                                </span>
                              </div>
                            ))
                          )}
                          {(employee as EmployeeWithTasks).current_tasks.length > 2 && (
                            <button
                              onClick={() => toggleTaskCardExpansion(employee.employee_code)}
                              className="text-blue-600 hover:text-blue-800 text-xs mt-1 cursor-pointer underline"
                            >
                              {expandedTaskCards.has(employee.employee_code) 
                                ? 'Show less' 
                                : `+${(employee as EmployeeWithTasks).current_tasks.length - 2} more...`
                              }
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        
        <TabsContent value="eligible-employees" className="space-y-4">
          {isLoadingRecommendations ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : recommendations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {recommendations.map((recommendation, index) => {
                const matchScore = recommendation.similarity_score * 10; // Convert to 0-10 scale
                
                return (
                  <Card key={recommendation.employee_code || `rec-${index}`} className="flex flex-col h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base truncate">{recommendation.employee_name}</CardTitle>
                          <p className="text-sm text-muted-foreground">#{recommendation.employee_code}</p>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className={`text-2xl font-bold ${
                            matchScore >= 10 ? "text-success" : 
                            matchScore >= 5 ? "text-primary" : 
                            "text-warning"
                          }`}>
                            {matchScore.toFixed(1)}
                          </div>
                          <p className="text-xs text-muted-foreground">score</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0">{recommendation.current_role}</Badge>
                        {recommendation.shift && <Badge variant="secondary" className="shrink-0">{recommendation.shift}</Badge>}
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          // Use skills_match from recommendation response
                          const extractSkills = (skills: unknown): string[] => {
                            if (!skills) return [];
                            
                            // If skills is an array, return it directly
                            if (Array.isArray(skills)) {
                              return skills;
                            }
                            
                            // If skills is an object with categories, extract from each category
                            if (typeof skills === 'object' && skills !== null) {
                              const extracted: string[] = [];
                              const record = skills as Record<string, unknown>;
                              if (Array.isArray(record.structural_design)) {
                                extracted.push(...(record.structural_design as string[]));
                              }
                              if (Array.isArray(record.electrical_design)) {
                                extracted.push(...(record.electrical_design as string[]));
                              }
                              if (Array.isArray(record.coordination)) {
                                extracted.push(...(record.coordination as string[]));
                              }
                              return extracted;
                            }
                            
                            return [];
                          };
                          
                          const allSkills = extractSkills(recommendation.skills_match || recommendation.technical_skills);
                          const displaySkills = allSkills.slice(0, 4);
                          
                          return displaySkills.map((skill, idx) => (
                            <Badge 
                              key={idx} 
                              variant="secondary" 
                              className="text-xs max-w-[200px] truncate cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => handleSkillClick(skill)}
                              title="Click to see all employees with this skill"
                            >
                              {skill}
                            </Badge>
                          ));
                        })()}
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 bg-muted rounded-md p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Briefcase className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">
                              {recommendation.total_task_count || 0} Tasks
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {recommendation.active_task_count || 0} Active
                          </div>
                          {recommendation.current_tasks && recommendation.current_tasks.length > 0 && (
                            <div className="mt-1 text-xs">
                              <div className="font-medium text-muted-foreground">Current:</div>
                              {expandedTaskCards.has(recommendation.employee_code) ? (
                                // Show all tasks when expanded
                                recommendation.current_tasks.map((task, idx) => (
                                  <div key={idx} className="truncate text-muted-foreground flex items-center justify-between">
                                    <span>• {task.title || task.task_id}</span>
                                    <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                      task.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                                      task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {task.status}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                // Show only first 1 task when collapsed
                                recommendation.current_tasks.slice(0, 1).map((task, idx) => (
                                  <div key={idx} className="truncate text-muted-foreground flex items-center justify-between">
                                    <span>• {task.title || task.task_id}</span>
                                    <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                      task.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                                      task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {task.status}
                                    </span>
                                  </div>
                                ))
                              )}
                              {recommendation.current_tasks.length > 1 && (
                                <button
                                  onClick={() => toggleTaskCardExpansion(recommendation.employee_code)}
                                  className="text-blue-600 hover:text-blue-800 text-xs mt-1 cursor-pointer underline"
                                >
                                  {expandedTaskCards.has(recommendation.employee_code) 
                                    ? 'Show less' 
                                    : `+${recommendation.current_tasks.length - 1} more...`
                                  }
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mt-auto pt-4">
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => handleAssignTask(recommendation as Employee)}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          >
                            Assign Task
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : hasComputed ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No eligible employees found for "{taskDescription.substring(0, 50)}{taskDescription.length > 50 ? '...' : ''}"
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Try modifying the task description or search without team lead filter
              </p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                Enter a task description and click "Find Eligible Employees" to see recommendations
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Employee Detail Modal */}
      <EmployeeDetailModal
        employee={selectedEmployee}
        tasks={employeeTasks}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onAssignTask={handleAssignTaskFromModal}
        isAssigned={false}
      />

      {/* File Assignment Dialog */}
      <Dialog open={showFileAssignment} onOpenChange={setShowFileAssignment}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Assign File: {selectedFile?.file_id}
            </DialogTitle>
            <DialogDescription>
              Select an employee and customize the task description for this file assignment.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* File Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{selectedFile?.file_id}</p>
                    <p className="text-sm text-muted-foreground">{selectedFile?.client || 'No client'}</p>
                  </div>
                  <Badge variant="secondary">
                    {selectedFile?.current_stage || selectedFile?.workflow_step || 'PRELIMS'}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File Name:</span>
                    <span className="font-medium truncate ml-2">{selectedFile?.file_name || 'Permit file'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-2">
                      {selectedFile?.created_at ? new Date(selectedFile.created_at).toLocaleDateString() : 'No date'}
                    </span>
                  </div>
                  {selectedFile?.file_size && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span className="ml-2">{(selectedFile.file_size / 1024).toFixed(2)} KB</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Task Description */}
            <div>
              <Label htmlFor="file-task-description">Task Description</Label>
              <Textarea
                id="file-task-description"
                value={fileTaskDescription}
                onChange={(e) => setFileTaskDescription(e.target.value)}
                placeholder="Describe the task to be performed on this file..."
                rows={3}
                className="mt-2"
              />
            </div>

            {/* Employee Selection */}
            <div>
              <Label>Available Employees</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 max-h-60 overflow-y-auto">
                {fileAssignmentEmployees.map((employee) => (
                  <Card 
                    key={employee.employee_code}
                    className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
                    onClick={() => handleAssignFileTask(employee)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{employee.employee_name}</p>
                          <p className="text-xs text-muted-foreground">#{employee.employee_code}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {employee.current_role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {employee.shift} Shift
                        </Badge>
                        <span>•</span>
                        <span>{(employee as EmployeeWithTasks).active_task_count || 0} active tasks</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Skill Details Modal */}
      <Dialog open={showSkillModal} onOpenChange={setShowSkillModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employees with Skill: {selectedSkill}
            </DialogTitle>
            <DialogDescription>
              Found {employeesWithSkill.length} employee(s) with this skill
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {employeesWithSkill.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No employees found with this skill</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employeesWithSkill.map((employee) => (
                  <Card key={employee.employee_code} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-sm">{employee.employee_name}</p>
                          <p className="text-xs text-muted-foreground">#{employee.employee_code}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {employee.current_role}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">
                            {employee.shift} Shift
                          </Badge>
                          <span>•</span>
                          <span>{(employee as EmployeeWithTasks).active_task_count || 0} active tasks</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Manager:</span>
                          <span className="font-medium">{employee.reporting_manager}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Experience:</span>
                          <span className="font-medium">{employee.experience_years || 0} years</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Related Skills:</p>
                        <div className="flex flex-wrap gap-1">
                          {extractSkills(employee.technical_skills)
                            .filter(skill => 
                              typeof skill === 'string' && 
                              skill.toLowerCase().includes(selectedSkill?.toLowerCase() || '')
                            )
                            .slice(0, 3)
                            .map((skill, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
