export type Role = 'super_admin' | 'site_admin' | 'admin' | 'research_assistant' | 'participant';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'exclude';

export type Resource = 'groups' | 'assignments' | 'users' | 'admins' | 'tasks';

export interface UserRole {
  siteId: string;
  role: Role;
}

export interface User {
  uid: string;
  email: string;
  roles: UserRole[];
}

export interface PermissionMatrix {
  [role: string]: {
    [resource: string]: Action[];
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
}

export interface BulkPermissionResult {
  resource: Resource;
  action: Action;
  allowed: boolean;
}

export interface PermissionServiceConfig {
  defaultCacheTtl?: number;
  enableCaching?: boolean;
}

export interface VersionInfo {
  version: string;
  lastUpdated: string;
}

export interface PermissionDocument {
  permissions: PermissionMatrix;
  version: string;
  lastUpdated: string;
}
