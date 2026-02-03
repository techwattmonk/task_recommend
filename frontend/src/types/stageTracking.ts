export interface FileStage {
  file_id: string;
  original_filename?: string;
  current_status: string;
  current_assignment?: {
    employee_code: string;
    employee_name: string;
    assigned_at: string;
    started_at?: string;
    duration_minutes?: number;
    ideal_minutes?: number;
    max_minutes?: number;
    sla_status?: string;
  };
  created_at: string;
  updated_at: string;
  total_penalty_points: number;
  escalations_triggered: number;
  source?: string;
}

export interface PipelineData {
  PRELIMS: FileStage[];
  PRODUCTION: FileStage[];
  COMPLETED: FileStage[];
  QC: FileStage[];
  DELIVERED: FileStage[];
}

export interface SLABreach {
  file_id: string;
  current_stage: string;
  employee_code: string;
  employee_name: string;
  duration_minutes: number;
  escalation_threshold: number;
  ideal_minutes: number;
  max_minutes: number;
  status: string;  // 'over_ideal' | 'over_max'
  sla_status: string | {
    status: string;
    duration_minutes: number;
    over_by_minutes: number;
  };
  source?: string;  // 'tasks' for Smart Recommender tasks
}

export interface StageConfig {
  stage: string;
  display_name: string;
  description: string;
  ideal_minutes: number;
  max_minutes: number;
  escalation_minutes: number;
  requires_previous_stage: boolean;
  allowed_previous_stages: string[];
}

export interface StageAssignment {
  employee_code: string;
  employee_name: string;
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  duration_minutes?: number;
  sla_status?: {
    status: string;
    duration_minutes: number;
    over_by_minutes: number;
  };
  penalty_points: number;
}

export interface StageHistory {
  file_id: string;
  stage: string;
  status: string;
  assigned_to?: StageAssignment;
  entered_stage_at: string;
  completed_stage_at?: string;
  total_duration_minutes?: number;
  sla_breached: boolean;
  escalation_sent: boolean;
}

export interface FileTracking {
  file_id: string;
  current_stage: string;
  current_status: string;
  current_assignment?: StageAssignment;
  stage_history: StageHistory[];
  created_at: string;
  updated_at: string;
  total_penalty_points: number;
  escalations_triggered: number;
}

export interface Employee {
  employee_code: string;
  employee_name: string;
  current_role: string;
  status: string;
  reporting_manager?: string;
  reporting_manager_2?: string;
  team_lead?: string;
}

export interface PerformanceData {
  employee_code: string;
  active_assignments: number;
  completed_stages: number;
  total_penalty_points: number;
  average_stage_duration_minutes: number;
  active_work: Array<{
    file_id: string;
    stage: string;
    assigned_at: string;
    started_at?: string;
    duration_minutes?: number;
  }>;
  completed_work: Array<{
    file_id: string;
    stage: string;
    duration_minutes: number;
    penalty_points: number;
    completed_at: string;
  }>;
}

export interface SLAReport {
  total_stages: number;
  completed_stages: number;
  within_ideal: number;
  over_ideal: number;
  over_max: number;
  escalations: number;
  by_stage: Record<string, {
    total: number;
    completed: number;
    within_ideal: number;
    over_ideal: number;
    over_max: number;
    escalations: number;
  }>;
}

// API Response types
export interface PipelineResponse {
  success: boolean;
  pipeline: PipelineData;
}

export interface SLABreachesResponse {
  success: boolean;
  breaches: SLABreach[];
}

export interface StagesResponse {
  success: boolean;
  stages: StageConfig[];
}

export interface FileTrackingResponse {
  success: boolean;
  tracking: FileTracking;
}

export interface PerformanceResponse {
  success: boolean;
  performance: PerformanceData;
}

export interface SLAReportResponse {
  success: boolean;
  report: SLAReport;
}

// Task Board related types
export interface Task {
  task_id: string;
  title: string;
  description: string;
  assigned_to: string;
  status: string;
  assigned_at: string;
  due_date?: string;
  priority?: string;
  file_id?: string;
}

export interface TaskBoardData {
  todo: Task[];
  in_progress: Task[];
  completed: Task[];
  pending_review: Task[];
}

export interface EmployeeTasks {
  employee_code: string;
  tasks: Task[];
  active_count: number;
  completed_count: number;
  total_count: number;
}
