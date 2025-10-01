import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionService } from '../services/permissionService.js';
import { CacheService } from '../services/cacheService.js';
import { VersionHandler } from '../utils/versionHandler.js';
import type { 
  User, 
  PermissionDocument, 
  PermissionMatrix,
  PermissionCheck 
} from '../types/permissions.js';

describe('Integration Tests', () => {
  let cache: CacheService;
  let service: PermissionService;

  const fullPermissionMatrix: PermissionMatrix = {
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

  const fullPermissionDocument: PermissionDocument = {
    permissions: fullPermissionMatrix,
    version: '1.1.0',
    updatedAt: '2025-01-01T00:00:00Z'
  };

  beforeEach(() => {
    cache = new CacheService(1000); // 1 second TTL for testing
    service = new PermissionService(cache);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Full Permission Matrix Loading', () => {
    it('should load complete permission matrix and validate all components work together', () => {
      // Test the complete workflow: Version validation → Matrix loading → Service ready
      const loadResult = service.loadPermissions(fullPermissionDocument);
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.errors).toHaveLength(0);
      expect(service.isPermissionsLoaded()).toBe(true);
      expect(service.getVersion()).toBe('1.1.0');
      
      // Verify matrix is properly loaded
      const matrix = service.getPermissionMatrix();
      expect(matrix).toEqual(fullPermissionMatrix);
      
      // Verify all roles are present
      expect(Object.keys(matrix)).toEqual([
        'super_admin', 'site_admin', 'admin', 'research_assistant', 'participant'
      ]);
      
      // Verify all resources are present for each role
      Object.values(matrix).forEach(rolePermissions => {
        expect(Object.keys(rolePermissions)).toEqual([
          'groups', 'assignments', 'users', 'admins', 'tasks'
        ]);
      });
    });

    it('should integrate version handler with permission service', () => {
      // Test that VersionHandler and PermissionService work together
      const processResult = VersionHandler.processPermissionDocument(fullPermissionDocument);
      expect(processResult.success).toBe(true);
      
      const loadResult = service.loadPermissions(fullPermissionDocument);
      expect(loadResult.success).toBe(true);
      
      // Both should agree on the version
      expect(service.getVersion()).toBe(processResult.version);
    });

    it('should handle invalid documents through the full pipeline', () => {
      const invalidDocument = {
        permissions: 'invalid',
        version: '1.1.0',
        updatedAt: '2025-01-01T00:00:00Z'
      } as any;
      
      // Version handler should catch this
      const processResult = VersionHandler.processPermissionDocument(invalidDocument);
      expect(processResult.success).toBe(false);
      
      // Permission service should also reject it
      const loadResult = service.loadPermissions(invalidDocument);
      expect(loadResult.success).toBe(false);
      expect(service.isPermissionsLoaded()).toBe(false);
    });
  });

  describe('Real-World Permission Scenarios', () => {
    beforeEach(() => {
      service.loadPermissions(fullPermissionDocument);
    });

    it('should handle complex multi-site organization scenario', () => {
      // Scenario: Large organization with multiple sites and complex user roles
      const organizationAdmin: User = {
        uid: 'org-admin-001',
        email: 'admin@organization.com',
        roles: [
          { siteId: 'headquarters', role: 'super_admin' }
        ]
      };

      const regionalManager: User = {
        uid: 'regional-mgr-001',
        email: 'regional@organization.com',
        roles: [
          { siteId: 'region-north', role: 'site_admin' },
          { siteId: 'region-south', role: 'site_admin' },
          { siteId: 'headquarters', role: 'admin' }
        ]
      };

      const siteCoordinator: User = {
        uid: 'coordinator-001',
        email: 'coordinator@site.com',
        roles: [
          { siteId: 'site-001', role: 'admin' },
          { siteId: 'site-002', role: 'research_assistant' }
        ]
      };

      const researcher: User = {
        uid: 'researcher-001',
        email: 'researcher@university.com',
        roles: [
          { siteId: 'site-001', role: 'research_assistant' },
          { siteId: 'site-002', role: 'research_assistant' },
          { siteId: 'site-003', role: 'research_assistant' }
        ]
      };

      // Test organization admin (super admin) access
      expect(service.canPerformSiteAction(organizationAdmin, 'any-site', 'users', 'delete')).toBe(true);
      expect(service.canPerformGlobalAction(organizationAdmin, 'admins', 'delete', 'admin')).toBe(true);
      expect(service.getSitesWithMinRole(organizationAdmin, 'admin')).toEqual(['*']);

      // Test regional manager access
      expect(service.canPerformSiteAction(regionalManager, 'region-north', 'admins', 'create', 'admin')).toBe(true);
      expect(service.canPerformSiteAction(regionalManager, 'region-south', 'users', 'exclude')).toBe(true);
      expect(service.canPerformSiteAction(regionalManager, 'headquarters', 'admins', 'create', 'admin')).toBe(false); // Only admin at HQ
      expect(service.canPerformSiteAction(regionalManager, 'headquarters', 'groups', 'update', 'schools')).toBe(true);

      // Test site coordinator varying permissions
      expect(service.canPerformSiteAction(siteCoordinator, 'site-001', 'groups', 'create', 'schools')).toBe(false); // Admin can't create schools
      expect(service.canPerformSiteAction(siteCoordinator, 'site-002', 'groups', 'create', 'schools')).toBe(false); // Only research assistant
      expect(service.canPerformSiteAction(siteCoordinator, 'site-002', 'users', 'create')).toBe(true); // Research assistant can create users

      // Test researcher consistent access
      const researcherSites = service.getSitesWithMinRole(researcher, 'research_assistant');
      expect(researcherSites).toEqual(['site-001', 'site-002', 'site-003']);
      
      researcherSites.forEach(siteId => {
        expect(service.canPerformSiteAction(researcher, siteId, 'groups', 'read', 'schools')).toBe(true);
        expect(service.canPerformSiteAction(researcher, siteId, 'users', 'create')).toBe(true);
        expect(service.canPerformSiteAction(researcher, siteId, 'users', 'update')).toBe(false);
      });
    });

    it('should handle permission escalation and de-escalation scenarios', () => {
      // Scenario: User role changes over time
      const evolvingUser: User = {
        uid: 'evolving-user-001',
        email: 'evolving@example.com',
        roles: [
          { siteId: 'site-001', role: 'participant' }
        ]
      };

      // Initially participant - no permissions
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'groups', 'read', 'schools')).toBe(false);
      expect(service.getAccessibleResources(evolvingUser, 'site-001', 'read')).toEqual([]);

      // Promote to research assistant
      evolvingUser.roles = [{ siteId: 'site-001', role: 'research_assistant' }];
      service.clearUserCache(evolvingUser.uid); // Clear cache after role change

      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'groups', 'read', 'schools')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'users', 'create')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'users', 'update')).toBe(false);

      // Promote to admin
      evolvingUser.roles = [{ siteId: 'site-001', role: 'admin' }];
      service.clearUserCache(evolvingUser.uid);

      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'groups', 'update', 'schools')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'users', 'update')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'admins', 'create', 'admin')).toBe(false);

      // Promote to site admin
      evolvingUser.roles = [{ siteId: 'site-001', role: 'site_admin' }];
      service.clearUserCache(evolvingUser.uid);

      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'admins', 'create', 'admin')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'tasks', 'exclude')).toBe(true);
      expect(service.canPerformSiteAction(evolvingUser, 'site-001', 'admins', 'delete', 'admin')).toBe(true); // Site admin can delete admins
    });

    it('should handle bulk operations in real-world scenarios', () => {
      const powerUser: User = {
        uid: 'power-user-001',
        email: 'power@example.com',
        roles: [
          { siteId: 'site-001', role: 'site_admin' }
        ]
      };

      // Test bulk permission check for dashboard rendering
      const dashboardChecks: PermissionCheck[] = [
        { resource: 'groups', action: 'create', subResource: 'schools' },
        { resource: 'groups', action: 'read', subResource: 'schools' },
        { resource: 'groups', action: 'update', subResource: 'schools' },
        { resource: 'groups', action: 'delete', subResource: 'schools' },
        { resource: 'assignments', action: 'create' },
        { resource: 'assignments', action: 'exclude' },
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'delete' },
        { resource: 'admins', action: 'read', subResource: 'admin' },
        { resource: 'admins', action: 'create', subResource: 'admin' },
        { resource: 'tasks', action: 'read' },
        { resource: 'tasks', action: 'exclude' }
      ];

      const results = service.bulkPermissionCheck(powerUser, 'site-001', dashboardChecks);
      
      expect(results).toHaveLength(12);
      
      // Site admin should have most permissions
      const allowedResults = results.filter(r => r.allowed);
      expect(allowedResults.length).toBeGreaterThan(10);
      
      // Check admin create permission
      const adminCreateResult = results.find(r => r.resource === 'admins' && r.action === 'create');
      expect(adminCreateResult?.allowed).toBe(true);
    });

    it('should handle cross-site permission scenarios', () => {
      const multiSiteUser: User = {
        uid: 'multi-site-001',
        email: 'multisite@example.com',
        roles: [
          { siteId: 'site-alpha', role: 'site_admin' },
          { siteId: 'site-beta', role: 'admin' },
          { siteId: 'site-gamma', role: 'research_assistant' }
        ]
      };

      // Test that permissions are properly isolated by site
      expect(service.canPerformSiteAction(multiSiteUser, 'site-alpha', 'admins', 'create', 'admin')).toBe(true);
      expect(service.canPerformSiteAction(multiSiteUser, 'site-beta', 'admins', 'create', 'research_assistant')).toBe(true); // admin can create research_assistant
      expect(service.canPerformSiteAction(multiSiteUser, 'site-gamma', 'admins', 'create', 'admin')).toBe(false); // research_assistant can't create admins

      // Test accessible resources vary by site
      const alphaResources = service.getAccessibleResources(multiSiteUser, 'site-alpha', 'create');
      const betaResources = service.getAccessibleResources(multiSiteUser, 'site-beta', 'create');
      const gammaResources = service.getAccessibleResources(multiSiteUser, 'site-gamma', 'create');

      expect(alphaResources.length).toBeGreaterThan(betaResources.length);
      expect(betaResources.length).toBeGreaterThan(gammaResources.length);
      expect(gammaResources).toEqual(['users']); // Research assistant can only create users
    });
  });

  describe('Performance with Caching', () => {
    beforeEach(() => {
      service.loadPermissions(fullPermissionDocument);
    });

    it('should demonstrate caching behavior and efficiency', () => {
      const testUser: User = {
        uid: 'perf-test-user',
        email: 'perf@example.com',
        roles: [{ siteId: 'site-001', role: 'admin' }]
      };

      // Verify cache starts empty
      expect(cache.size()).toBe(0);

      // First call should populate cache
      const result1 = service.canPerformSiteAction(testUser, 'site-001', 'users', 'create');
      expect(result1).toBe(true);
      expect(cache.size()).toBe(1);

      // Second call should use cache (same result, same cache size)
      const result2 = service.canPerformSiteAction(testUser, 'site-001', 'users', 'create');
      expect(result2).toBe(true);
      expect(cache.size()).toBe(1); // No new cache entries

      // Different permission should create new cache entry
      const result3 = service.canPerformSiteAction(testUser, 'site-001', 'users', 'read');
      expect(result3).toBe(true);
      expect(cache.size()).toBe(2);

      // Verify cache contains expected keys
      const cacheStats = service.getCacheStats();
      expect(cacheStats.enabled).toBe(true);
      expect(cacheStats.size).toBe(2);
    });

    it('should handle cache efficiency with bulk operations', () => {
      const testUser: User = {
        uid: 'bulk-test-user',
        email: 'bulk@example.com',
        roles: [{ siteId: 'site-001', role: 'site_admin' }]
      };

      const bulkChecks: PermissionCheck[] = [
        { resource: 'assignments', action: 'create' },
        { resource: 'assignments', action: 'read' },
        { resource: 'assignments', action: 'update' },
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'delete' }
      ];

      // First bulk check should populate cache
      const start1 = performance.now();
      const results1 = service.bulkPermissionCheck(testUser, 'site-001', bulkChecks);
      const time1 = performance.now() - start1;

      expect(results1).toHaveLength(5);
      const initialCacheSize = cache.size();

      // Second bulk check should use cached results
      const start2 = performance.now();
      const results2 = service.bulkPermissionCheck(testUser, 'site-001', bulkChecks);
      const time2 = performance.now() - start2;

      expect(results2).toEqual(results1);
      expect(time2).toBeLessThan(time1);
      expect(cache.size()).toBe(initialCacheSize); // No new cache entries
    });

    it('should handle cache memory usage efficiently', () => {
      const users: User[] = Array.from({ length: 50 }, (_, i) => ({
        uid: `user-${i}`,
        email: `user${i}@example.com`,
        roles: [{ siteId: 'site-001', role: 'admin' }]
      }));

      // Generate cache entries for many users
      users.forEach(user => {
        service.canPerformSiteAction(user, 'site-001', 'users', 'create');
        service.canPerformSiteAction(user, 'site-001', 'users', 'read');
      });

      const cacheSize = cache.size();
      expect(cacheSize).toBe(100); // 50 users × 2 permissions each

      // Clear specific user cache
      service.clearUserCache('user-0');
      expect(cache.size()).toBeLessThan(cacheSize);

      // Clear all cache
      service.clearAllCache();
      expect(cache.size()).toBe(0);
    });
  });

  describe('Version Migration Scenarios', () => {
    it('should handle version compatibility checking', () => {
      // Test current version compatibility
      const compatibility = VersionHandler.checkCompatibility('1.1.0');
      expect(compatibility.isCompatible).toBe(true);
      expect(compatibility.requiresMigration).toBe(false);

      // Test future version incompatibility
      const futureCompatibility = VersionHandler.checkCompatibility('2.0.0');
      expect(futureCompatibility.isCompatible).toBe(false);
    });

    it('should handle permission document processing with version validation', () => {
      // Test valid document processing
      const result = VersionHandler.processPermissionDocument(fullPermissionDocument);
      expect(result.success).toBe(true);
      expect(result.permissionMatrix).toEqual(fullPermissionMatrix);

      // Test integration with permission service
      const loadResult = service.loadPermissions(fullPermissionDocument);
      expect(loadResult.success).toBe(true);
      expect(loadResult.warnings).toHaveLength(0);
    });

    it('should handle migration workflow simulation', () => {
      // Simulate a migration scenario (even though we only have v1.1.0)
      const migrationResult = VersionHandler.migratePermissionMatrix(fullPermissionMatrix, '1.1.0');
      
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.migratedMatrix).toEqual(fullPermissionMatrix);
      expect(migrationResult.errors).toHaveLength(0);

      // Test that migrated matrix works with permission service
      const migratedDocument: PermissionDocument = {
        permissions: migrationResult.migratedMatrix,
        version: '1.1.0',
        updatedAt: new Date().toISOString()
      };

      const loadResult = service.loadPermissions(migratedDocument);
      expect(loadResult.success).toBe(true);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle service recovery after failed permission loading', () => {
      // Try to load invalid permissions
      const invalidDoc = { invalid: 'document' } as any;
      const failResult = service.loadPermissions(invalidDoc);
      
      expect(failResult.success).toBe(false);
      expect(service.isPermissionsLoaded()).toBe(false);

      // Service should still work after loading valid permissions
      const successResult = service.loadPermissions(fullPermissionDocument);
      expect(successResult.success).toBe(true);
      expect(service.isPermissionsLoaded()).toBe(true);

      // Verify service is fully functional
      const testUser: User = {
        uid: 'recovery-test',
        email: 'recovery@example.com',
        roles: [{ siteId: 'site-001', role: 'admin' }]
      };

      expect(service.canPerformSiteAction(testUser, 'site-001', 'users', 'create')).toBe(true);
    });

    it('should handle cache corruption gracefully', () => {
      service.loadPermissions(fullPermissionDocument);
      
      const testUser: User = {
        uid: 'cache-test',
        email: 'cache@example.com',
        roles: [{ siteId: 'site-001', role: 'admin' }]
      };

      // Populate cache
      service.canPerformSiteAction(testUser, 'site-001', 'users', 'create');
      expect(cache.size()).toBeGreaterThan(0);

      // Simulate cache corruption by destroying and recreating
      cache.destroy();
      cache = new CacheService(1000);
      service = new PermissionService(cache);
      service.loadPermissions(fullPermissionDocument);

      // Service should continue working without cache
      expect(service.canPerformSiteAction(testUser, 'site-001', 'users', 'create')).toBe(true);
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should handle complete application startup workflow', () => {
      // Simulate application startup sequence
      
      // 1. Create services
      const appCache = new CacheService(3600000); // 1 hour TTL
      const appPermissionService = new PermissionService(appCache);
      
      // 2. Load permissions from "database"
      const loadResult = appPermissionService.loadPermissions(fullPermissionDocument);
      expect(loadResult.success).toBe(true);
      
      // 3. Verify service is ready
      expect(appPermissionService.isPermissionsLoaded()).toBe(true);
      expect(appPermissionService.getCacheStats().enabled).toBe(true);
      
      // 4. Simulate user authentication and permission checking
      const authenticatedUser: User = {
        uid: 'auth-user-001',
        email: 'authenticated@app.com',
        roles: [
          { siteId: 'main-site', role: 'site_admin' }
        ]
      };
      
      // 5. Check permissions for UI rendering
      const canManageUsers = appPermissionService.canPerformSiteAction(
        authenticatedUser, 'main-site', 'users', 'create'
      );
      expect(canManageUsers).toBe(true);
      
      // 6. Bulk check for dashboard
      const dashboardPermissions = appPermissionService.bulkPermissionCheck(
        authenticatedUser, 
        'main-site',
        [
          { resource: 'groups', action: 'create', subResource: 'schools' },
          { resource: 'assignments', action: 'update' },
          { resource: 'admins', action: 'read', subResource: 'admin' }
        ]
      );
      
      expect(dashboardPermissions.every(p => p.allowed)).toBe(true);
      
      // 7. Cleanup
      appCache.destroy();
    });

    it('should handle user session management workflow', () => {
      service.loadPermissions(fullPermissionDocument);
      
      const sessionUser: User = {
        uid: 'session-user-001',
        email: 'session@example.com',
        roles: [
          { siteId: 'site-001', role: 'admin' },
          { siteId: 'site-002', role: 'research_assistant' }
        ]
      };

      // User logs in and accesses site-001
      expect(service.canPerformSiteAction(sessionUser, 'site-001', 'groups', 'update', 'schools')).toBe(true);
      expect(cache.size()).toBeGreaterThan(0);

      // User switches to site-002
      expect(service.canPerformSiteAction(sessionUser, 'site-002', 'groups', 'create', 'schools')).toBe(false);
      expect(service.canPerformSiteAction(sessionUser, 'site-002', 'users', 'create')).toBe(true);

      // User role changes - clear cache
      sessionUser.roles = [{ siteId: 'site-001', role: 'site_admin' }];
      service.clearUserCache(sessionUser.uid);

      // Verify new permissions
      expect(service.canPerformSiteAction(sessionUser, 'site-001', 'admins', 'create', 'admin')).toBe(true);
      expect(service.canPerformSiteAction(sessionUser, 'site-002', 'users', 'create')).toBe(false);
    });
  });
});
