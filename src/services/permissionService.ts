import type { 
  User, 
  Role, 
  Resource, 
  Action, 
  PermissionMatrix, 
  PermissionDocument,
  PermissionCheck,
  BulkPermissionResult,
  SubResource,
  GroupSubResource,
  AdminSubResource,
  PermissionDecisionDetail,
  LoggingModeConfig,
  PermEvent,
  PermEventSink
} from '../types/permissions.js';
export const NoopPermEventSink: PermEventSink = Object.freeze({
  isEnabled: () => false,
  emit: () => {}
});

import { 
  ROLES, 
  RESOURCES, 
  ALL_GROUP_SUB_RESOURCES, 
  ALL_ADMIN_SUB_RESOURCES, 
  FLAT_RESOURCES 
} from '../types/constants.js';
import { CacheService } from './cacheService.js';
import { VersionHandler } from '../utils/versionHandler.js';

/**
 * Service for managing resource-based permissions in a multi-site environment.
 * Supports role hierarchy, caching, and bulk permission checking.
 */
export class PermissionService {
  private permissionMatrix: PermissionMatrix = {};
  private version: string = '';
  private isLoaded: boolean = false;
  private cache?: CacheService;
  private loggingConfig: LoggingModeConfig;
  private sink: PermEventSink;

  private static readonly ROLE_HIERARCHY: Role[] = [
    ROLES.PARTICIPANT,
    ROLES.RESEARCH_ASSISTANT, 
    ROLES.ADMIN,
    ROLES.SITE_ADMIN,
    ROLES.SUPER_ADMIN
  ];

  /**
   * Creates a new PermissionService instance.
   * @param cacheService - Optional cache service for performance optimization
   * @param loggingConfig - Runtime logging configuration (defaults to off when omitted; typically sourced from env/remote config)
   */
  constructor(cacheService?: CacheService, loggingConfig?: LoggingModeConfig, sink: PermEventSink = NoopPermEventSink) {
    this.cache = cacheService;
    this.loggingConfig = {
      mode: loggingConfig?.mode ?? 'off'
    };
    this.sink = sink ?? NoopPermEventSink;
  }

  /**
   * Loads and validates permission matrix from a document.
   * Clears cache on successful load.
   * @param document - Permission document containing version and permissions
   * @returns Result object with success status, errors, and warnings
   */
  loadPermissions(document: PermissionDocument): { success: boolean; errors: string[]; warnings: string[] } {
    const result = VersionHandler.processPermissionDocument(document);
    
    if (!result.success) {
      this.isLoaded = false;
      return {
        success: false,
        errors: result.errors,
        warnings: result.warnings
      };
    }

    this.permissionMatrix = result.permissionMatrix!;
    this.version = result.version!;
    this.isLoaded = true;

    if (this.cache) {
      this.cache.clear();
    }

    return {
      success: true,
      errors: result.errors,
      warnings: result.warnings
    };
  }

  /**
   * Gets a deep copy of the current permission matrix.
   * @returns Deep copy of the permission matrix
   */
  getPermissionMatrix(): PermissionMatrix {
    // Deep clone to prevent external mutation of internal state
    return JSON.parse(JSON.stringify(this.permissionMatrix));
  }

  /**
   * Gets the version of the currently loaded permission matrix.
   * @returns Version string
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Checks if permissions have been successfully loaded.
   * @returns True if permissions are loaded and ready for use
   */
  isPermissionsLoaded(): boolean {
    return this.isLoaded;
  }

  private isSuperAdmin(user: User): boolean {
    if (!user || !user.roles) {
      console.warn('isSuperAdmin check failed: user or user.roles is missing');
      return false;
    }
    return user.roles.some(role => role.role === ROLES.SUPER_ADMIN);
  }

  private requiresSubResource(resource: Resource): boolean {
    return resource === RESOURCES.GROUPS || resource === RESOURCES.ADMINS;
  }

  private isValidSubResource(resource: Resource, subResource: string): boolean {
    if (resource === RESOURCES.GROUPS) {
      return ALL_GROUP_SUB_RESOURCES.includes(subResource as GroupSubResource);
    } else if (resource === RESOURCES.ADMINS) {
      return ALL_ADMIN_SUB_RESOURCES.includes(subResource as AdminSubResource);
    }
    return false;
  }

