// API functions for employee and task management
// Updated: 2025-01-14 13:35:00 - Fixed updateMyTechnicalSkills export

import { toast } from "@/hooks/use-toast";
import { Employee, FileStageHistory, TeamLeadGroup, Task, TaskAssignment, PermitFile, Recommendation } from '@/types';
import type { PipelineData, SLABreach } from '@/types/stageTracking';

const API_BASE_URL = (() => {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw) return '/api/v1';
  const trimmed = raw.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) return trimmed;
  return `${trimmed}/api/v1`;
})();

function isApiDebugEnabled(): boolean {
  try {
    return localStorage.getItem('apiDebug') === 'true';
  } catch {
    return false;
  }
}

type ApiErrorPayload = { detail?: string };

function apiDebugLog(...args: unknown[]): void {
  if (isApiDebugEnabled()) {
    console.log(...args);
  }
}

type JsonObject = Record<string, unknown>;

type AssignedTaskApi = JsonObject & {
  status?: string;
  employee_details?: {
    employee_name?: string;
    employee_code?: string;
    employment?: {
      current_role?: string;
    };
  };
  assigned_to?: string;
  assigned_to_name?: string;
  employee_code?: string;
  title?: string;
  task_assigned?: string;
  task_description?: string;
  assigned_at?: string;
  time_assigned?: string;
};

type AssignedTasksResponse =
  | AssignedTaskApi[]
  | {
      tasks?: AssignedTaskApi[];
      total?: number;
      last_updated?: string | null;
    };

type EmployeeAssignedTasksResponse = {
  employee: {
    employee_code: string;
    employee_name: string;
    employment?: {
      current_role?: string;
    };
  };
  tasks: AssignedTaskApi[];
  total: number;
};

type TeamLeadTaskStatsResponse = {
  total_teams: number;
  team_stats: unknown[];
};

type PermitFileTrackingResponse = {
  total_permit_files: number;
  data: unknown[];  // Changed from permit_files to data to match backend
};

type StageTrackingDashboardResponse = {
  success?: boolean;
  data?: {
    pipeline?: PipelineData;
    sla_breaches?: SLABreach[];
    summary?: {
      active_files?: number;
      breaches_count?: number;
      delivered_today_count?: number;
    };
  };
};

