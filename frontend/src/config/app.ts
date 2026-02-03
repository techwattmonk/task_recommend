/**
 * Application configuration constants
 * TODO: Move these to environment variables for production
 */

export const APP_CONFIG = {
  // App branding
  name: "TaskFlow",
  tagline: "AI Assignment",
  
  // API endpoints
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  
  // UI constants
  maxSearchResults: 8,
  searchEmployeeLimit: 10,
  
  // Pagination
  defaultPageSize: 20,
  
  // File upload
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ['.pdf'],
  
  // Cache durations (in milliseconds)
  cacheDuration: {
    employees: 5 * 60 * 1000, // 5 minutes
    tasks: 2 * 60 * 1000,     // 2 minutes
    permitFiles: 3 * 60 * 1000 // 3 minutes
  }
} as const;
