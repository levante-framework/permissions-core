// all types
export type {
  Role,
  Action,
  Resource,
  GroupSubResource,
  AdminSubResource,
  SubResource,
  UserRole,
  User,
  PermissionMatrix,
  NestedPermissions,
  FlatPermissions,
  CacheEntry,
  CacheOptions,
  PermissionCheck,
  BulkPermissionResult,
  PermissionServiceConfig,
  PermissionDecision,
  PermissionReason,
  PermissionDecisionDetail,
  LoggingMode,
  LoggingModeConfig,
  PermEvent,
  PermEventSink,
  VersionInfo,
  PermissionDocument
} from './types/permissions.js';

// constants
export {
  ROLES,
  RESOURCES,
  ACTIONS,
  GROUP_SUB_RESOURCES,
  ADMIN_SUB_RESOURCES,
  FLAT_RESOURCES,
  NESTED_RESOURCES,
  ALL_ROLES,
  ALL_RESOURCES,
  ALL_ACTIONS,
  ALL_GROUP_SUB_RESOURCES,
  ALL_ADMIN_SUB_RESOURCES
} from './types/constants.js';

// core services
export { PermissionService } from './services/permissionService.js';
export { CacheService } from './services/cacheService.js';

// utilities
export { VersionHandler } from './utils/versionHandler.js';
export type { 
  VersionCompatibility, 
  MigrationResult 
} from './utils/versionHandler.js';