function getLocalCache<T>(key: string, ttlMs: number): T | null {
  try {
    const cached = localStorage.getItem(key);
    const cacheTime = localStorage.getItem(`${key}_time`);
    if (!cached || !cacheTime) return null;
    if ((Date.now() - parseInt(cacheTime)) > ttlMs) return null;
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

function setLocalCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}_time`, Date.now().toString());
  } catch {
    // ignore cache write failures
  }
}

const DEFAULT_EMPLOYEE_CODE = import.meta.env.VITE_DEFAULT_EMPLOYEE_CODE || '1030';

function getEmployeeCode(): string {
  return localStorage.getItem('employeeCode') || DEFAULT_EMPLOYEE_CODE;
}

// Generic API client for new endpoints
export const api = {
  async get<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T }> {
    const url = `${API_BASE_URL}${endpoint}`;
    const employeeCode = getEmployeeCode();
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeCode}`,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as ApiErrorPayload;
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    return { data };
  },

  async post<T>(endpoint: string, data?: unknown, options: RequestInit = {}): Promise<{ data: T }> {
    const url = `${API_BASE_URL}${endpoint}`;
    const employeeCode = getEmployeeCode();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeCode}`,
        ...options.headers,
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as ApiErrorPayload;
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const responseData = (await response.json()) as T;
    return { data: responseData };
  },

  async put<T>(endpoint: string, data?: unknown, options: RequestInit = {}): Promise<{ data: T }> {
    const url = `${API_BASE_URL}${endpoint}`;
    const employeeCode = getEmployeeCode();
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeCode}`,
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const responseData = await response.json();
    return { data: responseData };
  },

  async delete<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T }> {
    const url = `${API_BASE_URL}${endpoint}`;
    const employeeCode = getEmployeeCode();
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${employeeCode}`,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as ApiErrorPayload;
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    return { data };
  },
};

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get employee code from localStorage for authentication
  const employeeCode = getEmployeeCode();
  
  apiDebugLog(`[API] Making request to: ${url}`);
  apiDebugLog(`[API] Method: ${options.method || 'GET'}`);
  apiDebugLog(`[API] Employee code: ${employeeCode}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${employeeCode}`, // Use Bearer token format
      ...options.headers,
    },
  });

  apiDebugLog(`[API] Response status: ${response.status}`);
  apiDebugLog(`[API] Response ok: ${response.ok}`);

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as ApiErrorPayload;
    console.error(`[API] Error response:`, error);
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const jsonResponse = (await response.json()) as T;
  apiDebugLog(`[API] JSON response:`, jsonResponse);
  
  return jsonResponse;
}

export async function getEmployees(): Promise<Employee[]> {
  const cacheKey = 'all_employees';
  const cached = localStorage.getItem(cacheKey);
  const cacheTime = localStorage.getItem(`${cacheKey}_time`);
  
  // Use cache if less than 10 minutes old
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < 600000) {
    apiDebugLog('[API] Using cached employees data');
    return JSON.parse(cached);
  }
  
  const data = await apiRequest<Employee[]>('/employees/');
  
  // Cache the results
  localStorage.setItem(cacheKey, JSON.stringify(data));
  localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  
  return data;
}

export async function getEmployee(employeeCode: string): Promise<Employee> {
  if (!employeeCode || employeeCode === 'null' || employeeCode === 'undefined') {
    throw new Error('Employee code is required');
  }
  
  const employees = await getEmployees();
  const employee = employees.find(e => e.employee_code === employeeCode);
  if (!employee) {
    throw new Error(`Employee ${employeeCode} not found`);
  }
  return employee;
}

export async function getEmployeeTasks(employeeCode: string): Promise<TaskAssignment> {
  if (!employeeCode || employeeCode === 'null' || employeeCode === 'undefined') {
    throw new Error('Employee code is required');
  }
  
  const cacheKey = `employee_tasks_${employeeCode}`;
  const cached = localStorage.getItem(cacheKey);
  const cacheTime = localStorage.getItem(`${cacheKey}_time`);
  
  // Use cache if less than 5 minutes old
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < 300000) {
    apiDebugLog('[API] Using cached employee tasks');
    return JSON.parse(cached);
  }
  
  const data = await apiRequest<TaskAssignment>(`/employees/${employeeCode}/tasks`);
  
  // Cache the results
  localStorage.setItem(cacheKey, JSON.stringify(data));
  localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  
  return data;
}

export async function getEmployeesGroupedByTeamLead(): Promise<TeamLeadGroup[]> {
  apiDebugLog('[API] Getting employees grouped by team lead');
  const cacheKey = 'teams_data';
  const cached = localStorage.getItem(cacheKey);
  const cacheTime = localStorage.getItem(`${cacheKey}_time`);
  
  // Use cache if less than 5 minutes old
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < 300000) {
    apiDebugLog('[API] Using cached teams data');
    return JSON.parse(cached);
  }
  
  const data = await apiRequest<TeamLeadGroup[]>('/employees/employees-grouped-by-team-lead');
  
  // Cache the results
  localStorage.setItem(cacheKey, JSON.stringify(data));
  localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  
  return data;
}

export async function assignTaskToEmployee(
  employeeCode: string,
  taskDescription: string,
  assignedBy: string,
  permitFileId?: string
): Promise<unknown> {
  apiDebugLog(`[API] Creating and assigning task to ${employeeCode}`);
  
  try {
    // First create the task
    const createResponse = await apiRequest<{ 
      task_id: string; 
      validation_warning?: string;
      detected_stage?: string;
    }>('/tasks/create', {
      method: 'POST',
      body: JSON.stringify({
        title: taskDescription,
        description: taskDescription,
        skills_required: [],
        permit_file_id: permitFileId,
        assigned_by: assignedBy,
        due_date: null,
        estimated_hours: null,
        created_from: "manual_assignment",
        assignment_source: "manual"  // Mark as manual assignment
      }),
    });
    
    const taskId = createResponse.task_id;
    apiDebugLog(`[API] Task created with ID: ${taskId}`);
    
    // Then assign the task to the employee
    const assignResponse = await apiRequest<unknown>(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        employee_code: employeeCode,
        assigned_by: assignedBy,
      }),
    });
    
    apiDebugLog(`[API] Task assigned successfully:`, assignResponse);
    
    // Return both assign response and any validation warning
    return {
      ...(assignResponse && typeof assignResponse === 'object' ? assignResponse : {}),
      validation_warning: createResponse.validation_warning,
      detected_stage: createResponse.detected_stage
    };
  } catch (error) {
    console.error(`[API] Failed to assign task:`, error);
    throw error;
  }
}

// Permit Files API Types
type PermitFileApiItem = {
  file_id: string;
  file_name?: string;
  status?: string;
  file_size?: number;
  client?: string;
  project_details?: {
    client_name?: string;
    project_name?: string;
  };
  metadata?: {
    created_at?: string;
    updated_at?: string;
    uploaded_by?: string;
  };
  file_info?: {
    uploaded_at?: string;
    file_path?: string;
  };
  assigned_to_lead?: string;
  workflow_step?: PermitFile['workflow_step'];
};

export async function getPermitFiles(params?: {
  limit?: number;
  offset?: number;
  client?: string;
  status?: string;
}): Promise<PermitFile[]> {
  const cacheKey = `permit_files_${JSON.stringify(params || {})}`;
  const cached = getLocalCache<PermitFileApiItem[]>(cacheKey, 10000);
  if (cached) {
    apiDebugLog('[API] Using cached permit files');
    return transformPermitFiles(cached);
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  if (params?.client) queryParams.append('client', params.client);
  if (params?.status) queryParams.append('status', params.status);

  const url = `/permit-files/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const data = await apiRequest<PermitFileApiItem[]>(url);
  
  setLocalCache(cacheKey, data);
  return transformPermitFiles(data);
}