  private getActionsForResource(
    role: Role,
    resource: Resource,
    subResource?: SubResource
  ): Action[] {
    const rolePermissions = this.permissionMatrix[role];
    if (!rolePermissions) {
      return [];
    }

    const resourcePermissions = rolePermissions[resource];
    
    if (resource === RESOURCES.GROUPS || resource === RESOURCES.ADMINS) {
      if (!subResource) {
        return [];
      }
      
      if (typeof resourcePermissions === 'object' && !Array.isArray(resourcePermissions)) {
        return (resourcePermissions as any)[subResource] || [];
      }
      return [];
    } else {
      if (Array.isArray(resourcePermissions)) {
        return resourcePermissions;
      }
      return [];
    }
  }

  /**
   * Gets the user's role for a specific site.
   * Super admins always return 'super_admin' regardless of site.
   * @param user - User object with roles array
   * @param siteId - Site identifier
   * @returns User's role for the site, or null if no role found
   */
  getUserSiteRole(user: User, siteId: string): Role | null {
    if (this.isSuperAdmin(user)) {
      return ROLES.SUPER_ADMIN;
    }

    const siteRole = user.roles.find(role => role.siteId === siteId);
    return siteRole?.role || null;
  }

  /**
   * Checks if a user role meets the minimum required role level.
   * Uses role hierarchy: participant < research_assistant < admin < site_admin < super_admin
   * @param userRole - User's current role
   * @param requiredRole - Minimum required role
   * @returns True if user role meets or exceeds required role
   */
  hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
    const userLevel = PermissionService.ROLE_HIERARCHY.indexOf(userRole);
    const requiredLevel = PermissionService.ROLE_HIERARCHY.indexOf(requiredRole);
    
    if (userLevel === -1 || requiredLevel === -1) {
      console.warn('hasMinimumRole failed: invalid role', { userRole, requiredRole, userLevel, requiredLevel });
      return false;
    }

