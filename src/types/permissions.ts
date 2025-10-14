export type Role = 'super_admin' | 'site_admin' | 'admin' | 'research_assistant' | 'participant';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'exclude';

export type Resource = 'groups' | 'assignments' | 'users' | 'admins' | 'tasks';

export type GroupSubResource = 'sites' | 'schools' | 'classes' | 'cohorts';

export type AdminSubResource = 'site_admin' | 'admin' | 'research_assistant';

export type SubResource = GroupSubResource | AdminSubResource;

export * from './constants.js';

export type PermissionDecision = 'allow' | 'deny' | 'indeterminate';

export type PermissionReason =
  | 'NOT_LOADED'
  | 'MISSING_PARAMS'
  | 'REQUIRES_SUBRESOURCE'
  | 'INVALID_SUBRESOURCE'
  | 'NO_ROLE'
  | 'NOT_ALLOWED'
  | 'ALLOWED';

export interface PermissionDecisionDetail {
  decision: PermissionDecision;
  reason: PermissionReason;
}

export type LoggingMode = 'off' | 'baseline' | 'debug';

export interface LoggingModeConfig {
  mode?: LoggingMode;
}

export interface PermEvent {
  decision: PermissionDecision;
  reason: PermissionReason;
  action?: Action;
  resource?: Resource;
  subResource?: SubResource;
  resourceKey?: string;
  siteId?: string;
  userId?: string;
  timestamp: number;
  environment: 'frontend' | 'backend';
}

export interface PermEventSink {
  isEnabled(): boolean;
  emit(event: PermEvent): void;
}

export interface UserRole {
  siteId: string;
  role: Role;
}

export interface User {
  uid: string;
  email: string;
  roles: UserRole[];
}

export type NestedPermissions<T extends string> = {
  [subResource in T]: Action[];
};

export type FlatPermissions = Action[];

export interface PermissionMatrix {
  [role: string]: {
    groups: NestedPermissions<GroupSubResource>;
    admins: NestedPermissions<AdminSubResource>;
    assignments: FlatPermissions;
    users: FlatPermissions;
    tasks: FlatPermissions;
  };
}

export interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number;
}

export interface PermissionCheck {
  resource: Resource;
  action: Action;
  subResource?: SubResource;
}

export interface BulkPermissionResult {
  resource: Resource;
  action: Action;
  subResource?: SubResource;
  allowed: boolean;
}

export interface PermissionServiceConfig {
  defaultCacheTtl?: number;
  enableCaching?: boolean;
}

export interface VersionInfo {
  version: string;
  updatedAt: string;
}

export interface PermissionDocument {
  permissions: PermissionMatrix;
  version: string;
  updatedAt: string;
}
