import type { 
  User, 
  Role, 
  Resource, 
  Action, 
  PermissionMatrix, 
  PermissionDocument,
  PermissionCheck,
  BulkPermissionResult
} from '../types/permissions.js';
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

  private static readonly ROLE_HIERARCHY: Role[] = [
    'participant',
    'research_assistant', 
    'admin',
    'site_admin',
    'super_admin'
  ];

  /**
   * Creates a new PermissionService instance.
   * @param cacheService - Optional cache service for performance optimization
   */
  constructor(cacheService?: CacheService) {
    this.cache = cacheService;
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
    if (!user || !user.roles) return false;
    return user.roles.some(role => role.role === 'super_admin');
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
      return 'super_admin';
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
   * @returns True if user can perform the global action
   */
  canPerformGlobalAction(user: User, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return false;
    }

    if (!user || !resource || !action) {
      return false;
    }

    if (!this.isSuperAdmin(user)) {
      return false;
    }

    const cacheKey = this.cache?.generatePermissionKey(user.uid, '*', resource, action);
    if (cacheKey && this.cache?.has(cacheKey)) {
      return this.cache.get<boolean>(cacheKey) || false;
    }

    const allowedActions = this.permissionMatrix['super_admin']?.[resource] || [];
    const result = allowedActions.includes(action);

    if (cacheKey) {
      this.cache?.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Checks if a user can perform an action on a resource within a specific site.
   * Super admins are checked against global permissions.
   * Results are cached for performance.
   * @param user - User object
   * @param siteId - Site identifier
   * @param resource - Resource type (groups, users, etc.)
   * @param action - Action type (create, read, update, delete, exclude)
   * @returns True if user can perform the action on the resource
   */
  canPerformSiteAction(user: User, siteId: string, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return false;
    }

    if (!user || !siteId || !resource || !action) {
      return false;
    }

    if (this.isSuperAdmin(user)) {
      return this.canPerformGlobalAction(user, resource, action);
    }

    const cacheKey = this.cache?.generatePermissionKey(user.uid, siteId, resource, action);
    if (cacheKey && this.cache?.has(cacheKey)) {
      return this.cache.get<boolean>(cacheKey) || false;
    }

    const userRole = this.getUserSiteRole(user, siteId);
    if (!userRole) {
      if (cacheKey) {
        this.cache?.set(cacheKey, false);
      }
      return false;
    }

    const allowedActions = this.permissionMatrix[userRole]?.[resource] || [];
    const result = allowedActions.includes(action);

    if (cacheKey) {
      this.cache?.set(cacheKey, result);
    }

    return result;
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
      return ['*']; // Indicates all sites
    }

    const minLevel = PermissionService.ROLE_HIERARCHY.indexOf(minRole);
    if (minLevel === -1) {
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
   * Gets all resources the user can perform a specific action on within a site.
   * @param user - User object
   * @param siteId - Site identifier
   * @param action - Action to check (create, read, update, delete, exclude)
   * @returns Array of accessible resource types
   */
  getAccessibleResources(user: User, siteId: string, action: Action): Resource[] {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return [];
    }

    const resources: Resource[] = ['groups', 'assignments', 'users', 'admins', 'tasks'];
    const accessibleResources: Resource[] = [];

    for (const resource of resources) {
      if (this.canPerformSiteAction(user, siteId, resource, action)) {
        accessibleResources.push(resource);
      }
    }

    return accessibleResources;
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
      console.warn('Permissions not loaded yet');
      return checks.map(check => ({
        resource: check.resource,
        action: check.action,
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
      allowed: this.canPerformSiteAction(user, siteId, check.resource, check.action)
    }));

    if (cacheKey) {
      this.cache?.set(cacheKey, results);
    }

    return results;
  }

  /**
   * Gets all permissions for a specific role.
   * @param role - Role to get permissions for
   * @returns Object mapping resources to arrays of allowed actions
   */
  getRolePermissions(role: Role): Record<Resource, Action[]> {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return {} as Record<Resource, Action[]>;
    }

    const rolePermissions = this.permissionMatrix[role];
    if (!rolePermissions) {
      return {} as Record<Resource, Action[]>;
    }

    return { ...rolePermissions } as Record<Resource, Action[]>;
  }

  /**
   * Checks if a specific role has permission for a resource/action combination.
   * @param role - Role to check
   * @param resource - Resource type
   * @param action - Action type
   * @returns True if the role has the permission
   */
  roleHasPermission(role: Role, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return false;
    }

    const allowedActions = this.permissionMatrix[role]?.[resource] || [];
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
      .map(check => `${check.resource}:${check.action}`)
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
