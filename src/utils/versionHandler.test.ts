import { describe, it, expect } from 'vitest';
import { VersionHandler } from './versionHandler.js';
import type { PermissionMatrix, PermissionDocument } from '../types/permissions.js';

describe('VersionHandler', () => {
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
    updatedAt: '2025-01-01T00:00:00Z'
  };

  describe('checkCompatibility', () => {
    it('should return compatible for supported version', () => {
      const result = VersionHandler.checkCompatibility('1.0.0');
      
      expect(result.isCompatible).toBe(true);
      expect(result.requiresMigration).toBe(false);
      expect(result.currentVersion).toBe('1.0.0');
      expect(result.supportedVersions).toContain('1.0.0');
    });

    it('should return incompatible for unsupported version', () => {
      const result = VersionHandler.checkCompatibility('2.0.0');
      
      expect(result.isCompatible).toBe(false);
      expect(result.requiresMigration).toBe(false);
      expect(result.currentVersion).toBe('1.0.0');
    });

    it('should handle empty version string', () => {
      const result = VersionHandler.checkCompatibility('');
      
      expect(result.isCompatible).toBe(false);
      expect(result.requiresMigration).toBe(false);
    });
  });

  describe('validatePermissionDocument', () => {
    it('should validate correct permission document', () => {
      const result = VersionHandler.validatePermissionDocument(validPermissionDocument);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null/undefined document', () => {
      const result1 = VersionHandler.validatePermissionDocument(null);
      const result2 = VersionHandler.validatePermissionDocument(undefined);
      
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Permission document must be an object');
      
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Permission document must be an object');
    });

    it('should reject non-object document', () => {
      const result = VersionHandler.validatePermissionDocument('not an object');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Permission document must be an object');
    });

    it('should reject document missing permissions', () => {
      const invalidDoc = {
        version: '1.0.0',
        updatedAt: '2025-01-01T00:00:00Z'
      };
      
      const result = VersionHandler.validatePermissionDocument(invalidDoc);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing permissions property');
    });

    it('should reject document missing version', () => {
      const invalidDoc = {
        permissions: validPermissionMatrix,
        updatedAt: '2025-01-01T00:00:00Z'
      };
      
      const result = VersionHandler.validatePermissionDocument(invalidDoc);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing version property');
    });

    it('should reject document missing updatedAt', () => {
      const invalidDoc = {
        permissions: validPermissionMatrix,
        version: '1.0.0'
      };
      
      const result = VersionHandler.validatePermissionDocument(invalidDoc);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing updatedAt property');
    });

    it('should reject document with non-object permissions', () => {
      const invalidDoc = {
        permissions: 'not an object',
        version: '1.0.0',
        updatedAt: '2025-01-01T00:00:00Z'
      };
      
      const result = VersionHandler.validatePermissionDocument(invalidDoc);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Permissions must be an object');
    });
  });

  describe('validatePermissionMatrix', () => {
    it('should validate correct permission matrix', () => {
      const result = VersionHandler.validatePermissionMatrix(validPermissionMatrix);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null/undefined matrix', () => {
      const result1 = VersionHandler.validatePermissionMatrix(null as any);
      const result2 = VersionHandler.validatePermissionMatrix(undefined as any);
      
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Permission matrix must be an object');
      
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Permission matrix must be an object');
    });

    it('should reject invalid role names', () => {
      const invalidMatrix = {
        'invalid_role': {
          'groups': ['read']
        }
      };
      
      const result = VersionHandler.validatePermissionMatrix(invalidMatrix as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid role: invalid_role');
    });

    it('should reject invalid resource names', () => {
      const invalidMatrix = {
        'admin': {
          'invalid_resource': ['read']
        }
      };
      
      const result = VersionHandler.validatePermissionMatrix(invalidMatrix as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid resource: invalid_resource for role admin');
    });

    it('should reject invalid action names', () => {
      const invalidMatrix = {
        'admin': {
          'groups': ['invalid_action']
        }
      };
      
      const result = VersionHandler.validatePermissionMatrix(invalidMatrix as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid action: invalid_action for admin.groups');
    });

    it('should reject non-object resources', () => {
      const invalidMatrix = {
        'admin': 'not an object'
      };
      
      const result = VersionHandler.validatePermissionMatrix(invalidMatrix as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Role admin must have resources object');
    });

    it('should reject non-array actions', () => {
      const invalidMatrix = {
        'admin': {
          'groups': 'not an array'
        }
      };
      
      const result = VersionHandler.validatePermissionMatrix(invalidMatrix as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Actions for admin.groups must be an array');
    });
  });

  describe('migratePermissionMatrix', () => {
    it('should successfully migrate v1.0.0 matrix', () => {
      const result = VersionHandler.migratePermissionMatrix(validPermissionMatrix, '1.0.0');
      
      expect(result.success).toBe(true);
      expect(result.migratedMatrix).toEqual(validPermissionMatrix);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail migration for unsupported version', () => {
      const result = VersionHandler.migratePermissionMatrix(validPermissionMatrix, '2.0.0');
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unsupported version for migration: 2.0.0');
    });

    it('should fail migration for invalid matrix', () => {
      const invalidMatrix = {
        'invalid_role': {
          'groups': ['read']
        }
      };
      
      const result = VersionHandler.migratePermissionMatrix(invalidMatrix, '1.0.0');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle migration errors gracefully', () => {
      const result = VersionHandler.migratePermissionMatrix(null, '1.0.0');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('processPermissionDocument', () => {
    it('should successfully process valid document', () => {
      const result = VersionHandler.processPermissionDocument(validPermissionDocument);
      
      expect(result.success).toBe(true);
      expect(result.permissionMatrix).toEqual(validPermissionMatrix);
      expect(result.version).toBe('1.0.0');
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid document structure', () => {
      const invalidDoc = {
        permissions: 'invalid',
        version: '1.0.0'
      };
      
      const result = VersionHandler.processPermissionDocument(invalidDoc);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for incompatible version', () => {
      const incompatibleDoc = {
        ...validPermissionDocument,
        version: '2.0.0'
      };
      
      const result = VersionHandler.processPermissionDocument(incompatibleDoc);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Incompatible version: 2.0.0. Supported versions: 1.0.0');
    });

    it('should fail for invalid permission matrix', () => {
      const invalidDoc = {
        permissions: {
          'invalid_role': {
            'groups': ['read']
          }
        },
        version: '1.0.0',
        updatedAt: '2025-01-01T00:00:00Z'
      };
      
      const result = VersionHandler.processPermissionDocument(invalidDoc);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle migration scenarios', () => {
      // For now, v1.0.0 doesn't require migration, but test the structure
      const result = VersionHandler.processPermissionDocument(validPermissionDocument);
      
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0); // No migration needed for 1.0.0
    });
  });

  describe('utility methods', () => {
    it('should return current version', () => {
      const version = VersionHandler.getCurrentVersion();
      expect(version).toBe('1.0.0');
    });

    it('should return supported versions', () => {
      const versions = VersionHandler.getSupportedVersions();
      expect(versions).toContain('1.0.0');
      expect(Array.isArray(versions)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty permission matrix', () => {
      const emptyMatrix = {};
      const result = VersionHandler.validatePermissionMatrix(emptyMatrix);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle role with empty resources', () => {
      const matrixWithEmptyRole = {
        'admin': {}
      };
      
      const result = VersionHandler.validatePermissionMatrix(matrixWithEmptyRole);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle resource with empty actions', () => {
      const matrixWithEmptyActions = {
        'admin': {
          'groups': []
        }
      };
      
      const result = VersionHandler.validatePermissionMatrix(matrixWithEmptyActions);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});