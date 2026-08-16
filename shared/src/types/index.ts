export type HealthStatus = "ok" | "degraded" | "error";

export type DatabaseHealthStatus =
  | "connected"
  | "disconnected"
  | "not_configured";

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  service: string;
  database: {
    status: DatabaseHealthStatus;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export type UserRole = "user" | "admin";

export type ThemePreference = "light" | "dark" | "system";
