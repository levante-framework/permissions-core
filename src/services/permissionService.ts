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

  constructor(cacheService?: CacheService) {
    this.cache = cacheService;
  }

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

  getPermissionMatrix(): PermissionMatrix {
    return { ...this.permissionMatrix };
  }

  getVersion(): string {
    return this.version;
  }

  isPermissionsLoaded(): boolean {
    return this.isLoaded;
  }

  private isSuperAdmin(user: User): boolean {
    return user.roles.some(role => role.role === 'super_admin');
  }

  getUserSiteRole(user: User, siteId: string): Role | null {
    if (this.isSuperAdmin(user)) {
      return 'super_admin';
    }

    const siteRole = user.roles.find(role => role.siteId === siteId);
    return siteRole?.role || null;
  }

  hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
    const userLevel = PermissionService.ROLE_HIERARCHY.indexOf(userRole);
    const requiredLevel = PermissionService.ROLE_HIERARCHY.indexOf(requiredRole);
    
    if (userLevel === -1 || requiredLevel === -1) {
      return false;
    }

    return userLevel >= requiredLevel;
  }

  canPerformGlobalAction(user: User, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
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

  canPerformSiteAction(user: User, siteId: string, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
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

  roleHasPermission(role: Role, resource: Resource, action: Action): boolean {
    if (!this.isLoaded) {
      console.warn('Permissions not loaded yet');
      return false;
    }

    const allowedActions = this.permissionMatrix[role]?.[resource] || [];
    return allowedActions.includes(action);
  }

  clearUserCache(userId: string): void {
    if (this.cache) {
      this.cache.clearUser(userId);
    }
  }

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

  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache?.size() || 0,
      enabled: !!this.cache
    };
  }
}
