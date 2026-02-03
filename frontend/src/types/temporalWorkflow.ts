/**
 * Frontend types for Temporal workflow integration
 * These are business-friendly types, no Temporal jargon
 */

export interface FileWorkflowState {
  file_id: string;
  current_stage: StageType | null;
  business_state: BusinessState;
  stages_completed: StageType[];
  sla_status: SLAStatus;
  workflow_id: string;
}

export interface FileStatusDetail {
  file_id: string;
  current_stage: StageType | null;
  business_state: BusinessState;
  stages: Record<StageType, StageDetail>;
  sla_status: SLAStatus;
  retry_counts: Record<StageType, number>;
}

export interface StageDetail {
  employee_code: string;
  employee_name: string;
  start_time: string | null;
  completion_time: string | null;
  duration_minutes: number | null;
  sla_status: SLAStatus;
  quality_score: number | null;
}

// Business states (not Temporal states)
export type BusinessState = 
  | "WAITING_FOR_FILE"
  | "PRELIMS_IN_PROGRESS"
  | "PRODUCTION_ASSIGNED"
  | "PRODUCTION_IN_PROGRESS"
  | "QUALITY_ASSIGNED"
  | "QUALITY_IN_PROGRESS"
  | "DELIVERED"
  | "SLA_BREACHED"
  | "REASSIGNED"
  | "UNKNOWN";

// Sequential stages
export type StageType = "PRELIMS" | "PRODUCTION" | "QUALITY" | "DELIVERED";

// SLA status
export type SLAStatus = "within" | "breached" | "pending";

// API request types
export interface StartWorkflowRequest {
  file_id: string;
  filename: string;
  project_name: string;
  client_name: string;
  priority?: "normal" | "high" | "urgent";
  requirements?: Record<string, unknown>;
}

export interface CompleteStageRequest {
  file_id: string;
  stage: StageType;
  employee_code: string;
  quality_score?: number;
}

export interface SLABreachRequest {
  file_id: string;
  stage: StageType;
  employee_code: string;
}

// UI State for components
export interface WorkflowUIState {
  isLoading: boolean;
  error: string | null;
  workflowState: FileWorkflowState | null;
  fileDetails: FileStatusDetail | null;
}

// Helper functions for UI
export const getStageDisplayName = (stage: StageType): string => {
  const names = {
    PRELIMS: "Preliminary Review",
    PRODUCTION: "Production Work",
    QUALITY: "Quality Check",
    DELIVERED: "Delivered"
  };
  return names[stage] || stage;
};

export const getBusinessStateDisplayName = (state: BusinessState): string => {
  const names = {
    WAITING_FOR_FILE: "Waiting for File Upload",
    PRELIMS_IN_PROGRESS: "Preliminary Review in Progress",
    PRODUCTION_ASSIGNED: "Production Assigned",
    PRODUCTION_IN_PROGRESS: "Production in Progress",
    QUALITY_ASSIGNED: "Quality Check Assigned",
    QUALITY_IN_PROGRESS: "Quality Check in Progress",
    DELIVERED: "Delivered Successfully",
    SLA_BREACHED: "SLA Breached - Reassigning",
    REASSIGNED: "Reassigned to New Employee",
    UNKNOWN: "Unknown Status"
  };
  return names[state] || state;
};

export const getSLAStatusColor = (status: SLAStatus): string => {
  switch (status) {
    case "within": return "text-green-600";
    case "breached": return "text-red-600";
    case "pending": return "text-yellow-600";
    default: return "text-gray-600";
  }
};

export const getStageProgress = (stages: Record<StageType, StageDetail>): number => {
  const completed = Object.values(stages).filter(s => s.completion_time).length;
  return (completed / Object.keys(stages).length) * 100;
};
