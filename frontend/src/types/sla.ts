/**
 * Shared types for SLA configuration
 */

export interface StageThreshold {
  ideal: number;
  max: number;
  display: string;
}

export interface SlaConfig {
  stage: string;
  display_name: string;
  description: string;
  ideal_minutes: number;
  max_minutes: number;
  escalation_minutes: number;
  requires_previous_stage: boolean;
  allowed_previous_stages: string[];
}

export interface SlaStatus {
  description: string;
  color: string;
}