function transformPermitFiles(data: PermitFileApiItem[]): PermitFile[] {
  // Transform backend data to match frontend interface
  return data.map(file => {
    const metadata =
      file.metadata?.uploaded_by && file.metadata?.created_at && file.metadata?.updated_at
        ? {
            uploaded_by: file.metadata.uploaded_by,
            created_at: file.metadata.created_at,
            updated_at: file.metadata.updated_at,
          }
        : undefined;

    const projectDetails =
      file.project_details?.client_name && file.project_details?.project_name
        ? {
            client_name: file.project_details.client_name,
            project_name: file.project_details.project_name,
          }
        : undefined;

    return {
      _id: file.file_id,
      file_id: file.file_id,
      file_name: file.file_name || file.file_id,
      file_type: (file.project_details?.client_name || 'NEW') as PermitFile['file_type'],
      status: file.status || 'PENDING',
      state: file.project_details?.project_name,
      client: file.client || file.project_details?.client_name, // Use mapped client
      created_at: file.metadata?.created_at || file.file_info?.uploaded_at || '',
      updated_at: file.metadata?.updated_at || '',
      file_path: file.file_info?.file_path,
      file_size: file.file_size,
      uploaded_by: file.metadata?.uploaded_by,
      metadata,
      project_details: projectDetails,
      assigned_to_lead: file.assigned_to_lead,
      workflow_step: file.workflow_step, // Include workflow step
    };
  });
}

export async function getFileStageHistory(fileId: string) {
  const data = await apiRequest<FileStageHistory>(`/stage-tracking/file/${fileId}/stage-history`);
  return data;
}

