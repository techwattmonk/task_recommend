/**
 * SLA constants - aligned with backend shared_constants.py
 */

export interface StageThreshold {
  ideal: number;
  max: number;
  display: string;
}

export interface SlaStatus {
  description: string;
  color: string;
}

// Stage-specific SLA thresholds (in minutes) - MUST MATCH BACKEND
export const STAGE_TIME_STANDARDS: Record<string, StageThreshold> = {
  'PRELIMS': { ideal: 20, max: 30, display: 'Prelims' },
  'PRODUCTION': { ideal: 210, max: 240, display: 'Production' },
  'COMPLETED': { ideal: 0, max: 5, display: 'Completed' },
  'QC': { ideal: 90, max: 120, display: 'Quality Control' },
  'DELIVERED': { ideal: 0, max: 5, display: 'Delivered' }
};

// SLA status definitions
export const SLA_STATUS_DEFINITIONS: Record<string, SlaStatus> = {
  'within_ideal': { description: 'Completed within ideal time', color: 'green' },
  'over_ideal': { description: 'Completed within max time', color: 'yellow' },
  'escalation_needed': { description: 'Exceeded max time', color: 'red' }
};

// Helper function to get performance color based on timing
export const getTimingPerformanceColor = (
  actualMinutes: number, 
  idealMinutes: number, 
  maxMinutes: number
): { color: string; status: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
  if (actualMinutes <= idealMinutes) {
    return { color: 'text-green-600', status: 'Excellent', variant: 'default' as const };
  } else if (actualMinutes <= maxMinutes) {
    return { color: 'text-yellow-600', status: 'Good', variant: 'secondary' as const };
  } else {
    return { color: 'text-red-600', status: 'Overdue', variant: 'destructive' as const };
  }
};

// Helper function to calculate SLA status
export const calculateSlaStatus = (stage: string, durationMinutes: number): string => {
  const thresholds = STAGE_TIME_STANDARDS[stage];
  if (!thresholds) {
    return 'escalation_needed'; // Default for unknown stages
  }
  
  if (durationMinutes <= thresholds.ideal) {
    return 'within_ideal';
  } else if (durationMinutes <= thresholds.max) {
    return 'over_ideal';
  } else {
    return 'escalation_needed';
  }
};
