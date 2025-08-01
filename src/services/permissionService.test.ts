import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionService } from './permissionService.js';
import { CacheService } from './cacheService.js';
import type { 
  User, 
  PermissionDocument, 
  PermissionMatrix,
  PermissionCheck,
  Role 
} from '../types/permissions.js';

describe('PermissionService', () => {
  let service: PermissionService;
  let cache: CacheService;

  const validPermissionMatrix: PermissionMatrix = {
    'super_admin': {
      'groups': ['create', 'read', 'update', 'delete', 'exclude'],
      'assignments': ['create', 'read', 'update', 'delete', 'exclude'],
      'users': ['create', 'read', 'update', 'delete', 'exclude'],
      'admins': ['create', 'read', 'update', 'delete', 'exclude'],
      'tasks': ['create', 'read', 'update', 'delete', 'exclude']
    },
    'site_admin': {
      'groups': ['create', 'read', 'update', 'delete', 'exclude'],
      'assignments': ['create', 'read', 'update', 'delete', 'exclude'],
      'users': ['create', 'read', 'update', 'delete', 'exclude'],
      'admins': ['create', 'read', 'update', 'delete', 'exclude'],
      'tasks': ['create', 'read', 'update', 'delete', 'exclude']
    },
    'admin': {
      'groups': ['create', 'read', 'update'],
      'assignments': ['create', 'read', 'update'],
      'users': ['create', 'read', 'update'],
      'admins': ['read'],
      'tasks': ['read']
    },
    'research_assistant': {
      'groups': ['read'],
      'assignments': ['read'],
      'users': ['create', 'read'],
      'admins': ['read'],
      'tasks': ['read']
    },
    'participant': {
      'groups': [],
      'assignments': [],
      'users': [],
      'admins': [],
      'tasks': []
    }
  };

  const validPermissionDocument: PermissionDocument = {
    permissions: validPermissionMatrix,
    version: '1.0.0',
    lastUpdated: '2025-01-01T00:00:00Z'
  };

  const superAdminUser: User = {
    uid: 'super-admin-123',
    email: 'super@example.com',
    roles: [
      { siteId: 'site1', role: 'super_admin' }
    ]
  };

  const siteAdminUser: User = {
    uid: 'site-admin-123',
    email: 'siteadmin@example.com',
    roles: [
      { siteId: 'site1', role: 'site_admin' },
      { siteId: 'site2', role: 'admin' }
    ]
  };

  const adminUser: User = {
    uid: 'admin-123',
    email: 'admin@example.com',
    roles: [
      { siteId: 'site1', role: 'admin' }
    ]
  };

  const researchAssistantUser: User = {
    uid: 'research-123',
    email: 'research@example.com',
    roles: [
      { siteId: 'site1', role: 'research_assistant' }
    ]
  };

  const participantUser: User = {
    uid: 'participant-123',
    email: 'participant@example.com',
    roles: [
      { siteId: 'site1', role: 'participant' }
    ]
  };

  const multiSiteUser: User = {
    uid: 'multi-site-123',
    email: 'multisite@example.com',
    roles: [
      { siteId: 'site1', role: 'admin' },
      { siteId: 'site2', role: 'research_assistant' },
      { siteId: 'site3', role: 'site_admin' }
    ]
  };

  beforeEach(() => {
    cache = new CacheService(1000); // 1 second TTL for testing
    service = new PermissionService(cache);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('constructor', () => {
    it('should create service without cache', () => {
      const serviceWithoutCache = new PermissionService();
      expect(serviceWithoutCache).toBeInstanceOf(PermissionService);
      expect(serviceWithoutCache.getCacheStats().enabled).toBe(false);
    });

    it('should create service with cache', () => {
      expect(service).toBeInstanceOf(PermissionService);
      expect(service.getCacheStats().enabled).toBe(true);
    });
  });

  describe('permission loading', () => {
    it('should load valid permission document successfully', () => {
      const result = service.loadPermissions(validPermissionDocument);
      
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(service.isPermissionsLoaded()).toBe(true);
      expect(service.getVersion()).toBe('1.0.0');
    });

    it('should reject invalid permission document', () => {
      const invalidDoc = {
        permissions: 'invalid',
        version: '1.0.0'
      } as any;
      
      const result = service.loadPermissions(invalidDoc);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(service.isPermissionsLoaded()).toBe(false);
    });

    it('should clear cache when loading new permissions', () => {
      service.loadPermissions(validPermissionDocument);
      
      // Add something to cache
      cache.set('test-key', 'test-value');
      expect(cache.size()).toBe(1);
      
      // Load permissions again
      service.loadPermissions(validPermissionDocument);
      expect(cache.size()).toBe(0);
    });

    it('should return permission matrix copy', () => {
      service.loadPermissions(validPermissionDocument);
      
      const matrix = service.getPermissionMatrix();
      expect(matrix).toEqual(validPermissionMatrix);
      
      // Modifying returned matrix shouldn't affect internal state
      matrix['admin']['groups'] = [];
      expect(service.getPermissionMatrix()['admin']['groups']).toEqual(['create', 'read', 'update']);
    });
  });

  describe('role hierarchy logic', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should correctly identify role hierarchy', () => {
      expect(service.hasMinimumRole('participant', 'participant')).toBe(true);
      expect(service.hasMinimumRole('research_assistant', 'participant')).toBe(true);
      expect(service.hasMinimumRole('admin', 'research_assistant')).toBe(true);
      expect(service.hasMinimumRole('site_admin', 'admin')).toBe(true);
      expect(service.hasMinimumRole('super_admin', 'site_admin')).toBe(true);
    });

    it('should reject insufficient role levels', () => {
      expect(service.hasMinimumRole('participant', 'admin')).toBe(false);
      expect(service.hasMinimumRole('research_assistant', 'admin')).toBe(false);
      expect(service.hasMinimumRole('admin', 'site_admin')).toBe(false);
      expect(service.hasMinimumRole('site_admin', 'super_admin')).toBe(false);
    });

    it('should handle invalid roles', () => {
      expect(service.hasMinimumRole('invalid_role' as Role, 'admin')).toBe(false);
      expect(service.hasMinimumRole('admin', 'invalid_role' as Role)).toBe(false);
    });
  });

  describe('user role retrieval', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should return super admin role for super admin users', () => {
      const role = service.getUserSiteRole(superAdminUser, 'any-site');
      expect(role).toBe('super_admin');
    });

    it('should return correct site-specific role', () => {
      expect(service.getUserSiteRole(siteAdminUser, 'site1')).toBe('site_admin');
      expect(service.getUserSiteRole(siteAdminUser, 'site2')).toBe('admin');
    });

    it('should return null for sites without role', () => {
      const role = service.getUserSiteRole(adminUser, 'site-without-role');
      expect(role).toBeNull();
    });

    it('should handle multi-site users correctly', () => {
      expect(service.getUserSiteRole(multiSiteUser, 'site1')).toBe('admin');
      expect(service.getUserSiteRole(multiSiteUser, 'site2')).toBe('research_assistant');
      expect(service.getUserSiteRole(multiSiteUser, 'site3')).toBe('site_admin');
      expect(service.getUserSiteRole(multiSiteUser, 'site4')).toBeNull();
    });
  });

  describe('site-specific permission checks', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should allow admin to create groups', () => {
      const result = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      expect(result).toBe(true);
    });

    it('should deny admin from deleting groups', () => {
      const result = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'delete');
      expect(result).toBe(false);
    });

    it('should allow research assistant to read users', () => {
      const result = service.canPerformSiteAction(researchAssistantUser, 'site1', 'users', 'read');
      expect(result).toBe(true);
    });

    it('should allow research assistant to create users', () => {
      const result = service.canPerformSiteAction(researchAssistantUser, 'site1', 'users', 'create');
      expect(result).toBe(true);
    });

    it('should deny research assistant from updating users', () => {
      const result = service.canPerformSiteAction(researchAssistantUser, 'site1', 'users', 'update');
      expect(result).toBe(false);
    });

    it('should deny participant all actions', () => {
      expect(service.canPerformSiteAction(participantUser, 'site1', 'groups', 'read')).toBe(false);
      expect(service.canPerformSiteAction(participantUser, 'site1', 'users', 'read')).toBe(false);
      expect(service.canPerformSiteAction(participantUser, 'site1', 'tasks', 'read')).toBe(false);
    });

    it('should deny actions for users without site role', () => {
      const result = service.canPerformSiteAction(adminUser, 'site-without-role', 'groups', 'read');
      expect(result).toBe(false);
    });

    it('should return false when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const result = unloadedService.canPerformSiteAction(adminUser, 'site1', 'groups', 'read');
      expect(result).toBe(false);
    });
  });

  describe('global permission checks (super admin)', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should allow super admin global actions', () => {
      expect(service.canPerformGlobalAction(superAdminUser, 'groups', 'create')).toBe(true);
      expect(service.canPerformGlobalAction(superAdminUser, 'users', 'delete')).toBe(true);
      expect(service.canPerformGlobalAction(superAdminUser, 'admins', 'exclude')).toBe(true);
    });

    it('should deny global actions for non-super admin users', () => {
      expect(service.canPerformGlobalAction(siteAdminUser, 'groups', 'create')).toBe(false);
      expect(service.canPerformGlobalAction(adminUser, 'users', 'read')).toBe(false);
      expect(service.canPerformGlobalAction(participantUser, 'groups', 'read')).toBe(false);
    });

    it('should route super admin site actions to global actions', () => {
      const result = service.canPerformSiteAction(superAdminUser, 'any-site', 'groups', 'delete');
      expect(result).toBe(true);
    });
  });

  describe('sites with minimum role', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should return all sites for super admin', () => {
      const sites = service.getSitesWithMinRole(superAdminUser, 'admin');
      expect(sites).toEqual(['*']);
    });

    it('should return sites where user has minimum role', () => {
      const sites = service.getSitesWithMinRole(multiSiteUser, 'admin');
      expect(sites).toContain('site1'); // admin role
      expect(sites).toContain('site3'); // site_admin role
      expect(sites).not.toContain('site2'); // research_assistant role
    });

    it('should return empty array for insufficient roles', () => {
      const sites = service.getSitesWithMinRole(participantUser, 'admin');
      expect(sites).toEqual([]);
    });

    it('should handle invalid minimum role', () => {
      const sites = service.getSitesWithMinRole(adminUser, 'invalid_role' as Role);
      expect(sites).toEqual([]);
    });
  });

  describe('accessible resources', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should return resources admin can create', () => {
      const resources = service.getAccessibleResources(adminUser, 'site1', 'create');
      expect(resources).toContain('groups');
      expect(resources).toContain('assignments');
      expect(resources).toContain('users');
      expect(resources).not.toContain('admins');
      expect(resources).not.toContain('tasks');
    });

    it('should return resources research assistant can read', () => {
      const resources = service.getAccessibleResources(researchAssistantUser, 'site1', 'read');
      expect(resources).toContain('groups');
      expect(resources).toContain('assignments');
      expect(resources).toContain('users');
      expect(resources).toContain('admins');
      expect(resources).toContain('tasks');
    });

    it('should return empty array for participant', () => {
      const resources = service.getAccessibleResources(participantUser, 'site1', 'read');
      expect(resources).toEqual([]);
    });

    it('should return empty array when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const resources = unloadedService.getAccessibleResources(adminUser, 'site1', 'read');
      expect(resources).toEqual([]);
    });
  });

  describe('bulk permission checking', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should check multiple permissions at once', () => {
      const checks: PermissionCheck[] = [
        { resource: 'groups', action: 'create' },
        { resource: 'groups', action: 'delete' },
        { resource: 'users', action: 'read' },
        { resource: 'admins', action: 'create' }
      ];

      const results = service.bulkPermissionCheck(adminUser, 'site1', checks);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ resource: 'groups', action: 'create', allowed: true });
      expect(results[1]).toEqual({ resource: 'groups', action: 'delete', allowed: false });
      expect(results[2]).toEqual({ resource: 'users', action: 'read', allowed: true });
      expect(results[3]).toEqual({ resource: 'admins', action: 'create', allowed: false });
    });

    it('should return all false when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const checks: PermissionCheck[] = [
        { resource: 'groups', action: 'create' }
      ];

      const results = unloadedService.bulkPermissionCheck(adminUser, 'site1', checks);
      expect(results[0].allowed).toBe(false);
    });

    it('should handle empty checks array', () => {
      const results = service.bulkPermissionCheck(adminUser, 'site1', []);
      expect(results).toEqual([]);
    });
  });

  describe('role permissions retrieval', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should return permissions for valid role', () => {
      const permissions = service.getRolePermissions('admin');
      expect(permissions.groups).toEqual(['create', 'read', 'update']);
      expect(permissions.admins).toEqual(['read']);
    });

    it('should return empty object for invalid role', () => {
      const permissions = service.getRolePermissions('invalid_role' as Role);
      expect(permissions).toEqual({});
    });

    it('should return empty object when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const permissions = unloadedService.getRolePermissions('admin');
      expect(permissions).toEqual({});
    });

    it('should check if role has specific permission', () => {
      expect(service.roleHasPermission('admin', 'groups', 'create')).toBe(true);
      expect(service.roleHasPermission('admin', 'groups', 'delete')).toBe(false);
      expect(service.roleHasPermission('participant', 'groups', 'read')).toBe(false);
    });
  });

  describe('caching behavior', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should cache permission check results', () => {
      // First call should compute and cache
      const result1 = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      expect(result1).toBe(true);
      expect(cache.size()).toBe(1);

      // Second call should use cache
      const result2 = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      expect(result2).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it('should cache global permission results', () => {
      service.canPerformGlobalAction(superAdminUser, 'groups', 'create');
      expect(cache.size()).toBe(1);
    });

    it('should cache bulk permission results', () => {
      const checks: PermissionCheck[] = [
        { resource: 'groups', action: 'create' },
        { resource: 'users', action: 'read' }
      ];

      service.bulkPermissionCheck(adminUser, 'site1', checks);
      // Should cache individual permission checks (2) + bulk result (1) = 3 total
      expect(cache.size()).toBe(3);
      
      // Second call should use cached bulk result
      service.bulkPermissionCheck(adminUser, 'site1', checks);
      expect(cache.size()).toBe(3); // No new entries
    });

    it('should clear user-specific cache', () => {
      service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      service.canPerformSiteAction(siteAdminUser, 'site1', 'groups', 'create');
      expect(cache.size()).toBe(2);

      service.clearUserCache(adminUser.uid);
      expect(cache.size()).toBe(1);
    });

    it('should clear all cache', () => {
      service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      service.canPerformSiteAction(siteAdminUser, 'site1', 'groups', 'create');
      expect(cache.size()).toBe(2);

      service.clearAllCache();
      expect(cache.size()).toBe(0);
    });

    it('should work without cache service', () => {
      const serviceWithoutCache = new PermissionService();
      serviceWithoutCache.loadPermissions(validPermissionDocument);

      const result = serviceWithoutCache.canPerformSiteAction(adminUser, 'site1', 'groups', 'create');
      expect(result).toBe(true);
      expect(serviceWithoutCache.getCacheStats().enabled).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should handle users with empty roles array', () => {
      const userWithoutRoles: User = {
        uid: 'no-roles-123',
        email: 'noroles@example.com',
        roles: []
      };

      expect(service.getUserSiteRole(userWithoutRoles, 'site1')).toBeNull();
      expect(service.canPerformSiteAction(userWithoutRoles, 'site1', 'groups', 'read')).toBe(false);
    });

    it('should handle malformed user objects gracefully', () => {
      const malformedUser = {
        uid: 'malformed-123',
        email: 'malformed@example.com',
        roles: null
      } as any;

      expect(() => service.getUserSiteRole(malformedUser, 'site1')).toThrow();
    });

    it('should handle undefined/null parameters', () => {
      expect(service.canPerformSiteAction(null as any, 'site1', 'groups', 'read')).toBe(false);
      expect(service.canPerformSiteAction(adminUser, null as any, 'groups', 'read')).toBe(false);
    });
  });

  describe('super admin special cases', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should identify super admin correctly', () => {
      expect(service.getUserSiteRole(superAdminUser, 'any-site')).toBe('super_admin');
      expect(service.getUserSiteRole(siteAdminUser, 'site1')).toBe('site_admin');
    });

    it('should allow super admin access to any site', () => {
      expect(service.canPerformSiteAction(superAdminUser, 'non-existent-site', 'groups', 'delete')).toBe(true);
      expect(service.canPerformSiteAction(superAdminUser, 'site1', 'admins', 'exclude')).toBe(true);
    });

    it('should return wildcard for super admin sites', () => {
      const sites = service.getSitesWithMinRole(superAdminUser, 'participant');
      expect(sites).toEqual(['*']);
    });

    it('should handle multiple super admin roles', () => {
      const multiSuperAdmin: User = {
        uid: 'multi-super-123',
        email: 'multisuper@example.com',
        roles: [
          { siteId: 'site1', role: 'super_admin' },
          { siteId: 'site2', role: 'super_admin' }
        ]
      };

      expect(service.getUserSiteRole(multiSuperAdmin, 'any-site')).toBe('super_admin');
    });
  });

  describe('participant restrictions', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should deny all permissions for participants', () => {
      const resources = ['groups', 'assignments', 'users', 'admins', 'tasks'] as const;
      const actions = ['create', 'read', 'update', 'delete', 'exclude'] as const;

      resources.forEach(resource => {
        actions.forEach(action => {
          expect(service.canPerformSiteAction(participantUser, 'site1', resource, action)).toBe(false);
        });
      });
    });

    it('should return empty accessible resources for participants', () => {
      const actions = ['create', 'read', 'update', 'delete', 'exclude'] as const;
      
      actions.forEach(action => {
        const resources = service.getAccessibleResources(participantUser, 'site1', action);
        expect(resources).toEqual([]);
      });
    });

    it('should return no sites for participants with minimum role requirements', () => {
      const roles = ['research_assistant', 'admin', 'site_admin', 'super_admin'] as const;
      
      roles.forEach(role => {
        const sites = service.getSitesWithMinRole(participantUser, role);
        expect(sites).toEqual([]);
      });
    });
  });
});