export async function uploadPermitFile(
  file: File,
  metadata: {
    file_type: 'NEW' | 'REVISION';
    start_step: 'PRELIMS' | 'PRODUCTION' | 'QC';
  }
): Promise<PermitFile> {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('client_name', metadata.file_type); // Backend expects client_name
  formData.append('project_name', 'Project from upload'); // Default project name
  formData.append('assigned_to_lead', getEmployeeCode()); // Backend expects assigned_to_lead
  formData.append('workflow_step', metadata.start_step); // Add workflow step parameter

  apiDebugLog('[API] Uploading file with automation to /permit-files/upload');
  
  // First upload the file
  const response = await fetch(`${API_BASE_URL}/permit-files/upload`, {
    method: 'POST',
    headers: {
      'X-Employee-Code': getEmployeeCode(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    console.error('[API Error] File upload failed:', error);
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const uploadResult = (await response.json()) as PermitFile;
  apiDebugLog('[API Success] File uploaded:', uploadResult);
  
  // NOTE: Automation workflow is NOT started here
  // Task assignment happens manually through Smart Recommender after user enters task details
  
  return uploadResult;
}

export async function smartUploadAndAssign(
  file: File,
  taskDescription: string,
  assignedBy: string
): Promise<unknown> {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('task_description', taskDescription);
  formData.append('assigned_by', assignedBy);

  const response = await fetch(`${API_BASE_URL}/permit-files/zip-assign`, {
    method: 'POST',
    headers: {
      'X-Employee-Code': getEmployeeCode(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'ZIP-based upload failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  return data;
}

export async function getReportingManagerOverview(days: number = 7, limitEmployees: number = 5): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/analytics/reporting-managers/overview?days=${days}&limit_employees=${limitEmployees}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch reporting manager overview');
  }
  
  return (await response.json()) as unknown;
}

export async function uploadFileWithAutomation(formData: FormData): Promise<unknown> {
  apiDebugLog('[API] Uploading file with automation to /permit-files/upload');
  
  // First upload the file
  const response = await fetch(`${API_BASE_URL}/permit-files/upload`, {
    method: 'POST',
    headers: {
      'X-Employee-Code': getEmployeeCode(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    console.error('[API Error] File upload failed:', error);
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const uploadResult = await response.json();
  apiDebugLog('[API Success] File uploaded:', uploadResult);
  
  // NOTE: Automation workflow is NOT started here
  // Task assignment happens manually through Smart Recommender after user enters task details
  
  return uploadResult;
}

export async function getUnassignedFiles(): Promise<PermitFile[]> {
  apiDebugLog('[API] Getting unassigned files');
  
  const response = await api.get('/permit-files/unassigned');
  
  const files = (response.data as unknown as PermitFile[]) || [];
  apiDebugLog(`[API] Retrieved ${files.length} unassigned files`);
  return files;  // Return array directly, not wrapped in object
}

export async function getEmployeeRecommendations(
  taskDescription: string,
  teamLeadCode?: string,
  topK: number = 10,
  minSimilarity: number = 0.1
): Promise<Recommendation[]> {
  apiDebugLog('[API] Getting recommendations for:', taskDescription);
  apiDebugLog('[API] Team lead code:', teamLeadCode);
  
  try {
    // Direct fetch without authentication for recommendations endpoint
    const url = `${API_BASE_URL}/tasks/recommend`;
    apiDebugLog(`[API] Making direct request to: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_description: taskDescription,
        team_lead_code: teamLeadCode,
        top_k: 10,
        min_similarity: 0.3,  // Lower threshold to get more matches
      }),
    });

    apiDebugLog(`[API] Response status: ${response.status}`);
    apiDebugLog(`[API] Response ok: ${response.ok}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      console.error(`[API] Error response:`, error);
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const jsonResponse = await response.json();
    apiDebugLog(`[API] JSON response:`, jsonResponse);
    
    if (!jsonResponse || !jsonResponse.recommendations) {
      console.error('[API] Invalid response structure:', jsonResponse);
      return [];
    }

    apiDebugLog('[API] Recommendations array:', jsonResponse.recommendations);
    apiDebugLog('[API] Total found:', jsonResponse.total_found);

    return jsonResponse.recommendations;
  } catch (error) {
    console.error('[API] Error getting recommendations:', error);
    throw error;
  }
}

export function setEmployeeCode(code: string): void {
  localStorage.setItem('employeeCode', code);
}

// Task submission functions
export async function completeTask(taskId: string, employeeCode: string): Promise<unknown> {
  // Use the proper endpoint that handles stage progression correctly
  return await submitTaskCompletion(employeeCode, taskId);
}

export async function getEmployeeTaskStats(employeeCode: string): Promise<unknown> {
  if (!employeeCode || employeeCode === 'null' || employeeCode === 'undefined') {
    throw new Error('Employee code is required');
  }
  
  const response = await fetch(`${API_BASE_URL}/tasks/employee/${employeeCode}/stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch employee task statistics');
  }
  
  return response.json();
}

// Optimized task board functions
export async function getAllAssignedTasks(): Promise<AssignedTasksResponse> {
  const cacheKey = 'assigned_tasks';
  const cached = getLocalCache<AssignedTasksResponse>(cacheKey, 15000);
  if (cached) {
    apiDebugLog('[API] Using cached assigned tasks');
    return cached;
  }

  const response = await fetch(`${API_BASE_URL}/tasks/assigned`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch assigned tasks');
  }

  const data = (await response.json()) as AssignedTasksResponse;
  setLocalCache(cacheKey, data);
  return data;
}

export async function getEmployeeAssignedTasks(employeeCode: string): Promise<AssignedTaskApi[] | EmployeeAssignedTasksResponse> {
  const response = await fetch(`${API_BASE_URL}/tasks/employee/${employeeCode}/assigned`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch employee assigned tasks');
  }
  
  return response.json();
}

// Task work management functions
export async function startTaskWork(taskId: string, employeeCode: string): Promise<unknown> {
  apiDebugLog(`[API] Starting work on task ${taskId} by employee ${employeeCode}`);
  
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/start?employee_code=${employeeCode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = (await response.json().catch(() => ({ detail: 'Request failed' }))) as ApiErrorPayload;
    console.error(`[API] Error starting task work:`, error);
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  const result = (await response.json()) as unknown;
  apiDebugLog(`[API] Task work started successfully:`, result);
  return result;
}

export async function completeTaskWork(taskId: string, employeeCode: string): Promise<unknown> {
  apiDebugLog(`[API] Completing task ${taskId} by employee ${employeeCode}`);
  
  // Use the proper endpoint that handles stage progression correctly
  const result = await submitTaskCompletion(employeeCode, taskId);
  apiDebugLog(`[API] Task completed successfully:`, result);
  return result;
}

// Team lead and permit file tracking functions
export async function getTeamLeadTaskStats(): Promise<TeamLeadTaskStatsResponse> {
  const cacheKey = 'team_lead_task_stats';
  const cached = getLocalCache<TeamLeadTaskStatsResponse>(cacheKey, 60000);
  if (cached) {
    apiDebugLog('[API] Using cached team lead task stats');
    return cached;
  }

  const response = await fetch(`${API_BASE_URL}/tasks/team-lead-stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch team lead task statistics');
  }

  const data = await response.json();
  setLocalCache(cacheKey, data);
  return data;
}

export async function getPermitFileTracking(): Promise<PermitFileTrackingResponse> {
  const cacheKey = 'permit_file_tracking';
  const cached = getLocalCache<PermitFileTrackingResponse>(cacheKey, 5000);
  if (cached) {
    apiDebugLog('[API] Using cached permit file tracking');
    return cached;
  }

  const response = await fetch(`${API_BASE_URL}/tasks/permit-file-tracking`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch permit file tracking');
  }

  const data = await response.json();
  setLocalCache(cacheKey, data);
  return data;
}

// Real-time activity and dashboard functions
export async function getRecentActivity(): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/tasks/recent-activity`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch recent activity');
  }
  
  return response.json();
}

export async function getCompletedToday(): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/tasks/completed-today`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch completed today tasks');
  }
  
  return response.json();
}

export async function getEmployeeCompletedTasks(employeeCode: string): Promise<unknown> {
  if (!employeeCode || employeeCode === 'null' || employeeCode === 'undefined') {
    throw new Error('Employee code is required');
  }
  
  apiDebugLog(`[API] Fetching completed tasks for employee: ${employeeCode}`);
  
  const response = await fetch(`${API_BASE_URL}/tasks/employee/${employeeCode}/completed`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Employee-Code': getEmployeeCode(),
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch completed tasks');
  }
  
  const data = (await response.json()) as JsonObject;
  const tasks = (data as { tasks?: unknown }).tasks;
  const tasksCount = Array.isArray(tasks) ? tasks.length : 0;
  apiDebugLog(`[API] Retrieved ${tasksCount} completed tasks for ${employeeCode}`);
  return data;
}

// Employee task submission functions
export async function getMyTasks(employeeCode: string): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/employee-tasks/${employeeCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  
  return response.json();
}

export async function submitTaskCompletion(employeeCode: string, taskId: string, completionNotes?: string, hoursWorked?: number): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/employee-tasks/${employeeCode}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task_id: taskId,
      completion_notes: completionNotes,
      hours_worked: hoursWorked,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to submit task completion');
  }
  
  return response.json();
}

export async function getStageTrackingDashboard(): Promise<StageTrackingDashboardResponse> {
  const cacheKey = 'stage_tracking_dashboard';
  const cached = getLocalCache<StageTrackingDashboardResponse>(cacheKey, 5000);
  if (cached) {
    apiDebugLog('[API] Using cached stage tracking dashboard');
    return cached;
  }

  const response = await fetch(`${API_BASE_URL}/stage-tracking/dashboard`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch stage tracking dashboard');
  }

  const data = await response.json();
  setLocalCache(cacheKey, data);
  return data;
}

export function clearStageTrackingCache(): void {
  const cacheKey = 'stage_tracking_dashboard';
  localStorage.removeItem(cacheKey);
  localStorage.removeItem(`${cacheKey}_time`);
  apiDebugLog('[API] Cleared stage tracking dashboard cache');
}

export async function moveFileToQC(fileId: string, employeeCode: string): Promise<unknown> {
  apiDebugLog(`[API] Moving file ${fileId} to QC by employee ${employeeCode}`);
  
  const response = await fetch(`${API_BASE_URL}/stage-tracking/move-to-qc/${fileId}?employee_code=${employeeCode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new Error(errorData.detail || `Failed to move file ${fileId} to QC`);
  }
  
  return (await response.json()) as unknown;
}

export async function getFilesReadyForStage(stage: string): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/stage-tracking/ready-for-stage/${stage}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get files ready for ${stage} stage`);
  }
  
  return response.json();
}

export async function getTeamLeadStats(): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/tasks/team-lead-stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch team lead statistics');
  }
  
  return response.json();
}

// Profile Management Functions
export async function getMyProfile(): Promise<unknown> {
  return apiRequest<unknown>('/employees/profile/me');
}

export async function updateMyProfile(profileData: {
  employee_name?: string;
  current_role?: string;
  shift?: string;
  experience_years?: number;
  contact_email?: string;
  reporting_manager?: string;
  raw_technical_skills?: string;
}): Promise<unknown> {
  return apiRequest('/employees/profile/me', {
    method: 'PUT',
    body: JSON.stringify(profileData),
  });
}

export async function updateMyTechnicalSkills(skillsData: {
  structural_design?: string[];
  electrical_design?: string[];
  coordination?: string[];
}): Promise<unknown> {
  return apiRequest('/employees/profile/me/technical-skills', {
    method: 'PUT',
    body: JSON.stringify(skillsData),
  });
}

// Task Management APIs
export async function createTask(taskData: {
  title: string;
  description: string;
  workflow_step: string;
  skills_required: string[];
  estimated_hours: number;
  priority: string;
  file_id?: string;
  task_type?: string;
}): Promise<unknown> {
  return apiRequest('/tasks/create', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
}

export async function assignTask(taskId: string, employeeCode: string): Promise<unknown> {
  return apiRequest(`/tasks/${taskId}/assign`, {
    method: 'POST',
    body: JSON.stringify({
      employee_code: employeeCode,
      assigned_by: "frontend-user"
    }),
  });
}

export async function getTaskStatus(taskId: string): Promise<unknown> {
  return apiRequest(`/tasks/${taskId}/status`);
}

// File Progression Automation APIs
export async function triggerFileProgression(fileData: {
  file_id: string;
  filename: string;
  project_name: string;
  client_name: string;
  priority: string;
  requirements: {
    skills_needed: string[];
    estimated_hours: {
      prelims: number;
      production: number;
      qc: number;
    };
  };
}): Promise<unknown> {
  return apiRequest('/temporal/trigger-progression', {
    method: 'POST',
    body: JSON.stringify(fileData),
  });
}

export async function getFileProgressionStatus(fileId: string): Promise<unknown> {
  return apiRequest(`/temporal/progression-status/${fileId}`);
}

export async function getAutomationMetrics(): Promise<unknown> {
  return apiRequest('/temporal/automation-metrics');
}

export async function getWorkflowHistory(): Promise<unknown> {
  return apiRequest('/temporal/workflow-history');
}

export async function getAvailableManagers(): Promise<unknown[]> {
  const response = (await apiRequest('/employees/profile/available-managers')) as { data?: unknown[] };
  return response.data || [];
}

// Employee Registration
export async function registerNewEmployee(employeeData: {
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
}): Promise<unknown> {
  return apiRequest('/employees/register', {
    method: 'POST',
    body: JSON.stringify(employeeData),
  });
}

// Re-export types that are used by components
export type { Employee, Task, TaskAssignment, PermitFile, Recommendation, TeamLeadGroup };
