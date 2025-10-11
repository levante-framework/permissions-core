import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionService } from './permissionService.js';
import { CacheService } from './cacheService.js';
import type { 
  User, 
  PermissionDocument, 
  PermissionMatrix,
  PermissionCheck,
  Role,
  PermEvent,
  PermEventSink
} from '../types/permissions.js';

describe('PermissionService', () => {
  let service: PermissionService;
  let cache: CacheService;

  const validPermissionMatrix: PermissionMatrix = {
    'super_admin': {
      'groups': {
        'sites': ['create', 'read', 'update', 'delete', 'exclude'],
        'schools': ['create', 'read', 'update', 'delete', 'exclude'],
        'classes': ['create', 'read', 'update', 'delete', 'exclude'],
        'cohorts': ['create', 'read', 'update', 'delete', 'exclude']
      },
      'assignments': ['create', 'read', 'update', 'delete', 'exclude'],
      'users': ['create', 'read', 'update', 'delete', 'exclude'],
      'admins': {
        'site_admin': ['create', 'read', 'update', 'delete'],
        'admin': ['create', 'read', 'update', 'delete'],
        'research_assistant': ['create', 'read', 'update', 'delete']
      },
      'tasks': ['create', 'read', 'update', 'delete', 'exclude']
    },
    'site_admin': {
      'groups': {
        'sites': ['read', 'update'],
        'schools': ['create', 'read', 'update', 'delete', 'exclude'],
        'classes': ['create', 'read', 'update', 'delete', 'exclude'],
        'cohorts': ['create', 'read', 'update', 'delete', 'exclude']
      },
      'assignments': ['create', 'read', 'update', 'delete', 'exclude'],
      'users': ['create', 'read', 'update', 'delete', 'exclude'],
      'admins': {
        'site_admin': ['create', 'read'],
        'admin': ['create', 'read', 'update', 'delete', 'exclude'],
        'research_assistant': ['create', 'read', 'update', 'delete']
      },
      'tasks': ['create', 'read', 'update', 'delete', 'exclude']
    },
    'admin': {
      'groups': {
        'sites': ['read', 'update'],
        'schools': ['read', 'update', 'delete'],
        'classes': ['read', 'update', 'delete'],
        'cohorts': ['read', 'update', 'delete']
      },
      'assignments': ['create', 'read', 'update', 'delete'],
      'users': ['create', 'read', 'update'],
      'admins': {
        'site_admin': ['read'],
        'admin': ['read'],
        'research_assistant': ['create', 'read']
      },
      'tasks': ['read']
    },
    'research_assistant': {
      'groups': {
        'sites': ['read'],
        'schools': ['read'],
        'classes': ['read'],
        'cohorts': ['read']
      },
      'assignments': ['read'],
      'users': ['create', 'read'],
      'admins': {
        'site_admin': ['read'],
        'admin': ['read'],
        'research_assistant': ['read']
      },
      'tasks': ['read']
    },
    'participant': {
      'groups': {
        'sites': [],
        'schools': [],
        'classes': [],
        'cohorts': []
      },
      'assignments': [],
      'users': [],
      'admins': {
        'site_admin': [],
        'admin': [],
        'research_assistant': []
      },
      'tasks': []
    }
  };

  const validPermissionDocument: PermissionDocument = {
    permissions: validPermissionMatrix,
    version: '1.1.0',
    updatedAt: '2025-01-01T00:00:00Z'
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

  describe('logging configuration', () => {
    it('defaults to off when not provided', () => {
      const defaultService = new PermissionService();
      expect((defaultService as any).shouldComputeDecisionDetails()).toBe(false);
    });

    it('remains off when explicitly set to off', () => {
      const serviceWithExplicitOff = new PermissionService(undefined, { mode: 'off' });
      expect((serviceWithExplicitOff as any).shouldComputeDecisionDetails()).toBe(false);
    });

    it('enables reason evaluation when mode is debug', () => {
      const serviceWithDebug = new PermissionService(undefined, { mode: 'debug' });
      expect((serviceWithDebug as any).shouldComputeDecisionDetails()).toBe(true);
    });
  });

  describe('event sink integration', () => {
    it('emits event details when sink is enabled', () => {
      const events: PermEvent[] = [];
      const sink: PermEventSink = {
        isEnabled: () => true,
        emit: (event) => {
          events.push(event);
        }
      };

      const sinkCache = new CacheService(1000);
      const serviceWithSink = new PermissionService(sinkCache, { mode: 'debug' }, sink);
      serviceWithSink.loadPermissions(validPermissionDocument);

      const allowed = serviceWithSink.canPerformSiteAction(adminUser, 'site1', 'users', 'read');
      expect(allowed).toBe(true);
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.decision).toBe('allow');
      expect(event.reason).toBe('ALLOWED');
      expect(event.userId).toBe(adminUser.uid);
      expect(event.siteId).toBe('site1');
      expect(event.resource).toBe('users');
      expect(event.action).toBe('read');
      expect(event.environment === 'backend' || event.environment === 'frontend').toBe(true);

      sinkCache.destroy();
    });

    it('does not emit when sink reports disabled', () => {
      const events: PermEvent[] = [];
      const sink: PermEventSink = {
        isEnabled: () => false,
        emit: (event) => {
          events.push(event);
        }
      };

      const serviceWithSink = new PermissionService(undefined, { mode: 'debug' }, sink);
      serviceWithSink.loadPermissions(validPermissionDocument);

      const allowed = serviceWithSink.canPerformSiteAction(adminUser, 'site1', 'users', 'read');
      expect(allowed).toBe(true);
      expect(events).toHaveLength(0);
    });
  });

  describe('permission loading', () => {
    it('should load valid permission document successfully', () => {
      const result = service.loadPermissions(validPermissionDocument);
      
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(service.isPermissionsLoaded()).toBe(true);
      expect(service.getVersion()).toBe('1.1.0');
    });

    it('should reject invalid permission document', () => {
      const invalidDoc = {
        permissions: 'invalid',
        version: '1.1.0'
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
      matrix['admin']['groups'].sites = [];
      expect(service.getPermissionMatrix()['admin']['groups'].sites).toEqual(['read', 'update']);
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

    it('should allow admin to update groups/schools', () => {
      const result = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'update', 'schools');
      expect(result).toBe(true);
    });

    it('should deny admin from creating groups/sites', () => {
      const result = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'create', 'sites');
      expect(result).toBe(false);
    });
    
    it('should deny groups permission check without sub-resource', () => {
      const result = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'read');
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
      expect(service.canPerformSiteAction(participantUser, 'site1', 'groups', 'read', 'sites')).toBe(false);
      expect(service.canPerformSiteAction(participantUser, 'site1', 'users', 'read')).toBe(false);
      expect(service.canPerformSiteAction(participantUser, 'site1', 'tasks', 'read')).toBe(false);
    });

    it('should deny actions for users without site role', () => {
      const result = service.canPerformSiteAction(adminUser, 'site-without-role', 'groups', 'read', 'schools');
      expect(result).toBe(false);
    });

    it('should return false when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const result = unloadedService.canPerformSiteAction(adminUser, 'site1', 'groups', 'read', 'schools');
      expect(result).toBe(false);
    });
  });

  describe('global permission checks (super admin)', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should allow super admin global actions', () => {
      expect(service.canPerformGlobalAction(superAdminUser, 'groups', 'create', 'sites')).toBe(true);
      expect(service.canPerformGlobalAction(superAdminUser, 'users', 'delete')).toBe(true);
      expect(service.canPerformGlobalAction(superAdminUser, 'admins', 'delete', 'admin')).toBe(true);
    });

    it('should deny global actions for non-super admin users', () => {
      expect(service.canPerformGlobalAction(siteAdminUser, 'groups', 'create', 'sites')).toBe(false);
      expect(service.canPerformGlobalAction(adminUser, 'users', 'read')).toBe(false);
      expect(service.canPerformGlobalAction(participantUser, 'groups', 'read', 'schools')).toBe(false);
    });
    
    it('should deny global actions without sub-resource for nested resources', () => {
      expect(service.canPerformGlobalAction(superAdminUser, 'groups', 'create')).toBe(false);
      expect(service.canPerformGlobalAction(superAdminUser, 'admins', 'read')).toBe(false);
    });

    it('should route super admin site actions to global actions', () => {
      const result = service.canPerformSiteAction(superAdminUser, 'any-site', 'groups', 'delete', 'schools');
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

    it('should return flat resources admin can create', () => {
      const resources = service.getAccessibleResources(adminUser, 'site1', 'create');
      expect(resources).toContain('assignments');
      expect(resources).toContain('users');
      expect(resources).not.toContain('tasks');
      expect(resources).toHaveLength(2);
    });

    it('should return flat resources research assistant can read', () => {
      const resources = service.getAccessibleResources(researchAssistantUser, 'site1', 'read');
      expect(resources).toContain('assignments');
      expect(resources).toContain('users');
      expect(resources).toContain('tasks');
      expect(resources).toHaveLength(3);
    });
    
    it('should return group sub-resources admin can access', () => {
      const subResources = service.getAccessibleGroupSubResources(adminUser, 'site1', 'read');
      expect(subResources).toContain('sites');
      expect(subResources).toContain('schools');
      expect(subResources).toContain('classes');
      expect(subResources).toContain('cohorts');
      expect(subResources).toHaveLength(4);
    });
    
    it('should return admin sub-resources admin can access', () => {
      const subResources = service.getAccessibleAdminSubResources(adminUser, 'site1', 'read');
      expect(subResources).toContain('site_admin');
      expect(subResources).toContain('admin');
      expect(subResources).toContain('research_assistant');
      expect(subResources).toHaveLength(3);
    });

    it('should return empty array for participant', () => {
      const resources = service.getAccessibleResources(participantUser, 'site1', 'read');
      expect(resources).toEqual([]);
      
      const groupSubResources = service.getAccessibleGroupSubResources(participantUser, 'site1', 'read');
      expect(groupSubResources).toEqual([]);
      
      const adminSubResources = service.getAccessibleAdminSubResources(participantUser, 'site1', 'read');
      expect(adminSubResources).toEqual([]);
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
        { resource: 'groups', action: 'read', subResource: 'schools' },
        { resource: 'groups', action: 'delete', subResource: 'schools' },
        { resource: 'users', action: 'read' },
        { resource: 'admins', action: 'read', subResource: 'admin' }
      ];

      const results = service.bulkPermissionCheck(adminUser, 'site1', checks);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ resource: 'groups', action: 'read', subResource: 'schools', allowed: true });
      expect(results[1]).toEqual({ resource: 'groups', action: 'delete', subResource: 'schools', allowed: true });
      expect(results[2]).toEqual({ resource: 'users', action: 'read', subResource: undefined, allowed: true });
      expect(results[3]).toEqual({ resource: 'admins', action: 'read', subResource: 'admin', allowed: true });
    });

    it('should return all false when permissions not loaded', () => {
      const unloadedService = new PermissionService();
      const checks: PermissionCheck[] = [
        { resource: 'users', action: 'create' }
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
      expect(permissions).toHaveProperty('groups');
      expect(permissions).toHaveProperty('admins');
      if ('groups' in permissions) {
        expect(permissions.groups).toEqual({
          sites: ['read', 'update'],
          schools: ['read', 'update', 'delete'],
          classes: ['read', 'update', 'delete'],
          cohorts: ['read', 'update', 'delete']
        });
      }
      if ('admins' in permissions) {
        expect(permissions.admins).toEqual({
          site_admin: ['read'],
          admin: ['read'],
          research_assistant: ['create', 'read']
        });
      }
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
      // Flat resource - no sub-resource needed
      expect(service.roleHasPermission('admin', 'users', 'create')).toBe(true);
      expect(service.roleHasPermission('admin', 'users', 'delete')).toBe(false);
      
      // Nested resources - sub-resource required
      expect(service.roleHasPermission('admin', 'groups', 'read', 'schools')).toBe(true);
      expect(service.roleHasPermission('admin', 'groups', 'delete', 'schools')).toBe(true);
      expect(service.roleHasPermission('admin', 'groups', 'create', 'schools')).toBe(false);
      expect(service.roleHasPermission('participant', 'groups', 'read', 'schools')).toBe(false);
      
      // Missing sub-resource for nested resources should return false
      expect(service.roleHasPermission('admin', 'groups', 'read')).toBe(false);
      expect(service.roleHasPermission('admin', 'admins', 'read')).toBe(false);
    });
  });

  describe('caching behavior', () => {
    beforeEach(() => {
      service.loadPermissions(validPermissionDocument);
    });

    it('should cache permission check results', () => {
      // First call should compute and cache
      const result1 = service.canPerformSiteAction(adminUser, 'site1', 'users', 'create');
      expect(result1).toBe(true);
      expect(cache.size()).toBe(1);

      // Second call should use cache
      const result2 = service.canPerformSiteAction(adminUser, 'site1', 'users', 'create');
      expect(result2).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it('should cache global permission results', () => {
      service.canPerformGlobalAction(superAdminUser, 'users', 'create');
      expect(cache.size()).toBe(1);
    });
    
    it('should cache permission checks with sub-resources', () => {
      const result1 = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'read', 'schools');
      expect(result1).toBe(true);
      expect(cache.size()).toBe(1);
      
      // Different sub-resource should create new cache entry
      const result2 = service.canPerformSiteAction(adminUser, 'site1', 'groups', 'read', 'classes');
      expect(result2).toBe(true);
      expect(cache.size()).toBe(2);
    });

    it('should cache bulk permission results', () => {
      const checks: PermissionCheck[] = [
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'read' }
      ];

      service.bulkPermissionCheck(adminUser, 'site1', checks);
      // Should cache individual permission checks (2) + bulk result (1) = 3 total
      expect(cache.size()).toBe(3);
      
      // Second call should use cached bulk result
      service.bulkPermissionCheck(adminUser, 'site1', checks);
      expect(cache.size()).toBe(3); // No new entries
    });
    
    it('should cache bulk permission results with sub-resources', () => {
      const checks: PermissionCheck[] = [
        { resource: 'groups', action: 'read', subResource: 'schools' },
        { resource: 'admins', action: 'read', subResource: 'admin' }
      ];

      service.bulkPermissionCheck(adminUser, 'site1', checks);
      expect(cache.size()).toBe(3); // 2 individual + 1 bulk
    });

    it('should clear user-specific cache', () => {
      service.canPerformSiteAction(adminUser, 'site1', 'users', 'create');
      service.canPerformSiteAction(siteAdminUser, 'site1', 'users', 'create');
      expect(cache.size()).toBe(2);

      service.clearUserCache(adminUser.uid);
      expect(cache.size()).toBe(1);
    });

    it('should clear all cache', () => {
      service.canPerformSiteAction(adminUser, 'site1', 'users', 'create');
      service.canPerformSiteAction(siteAdminUser, 'site1', 'users', 'create');
      expect(cache.size()).toBe(2);

      service.clearAllCache();
      expect(cache.size()).toBe(0);
    });

    it('should work without cache service', () => {
      const serviceWithoutCache = new PermissionService();
      serviceWithoutCache.loadPermissions(validPermissionDocument);

      const result = serviceWithoutCache.canPerformSiteAction(adminUser, 'site1', 'users', 'create');
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
      expect(service.canPerformSiteAction(userWithoutRoles, 'site1', 'users', 'read')).toBe(false);
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
      expect(service.canPerformSiteAction(null as any, 'site1', 'users', 'read')).toBe(false);
      expect(service.canPerformSiteAction(adminUser, null as any, 'users', 'read')).toBe(false);
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
      expect(service.canPerformSiteAction(superAdminUser, 'non-existent-site', 'groups', 'delete', 'schools')).toBe(true);
      expect(service.canPerformSiteAction(superAdminUser, 'site1', 'admins', 'delete', 'admin')).toBe(true);
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
      const flatResources = ['assignments', 'users', 'tasks'] as const;
      const actions = ['create', 'read', 'update', 'delete', 'exclude'] as const;

      // Test flat resources
      flatResources.forEach(resource => {
        actions.forEach(action => {
          expect(service.canPerformSiteAction(participantUser, 'site1', resource, action)).toBe(false);
        });
      });
      
      // Test nested resources with sub-resources
      const groupSubResources = ['sites', 'schools', 'classes', 'cohorts'] as const;
      groupSubResources.forEach(subResource => {
        actions.forEach(action => {
          expect(service.canPerformSiteAction(participantUser, 'site1', 'groups', action, subResource)).toBe(false);
        });
      });
      
      const adminSubResources = ['site_admin', 'admin', 'research_assistant'] as const;
      adminSubResources.forEach(subResource => {
        actions.forEach(action => {
          expect(service.canPerformSiteAction(participantUser, 'site1', 'admins', action, subResource)).toBe(false);
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

  describe('decision reasons', () => {
    it('reports NOT_LOADED when permissions are unavailable', () => {
      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        'site1',
        'users',
        'read',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'indeterminate', reason: 'NOT_LOADED' });
    });

    it('reports MISSING_PARAMS when required arguments are absent', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        null,
        'users',
        'read',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'indeterminate', reason: 'MISSING_PARAMS' });
    });

    it('reports REQUIRES_SUBRESOURCE when nested resource is missing', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        'site1',
        'groups',
        'read',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'indeterminate', reason: 'REQUIRES_SUBRESOURCE' });
    });

    it('reports INVALID_SUBRESOURCE when nested resource is invalid', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        'site1',
        'groups',
        'read',
        'invalid_subresource' as any,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'indeterminate', reason: 'INVALID_SUBRESOURCE' });
    });

    it('reports NO_ROLE when user lacks site assignment', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        'missing-site',
        'users',
        'read',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'deny', reason: 'NO_ROLE' });
    });

    it('reports NOT_ALLOWED when role lacks action permission', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        researchAssistantUser,
        'site1',
        'users',
        'update',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.detail).toEqual({ decision: 'deny', reason: 'NOT_ALLOWED' });
    });

    it('reports ALLOWED when permission check succeeds', () => {
      service.loadPermissions(validPermissionDocument);

      const evaluation = (service as any).evaluateSiteActionDetailed(
        adminUser,
        'site1',
        'users',
        'read',
        undefined,
        true
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.detail).toEqual({ decision: 'allow', reason: 'ALLOWED' });
    });
  });
});