    return userLevel >= requiredLevel;
  }

  /**
   * Checks if a user can perform a global action (super admin only).
   * Results are cached for performance.
   * @param user - User object
   * @param resource - Resource type (groups, users, etc.)
   * @param action - Action type (create, read, update, delete, exclude)
   * @param subResource - Optional sub-resource (required for groups and admins)
   * @returns True if user can perform the global action
   */
  canPerformGlobalAction(user: User, resource: Resource, action: Action, subResource?: SubResource): boolean {
    const sinkEnabled = this.sink.isEnabled();
    const includeReason = sinkEnabled && this.shouldComputeDecisionDetails();
    const evaluation = this.evaluateGlobalActionDetailed(user, resource, action, subResource, includeReason);

    if (sinkEnabled && evaluation.detail) {
      this.emitPermissionEvent({
        detail: evaluation.detail,
        user,
        siteId: '*',
        resource,
        action,
        subResource
      });
    }

    return evaluation.allowed;
  }

  /**
   * Checks if a user can perform an action on a resource within a specific site.
   * Super admins are checked against global permissions.
   * Results are cached for performance.
   * @param user - User object
   * @param siteId - Site identifier
   * @param resource - Resource type (groups, users, etc.)
   * @param action - Action type (create, read, update, delete, exclude)
   * @param subResource - Optional sub-resource (required for groups and admins)
   * @returns True if user can perform the action on the resource
   */
  canPerformSiteAction(user: User, siteId: string, resource: Resource, action: Action, subResource?: SubResource): boolean {
    const sinkEnabled = this.sink.isEnabled();
    const includeReason = sinkEnabled && this.shouldComputeDecisionDetails();
    const evaluation = this.evaluateSiteActionDetailed(user, siteId, resource, action, subResource, includeReason);

    if (sinkEnabled && evaluation.detail) {
      this.emitPermissionEvent({
        detail: evaluation.detail,
        user,
        siteId,
        resource,
        action,
        subResource
      });
    }

    return evaluation.allowed;
  }

  private evaluateGlobalActionDetailed(
    user: User | null | undefined,
    resource: Resource | null | undefined,
    action: Action | null | undefined,
    subResource: SubResource | undefined,
    includeReason: boolean = false
  ): PermissionEvaluationResult {
    if (!this.isLoaded) {
      console.warn('canPerformGlobalAction failed: permissions not loaded yet');
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'NOT_LOADED' } }
        : { allowed: false };
    }

    if (!user || !resource || !action) {
      console.warn('canPerformGlobalAction failed: missing required parameters', { user: !!user, resource, action });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'MISSING_PARAMS' } }
        : { allowed: false };
    }

    if (!this.isSuperAdmin(user)) {
      console.warn('canPerformGlobalAction failed: user is not super admin', { userId: user.uid });
      return includeReason
        ? { allowed: false, detail: { decision: 'deny', reason: 'NOT_ALLOWED' } }
        : { allowed: false };
    }

    if (this.requiresSubResource(resource) && !subResource) {
      console.warn('canPerformGlobalAction failed: resource requires sub-resource', { resource });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'REQUIRES_SUBRESOURCE' } }
        : { allowed: false };
    }

    if (subResource && !this.isValidSubResource(resource, subResource)) {
      console.warn('canPerformGlobalAction failed: invalid sub-resource', { resource, subResource });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'INVALID_SUBRESOURCE' } }
        : { allowed: false };
    }

    const cacheKey = this.cache?.generatePermissionKey(user.uid, '*', resource, action, subResource);
    if (cacheKey && this.cache?.has(cacheKey) && !includeReason) {
      return { allowed: this.cache.get<boolean>(cacheKey) || false };
    }

    const allowedActions = this.getActionsForResource(ROLES.SUPER_ADMIN, resource, subResource);
    const allowed = allowedActions.includes(action);

    if (cacheKey) {
      this.cache?.set(cacheKey, allowed);
    }

    if (!includeReason) {
      return { allowed };
    }

    return {
      allowed,
      detail: allowed
        ? { decision: 'allow', reason: 'ALLOWED' }
        : { decision: 'deny', reason: 'NOT_ALLOWED' }
    };
  }

  private evaluateSiteActionDetailed(
    user: User | null | undefined,
    siteId: string | null | undefined,
    resource: Resource | null | undefined,
    action: Action | null | undefined,
    subResource: SubResource | undefined,
    includeReason: boolean = false
  ): PermissionEvaluationResult {
    if (!this.isLoaded) {
      console.warn('canPerformSiteAction failed: permissions not loaded yet');
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'NOT_LOADED' } }
        : { allowed: false };
    }

    if (!user || !siteId || !resource || !action) {
      console.warn('canPerformSiteAction failed: missing required parameters', { user: !!user, siteId, resource, action });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'MISSING_PARAMS' } }
        : { allowed: false };
    }

    if (this.requiresSubResource(resource) && !subResource) {
      console.warn('canPerformSiteAction failed: resource requires sub-resource', { resource });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'REQUIRES_SUBRESOURCE' } }
        : { allowed: false };
    }

    if (subResource && !this.isValidSubResource(resource, subResource)) {
      console.warn('canPerformSiteAction failed: invalid sub-resource', { resource, subResource });
      return includeReason
        ? { allowed: false, detail: { decision: 'indeterminate', reason: 'INVALID_SUBRESOURCE' } }
        : { allowed: false };
    }

    if (this.isSuperAdmin(user)) {
      return this.evaluateGlobalActionDetailed(user, resource, action, subResource, includeReason);
    }

    const cacheKey = this.cache?.generatePermissionKey(user.uid, siteId, resource, action, subResource);
    if (cacheKey && this.cache?.has(cacheKey) && !includeReason) {
      return { allowed: this.cache.get<boolean>(cacheKey) || false };
    }

    const userRole = this.getUserSiteRole(user, siteId);
    if (!userRole) {
      console.warn('canPerformSiteAction failed: user has no role for site', { userId: user.uid, siteId });
      if (cacheKey) {
        this.cache?.set(cacheKey, false);
      }
      return includeReason
        ? { allowed: false, detail: { decision: 'deny', reason: 'NO_ROLE' } }
        : { allowed: false };
    }

    const allowedActions = this.getActionsForResource(userRole, resource, subResource);
    const allowed = allowedActions.includes(action);

    if (cacheKey) {
      this.cache?.set(cacheKey, allowed);
    }

    if (!includeReason) {
      return { allowed };
    }

    return {
      allowed,
      detail: allowed
        ? { decision: 'allow', reason: 'ALLOWED' }
        : { decision: 'deny', reason: 'NOT_ALLOWED' }
    };
  }

  private emitPermissionEvent(params: {
    detail?: PermissionDecisionDetail;
    user?: User | null;
    siteId?: string | null;
    resource?: Resource | null;
    action?: Action | null;
    subResource?: SubResource;
  }): void {
    const { detail, user, siteId, resource, action, subResource } = params;

    if (!detail) {
      return;
    }

    const event: PermEvent = {
      decision: detail.decision,
      reason: detail.reason,
      action: action ?? undefined,
      resource: resource ?? undefined,
      subResource,
      resourceKey: this.buildResourceKey(resource, subResource),
      siteId: siteId ?? undefined,
      userId: user?.uid,
      timestamp: Date.now(),
      environment: this.detectEnvironment()
    };

    try {
      this.sink.emit(event);
    } catch (error) {
      console.warn('PermissionService logging sink failed to emit event', error);
    }
  }

  private shouldComputeDecisionDetails(): boolean {
    return this.loggingConfig.mode !== 'off';
  }

  private buildResourceKey(resource?: Resource | null, subResource?: SubResource): string | undefined {
    if (!resource) {
      return undefined;
    }
    return subResource ? `${resource}:${subResource}` : resource;
  }

  private detectEnvironment(): 'frontend' | 'backend' {
    return typeof window === 'undefined' ? 'backend' : 'frontend';
  }

  /**
   * Gets all sites where the user has at least the minimum required role.
   * Super admins return ['*'] indicating access to all sites.
   * @param user - User object
   * @param minRole - Minimum required role level
   * @returns Array of site IDs, or ['*'] for super admins
   */
  getSitesWithMinRole(user: User, minRole: Role): string[] {
    if (this.isSuperAdmin(user)) {
      return ['*'];
    }

    const minLevel = PermissionService.ROLE_HIERARCHY.indexOf(minRole);
    if (minLevel === -1) {
      console.warn('getSitesWithMinRole failed: invalid minimum role', { minRole });
      return [];
    }

    return user.roles
      .filter(siteRole => {
        const userLevel = PermissionService.ROLE_HIERARCHY.indexOf(siteRole.role);
        return userLevel >= minLevel;
      })
      .map(siteRole => siteRole.siteId);
  }

  /**
   * Gets all flat resources (assignments, users, tasks) the user can perform a specific action on within a site.
   * Note: For nested resources (groups, admins), use specific sub-resource methods.
   * @param user - User object
   * @param siteId - Site identifier
   * @param action - Action to check (create, read, update, delete, exclude)
   * @returns Array of accessible flat resource types
   */
  getAccessibleResources(user: User, siteId: string, action: Action): Resource[] {
    if (!this.isLoaded) {
      console.warn('getAccessibleResources failed: permissions not loaded yet');
      return [];
    }

    const accessibleResources: Resource[] = [];

    for (const resource of FLAT_RESOURCES) {
      if (this.canPerformSiteAction(user, siteId, resource, action)) {
        accessibleResources.push(resource);
      }
    }

    return accessibleResources;
  }

  /**
   * Gets all group sub-resources the user can perform a specific action on within a site.
   * @param user - User object
   * @param siteId - Site identifier
   * @param action - Action to check (create, read, update, delete, exclude)
   * @returns Array of accessible group sub-resources
   */
  getAccessibleGroupSubResources(user: User, siteId: string, action: Action): GroupSubResource[] {
    if (!this.isLoaded) {
      console.warn('getAccessibleGroupSubResources failed: permissions not loaded yet');
      return [];
    }

    const accessibleSubResources: GroupSubResource[] = [];

    for (const subResource of ALL_GROUP_SUB_RESOURCES) {
      if (this.canPerformSiteAction(user, siteId, RESOURCES.GROUPS, action, subResource)) {
        accessibleSubResources.push(subResource);
      }
    }

    return accessibleSubResources;
  }

  /**
   * Gets all admin sub-resources the user can perform a specific action on within a site.
   * @param user - User object
   * @param siteId - Site identifier
   * @param action - Action to check (create, read, update, delete, exclude)
   * @returns Array of accessible admin sub-resources
   */
  getAccessibleAdminSubResources(user: User, siteId: string, action: Action): AdminSubResource[] {
    if (!this.isLoaded) {
      console.warn('getAccessibleAdminSubResources failed: permissions not loaded yet');
      return [];
    }

    const accessibleSubResources: AdminSubResource[] = [];

    for (const subResource of ALL_ADMIN_SUB_RESOURCES) {
      if (this.canPerformSiteAction(user, siteId, RESOURCES.ADMINS, action, subResource)) {
        accessibleSubResources.push(subResource);
      }
    }

    return accessibleSubResources;
  }

  /**
   * Performs multiple permission checks in a single operation.
   * More efficient than individual checks when checking multiple permissions.
   * Results are cached as a group for better performance.
   * @param user - User object
   * @param siteId - Site identifier
   * @param checks - Array of resource/action combinations to check
   * @returns Array of results with allowed status for each check
   */
  bulkPermissionCheck(user: User, siteId: string, checks: PermissionCheck[]): BulkPermissionResult[] {
    if (!this.isLoaded) {
      console.warn('bulkPermissionCheck failed: permissions not loaded yet');
      return checks.map(check => ({
        resource: check.resource,
        action: check.action,
        subResource: check.subResource,
        allowed: false
      }));
    }

    const checkHash = this.generateBulkCheckHash(checks);
    const cacheKey = this.cache?.generateBulkPermissionKey(user.uid, siteId, checkHash);
    
    if (cacheKey && this.cache?.has(cacheKey)) {
      return this.cache.get<BulkPermissionResult[]>(cacheKey) || [];
    }

    const results: BulkPermissionResult[] = checks.map(check => ({
      resource: check.resource,
      action: check.action,
      subResource: check.subResource,
      allowed: this.canPerformSiteAction(user, siteId, check.resource, check.action, check.subResource)
    }));

    if (cacheKey) {
      this.cache?.set(cacheKey, results);
    }

    return results;
  }

  /**
   * Gets all permissions for a specific role.
   * @param role - Role to get permissions for
   * @returns Permission matrix for the role (nested structure for groups/admins, flat for others)
   */
  getRolePermissions(role: Role): PermissionMatrix[Role] | {} {
    if (!this.isLoaded) {
      console.warn('getRolePermissions failed: permissions not loaded yet');
      return {};
    }

    const rolePermissions = this.permissionMatrix[role];
    if (!rolePermissions) {
      console.warn('getRolePermissions failed: role not found in permission matrix', { role });
      return {};
    }

    // Deep clone to prevent external mutation of internal state
    return JSON.parse(JSON.stringify(rolePermissions));
  }

  /**
   * Checks if a specific role has permission for a resource/action combination.
   * @param role - Role to check
   * @param resource - Resource type
   * @param action - Action type
   * @param subResource - Optional sub-resource (required for groups and admins)
   * @returns True if the role has the permission
   */
  roleHasPermission(role: Role, resource: Resource, action: Action, subResource?: SubResource): boolean {
    if (!this.isLoaded) {
      console.warn('roleHasPermission failed: permissions not loaded yet');
      return false;
    }

    if (this.requiresSubResource(resource) && !subResource) {
      console.warn('roleHasPermission failed: resource requires sub-resource', { resource });
      return false;
    }

    if (subResource && !this.isValidSubResource(resource, subResource)) {
      console.warn('roleHasPermission failed: invalid sub-resource', { resource, subResource });
      return false;
    }

    const allowedActions = this.getActionsForResource(role, resource, subResource);
    return allowedActions.includes(action);
  }

  /**
   * Clears all cached data for a specific user.
   * Should be called when user roles change.
   * @param userId - User ID to clear cache for
   */
  clearUserCache(userId: string): void {
    if (this.cache) {
      this.cache.clearUser(userId);
    }
  }

  /**
   * Clears all cached permission data.
   * Useful when permission matrix is updated.
   */
  clearAllCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  private generateBulkCheckHash(checks: PermissionCheck[]): string {
    const sortedChecks = checks
      .map(check => {
        const subResStr = check.subResource ? `:${check.subResource}` : '';
        return `${check.resource}${subResStr}:${check.action}`;
      })
      .sort()
      .join('|');
    
    return btoa(sortedChecks).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  /**
   * Gets cache statistics for monitoring and debugging.
   * @returns Object with cache size and enabled status
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache?.size() || 0,
      enabled: !!this.cache
    };
  }
}

type PermissionEvaluationResult = {
  allowed: boolean;
  detail?: PermissionDecisionDetail;
};
