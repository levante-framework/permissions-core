import { describe, it, expect } from 'vitest';
import type { 
  Role, 
  Action, 
  Resource, 
  UserRole, 
  User, 
  PermissionMatrix,
  PermissionDocument,
  PermissionCheck,
  BulkPermissionResult,
  CacheEntry,
  CacheOptions
} from './permissions.js';

describe('Permission Types', () => {
  describe('Role type', () => {
    it('should accept valid role values', () => {
      const validRoles: Role[] = [
        'super_admin',
        'site_admin', 
        'admin',
        'research_assistant',
        'participant'
      ];

      validRoles.forEach(role => {
        expect(typeof role).toBe('string');
        expect(['super_admin', 'site_admin', 'admin', 'research_assistant', 'participant']).toContain(role);
      });
    });
  });

  describe('Action type', () => {
    it('should accept valid action values', () => {
      const validActions: Action[] = [
        'create',
        'read', 
        'update',
        'delete',
        'exclude'
      ];

      validActions.forEach(action => {
        expect(typeof action).toBe('string');
        expect(['create', 'read', 'update', 'delete', 'exclude']).toContain(action);
      });
    });
  });

  describe('Resource type', () => {
    it('should accept valid resource values', () => {
      const validResources: Resource[] = [
        'groups',
        'assignments',
        'users', 
        'admins',
        'tasks'
      ];

      validResources.forEach(resource => {
        expect(typeof resource).toBe('string');
        expect(['groups', 'assignments', 'users', 'admins', 'tasks']).toContain(resource);
      });
    });
  });

  describe('UserRole interface', () => {
    it('should have correct structure', () => {
      const userRole: UserRole = {
        siteId: 'site123',
        role: 'admin'
      };

      expect(userRole).toHaveProperty('siteId');
      expect(userRole).toHaveProperty('role');
      expect(typeof userRole.siteId).toBe('string');
      expect(typeof userRole.role).toBe('string');
    });
  });

  describe('User interface', () => {
    it('should have correct structure', () => {
      const user: User = {
        uid: 'user123',
        email: 'test@example.com',
        roles: [
          { siteId: 'site1', role: 'admin' },
          { siteId: 'site2', role: 'research_assistant' }
        ]
      };

      expect(user).toHaveProperty('uid');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('roles');
      expect(typeof user.uid).toBe('string');
      expect(typeof user.email).toBe('string');
      expect(Array.isArray(user.roles)).toBe(true);
    });

    it('should allow empty roles array', () => {
      const user: User = {
        uid: 'user123',
        email: 'test@example.com',
        roles: []
      };

      expect(user.roles).toHaveLength(0);
    });
  });

  describe('PermissionMatrix interface', () => {
    it('should have correct structure', () => {
      const matrix: PermissionMatrix = {
        'admin': {
          'groups': ['create', 'read', 'update'],
          'users': ['read']
        },
        'participant': {
          'groups': [],
          'users': []
        }
      };

      expect(typeof matrix).toBe('object');
      expect(matrix['admin']).toBeDefined();
      expect(matrix['participant']).toBeDefined();
      expect(Array.isArray(matrix['admin']['groups'])).toBe(true);
      expect(Array.isArray(matrix['admin']['users'])).toBe(true);
    });
  });

  describe('PermissionDocument interface', () => {
    it('should have correct structure', () => {
      const document: PermissionDocument = {
        permissions: {
          'admin': {
            'groups': ['create', 'read'],
            'users': ['read']
          }
        },
        version: '1.1.0',
        updatedAt: '2025-01-01T00:00:00Z'
      };

      expect(document).toHaveProperty('permissions');
      expect(document).toHaveProperty('version');
      expect(document).toHaveProperty('updatedAt');
      expect(typeof document.permissions).toBe('object');
      expect(typeof document.version).toBe('string');
      expect(typeof document.updatedAt).toBe('string');
    });
  });

  describe('PermissionCheck interface', () => {
    it('should have correct structure', () => {
      const check: PermissionCheck = {
        resource: 'groups',
        action: 'create'
      };

      expect(check).toHaveProperty('resource');
      expect(check).toHaveProperty('action');
      expect(typeof check.resource).toBe('string');
      expect(typeof check.action).toBe('string');
    });
  });

  describe('BulkPermissionResult interface', () => {
    it('should have correct structure', () => {
      const result: BulkPermissionResult = {
        resource: 'groups',
        action: 'create',
        allowed: true
      };

      expect(result).toHaveProperty('resource');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('allowed');
      expect(typeof result.resource).toBe('string');
      expect(typeof result.action).toBe('string');
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('CacheEntry interface', () => {
    it('should have correct structure', () => {
      const entry: CacheEntry<string> = {
        value: 'test',
        expiresAt: Date.now() + 1000
      };

      expect(entry).toHaveProperty('value');
      expect(entry).toHaveProperty('expiresAt');
      expect(typeof entry.expiresAt).toBe('number');
    });

    it('should work with different value types', () => {
      const stringEntry: CacheEntry<string> = {
        value: 'test',
        expiresAt: Date.now()
      };

      const booleanEntry: CacheEntry<boolean> = {
        value: true,
        expiresAt: Date.now()
      };

      const objectEntry: CacheEntry<{ test: string }> = {
        value: { test: 'value' },
        expiresAt: Date.now()
      };

      expect(typeof stringEntry.value).toBe('string');
      expect(typeof booleanEntry.value).toBe('boolean');
      expect(typeof objectEntry.value).toBe('object');
    });
  });

  describe('CacheOptions interface', () => {
    it('should have correct structure', () => {
      const options: CacheOptions = {
        ttl: 3600000
      };

      expect(options).toHaveProperty('ttl');
      expect(typeof options.ttl).toBe('number');
    });

    it('should allow empty options', () => {
      const options: CacheOptions = {};
      expect(typeof options).toBe('object');
    });
  });
});
