import type { PermissionMatrix, PermissionDocument, Role, Resource, Action } from '../types/permissions.js';

export interface VersionCompatibility {
  isCompatible: boolean;
  requiresMigration: boolean;
  supportedVersions: string[];
  currentVersion: string;
}

export interface MigrationResult {
  success: boolean;
  migratedMatrix: PermissionMatrix;
  warnings: string[];
  errors: string[];
}

export class VersionHandler {
  private static readonly CURRENT_VERSION = '1.0.0';
  private static readonly SUPPORTED_VERSIONS = ['1.0.0'];
  private static readonly COMPATIBLE_VERSIONS = ['1.0.0'];

  static checkCompatibility(version: string): VersionCompatibility {
    const isCompatible = this.COMPATIBLE_VERSIONS.includes(version);
    const requiresMigration = !this.SUPPORTED_VERSIONS.includes(version) && isCompatible;

    return {
      isCompatible,
      requiresMigration,
      supportedVersions: [...this.SUPPORTED_VERSIONS],
      currentVersion: this.CURRENT_VERSION
    };
  }

  static validatePermissionDocument(document: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!document || typeof document !== 'object') {
      errors.push('Permission document must be an object');
      return { isValid: false, errors };
    }

    if (!document.permissions) {
      errors.push('Missing permissions property');
    }

    if (!document.version) {
      errors.push('Missing version property');
    }

    if (!document.lastUpdated) {
      errors.push('Missing lastUpdated property');
    }

    if (document.permissions && typeof document.permissions !== 'object') {
      errors.push('Permissions must be an object');
    }

    return { isValid: errors.length === 0, errors };
  }

  static validatePermissionMatrix(matrix: PermissionMatrix): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validRoles: Role[] = ['super_admin', 'site_admin', 'admin', 'research_assistant', 'participant'];
    const validResources: Resource[] = ['groups', 'assignments', 'users', 'admins', 'tasks'];
    const validActions: Action[] = ['create', 'read', 'update', 'delete', 'exclude'];

    if (!matrix || typeof matrix !== 'object') {
      errors.push('Permission matrix must be an object');
      return { isValid: false, errors };
    }

    for (const [role, resources] of Object.entries(matrix)) {
      if (!validRoles.includes(role as Role)) {
        errors.push(`Invalid role: ${role}`);
        continue;
      }

      if (!resources || typeof resources !== 'object') {
        errors.push(`Role ${role} must have resources object`);
        continue;
      }

      for (const [resource, actions] of Object.entries(resources)) {
        if (!validResources.includes(resource as Resource)) {
          errors.push(`Invalid resource: ${resource} for role ${role}`);
          continue;
        }

        if (!Array.isArray(actions)) {
          errors.push(`Actions for ${role}.${resource} must be an array`);
          continue;
        }

        for (const action of actions) {
          if (!validActions.includes(action as Action)) {
            errors.push(`Invalid action: ${action} for ${role}.${resource}`);
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  static migratePermissionMatrix(matrix: any, fromVersion: string): MigrationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    let migratedMatrix: PermissionMatrix;

    try {
      switch (fromVersion) {
        case '1.0.0':
          migratedMatrix = matrix as PermissionMatrix;
          break;
        
        default:
          errors.push(`Unsupported version for migration: ${fromVersion}`);
          return {
            success: false,
            migratedMatrix: {} as PermissionMatrix,
            warnings,
            errors
          };
      }

      const validation = this.validatePermissionMatrix(migratedMatrix);
      if (!validation.isValid) {
        errors.push(...validation.errors);
        return {
          success: false,
          migratedMatrix: {} as PermissionMatrix,
          warnings,
          errors
        };
      }

      return {
        success: true,
        migratedMatrix,
        warnings,
        errors
      };

    } catch (error) {
      errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        migratedMatrix: {} as PermissionMatrix,
        warnings,
        errors
      };
    }
  }

  static processPermissionDocument(document: any): {
    success: boolean;
    permissionMatrix?: PermissionMatrix;
    version?: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const documentValidation = this.validatePermissionDocument(document);
    if (!documentValidation.isValid) {
      return {
        success: false,
        errors: documentValidation.errors,
        warnings
      };
    }

    const compatibility = this.checkCompatibility(document.version);
    if (!compatibility.isCompatible) {
      errors.push(`Incompatible version: ${document.version}. Supported versions: ${compatibility.supportedVersions.join(', ')}`);
      return {
        success: false,
        errors,
        warnings
      };
    }

    if (compatibility.requiresMigration) {
      warnings.push(`Version ${document.version} requires migration to ${this.CURRENT_VERSION}`);
      
      const migrationResult = this.migratePermissionMatrix(document.permissions, document.version);
      if (!migrationResult.success) {
        errors.push(...migrationResult.errors);
        return {
          success: false,
          errors,
          warnings: [...warnings, ...migrationResult.warnings]
        };
      }

      warnings.push(...migrationResult.warnings);
      return {
        success: true,
        permissionMatrix: migrationResult.migratedMatrix,
        version: this.CURRENT_VERSION,
        errors,
        warnings
      };
    }

    const matrixValidation = this.validatePermissionMatrix(document.permissions);
    if (!matrixValidation.isValid) {
      errors.push(...matrixValidation.errors);
      return {
        success: false,
        errors,
        warnings
      };
    }

    return {
      success: true,
      permissionMatrix: document.permissions,
      version: document.version,
      errors,
      warnings
    };
  }

  static getCurrentVersion(): string {
    return this.CURRENT_VERSION;
  }

  static getSupportedVersions(): string[] {
    return [...this.SUPPORTED_VERSIONS];
  }
}