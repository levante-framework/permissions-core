// all types
export type {
  Role,
  Action,
  Resource,
  UserRole,
  User,
  PermissionMatrix,
  CacheEntry,
  CacheOptions,
  PermissionCheck,
  BulkPermissionResult,
  PermissionServiceConfig,
  VersionInfo,
  PermissionDocument
} from './types/permissions.js';

// core services
export { PermissionService } from './services/permissionService.js';
export { CacheService } from './services/cacheService.js';

// utilities
export { VersionHandler } from './utils/versionHandler.js';
export type { 
  VersionCompatibility, 
  MigrationResult 
} from './utils/versionHandler.js';
