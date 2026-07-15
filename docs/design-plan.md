# Permission Service Design Plan

## Overview

This document outlines the design for a shared TypeScript package (`@levante-framework/permissions-core`) that implements a resource-based access control system for a multi-site platform. The package will be used across Vue SPA frontend and Firebase Cloud Functions backend.

## Core Architecture

### Type Definitions (`src/types/permissions.ts`)

```typescript
export type Role = 'super_admin' | 'site_admin' | 'admin' | 'research_assistant' | 'participant';
export type Action = 'create' | 'read' | 'update' | 'delete' | 'exclude';
export type Resource = 'groups' | 'assignments' | 'users' | 'admins' | 'tasks';

// Nested resources are keyed by sub-resource; flat resources are plain action lists.
export type GroupSubResource = 'sites' | 'schools' | 'classes' | 'cohorts';
export type AdminSubResource = 'site_admin' | 'admin' | 'research_assistant' | 'super_admin';
export type SubResource = GroupSubResource | AdminSubResource;

export interface UserRole {
  siteId: string;
  role: Role;
}

export interface User {
  uid: string;
  email: string;
  roles: UserRole[];
}

export type NestedPermissions<T extends string> = { [subResource in T]: Action[] };
export type FlatPermissions = Action[];

export interface PermissionMatrix {
  [role: string]: {
    groups: NestedPermissions<GroupSubResource>;
    admins: NestedPermissions<AdminSubResource>;
    assignments: FlatPermissions;
    users: FlatPermissions;
    tasks: FlatPermissions;
  };
}
```

**Note**: `groups` and `admins` are nested resources (`NESTED_RESOURCES`) and require a `subResource` on every check; `assignments`, `users`, and `tasks` are flat (`FLAT_RESOURCES`).

### Main Service (`src/services/permissionService.ts`)

**Instantiated per use (not a singleton), with optional caching and logging**

#### Core Methods:
- `constructor(cacheService?, loggingConfig?, sink?)` - Optional cache service, logging mode config, and permission-event sink
- `loadPermissions(document)` - Validate and load a `PermissionDocument` (`{ permissions, version, updatedAt }`); returns `{ success, errors, warnings }`
- `canPerformSiteAction(user, siteId, resource, action, subResource?)` - Main permission check
- `canPerformGlobalAction(user, resource, action, subResource?)` - Super admin only
- `getUserSiteRole(user, siteId)` - Get user's role at specific site
- `hasMinimumRole(userRole, requiredRole)` - Role hierarchy check
- `getSitesWithMinRole(user, minRole)` - Find sites where user has minimum role
- `getAccessibleResources(user, siteId, action)` - Get all resources user can perform action on
- `getAccessibleGroupSubResources(user, siteId, action)` / `getAccessibleAdminSubResources(user, siteId, action)` - Sub-resource variants for nested resources
- `getRolePermissions(role)` / `roleHasPermission(role, resource, action, subResource?)` - Inspect the matrix directly by role
- `bulkPermissionCheck(user, siteId, checks)` - Check multiple permissions at once

### Caching Layer (`src/services/cacheService.ts`)

**Exported for external instantiation**

- In-memory cache with TTL (default 1 hour; configurable via constructor) and a background cleanup timer
- Cache keys are built via helpers, e.g. permission keys are `${userId}-${siteId}-${resource}-${action}` (with `-${subResource}-` inserted for nested resources)
- Methods:
  - `get(key)` - Retrieve cached value (returns `null` if missing/expired)
  - `set(key, value, options?)` - Store with optional `{ ttl }`
  - `has(key)` / `size()` - Inspect cache state
  - `clear()` - Clear all cache
  - `clearUser(userId)` - Clear specific user's cache
  - `generatePermissionKey` / `generateUserRoleKey` / `generateBulkPermissionKey` - Key builders
  - `destroy()` - Stop the cleanup timer and clear all data
- **Cloud Functions**: Instantiate at module level for container persistence
- **Frontend**: Instantiate in application for session-based caching

### Version Compatibility (`src/utils/versionHandler.ts`)

- Current version is `1.1.0`; `SUPPORTED_VERSIONS` and `COMPATIBLE_VERSIONS` currently list only `1.1.0`
- `processPermissionDocument` validates the document, checks compatibility, and migrates when a compatible-but-unsupported version is loaded
- Migration switch is scaffolded for future formats; no legacy format migration exists yet

## Role System

### Role Hierarchy
```
participant < research_assistant < admin < site_admin < super_admin
```

### Role Permissions Matrix

Source of truth: `DEFAULT_PERMISSION_MATRIX` in `src/types/constants.ts`. The nested resources (`groups`, `admins`) vary by sub-resource, so they are broken out separately below.

**Flat resources**

| Resource | Super Admin | Site Admin | Admin | Research Assistant | Participant |
|----------|-------------|------------|-------|--------------------|-------------|
| Assignments | CRUDE | CRUDE | CRUD | R | - |
| Users | CRUDE | CRUDE | CRU | CR | - |
| Tasks | CRUDE | CRUDE | R | R | - |

**Groups** (sub-resources: sites, schools, classes, cohorts)

| Sub-resource | Super Admin | Site Admin | Admin | Research Assistant | Participant |
|--------------|-------------|------------|-------|--------------------|-------------|
| sites | CRUDE | RU | RU | R | - |
| schools / classes / cohorts | CRUDE | CRUDE | RUD | R | - |

**Admins** (sub-resources by role tier; `exclude` never applies)

| Sub-resource | Super Admin | Site Admin | Admin | Research Assistant | Participant |
|--------------|-------------|------------|-------|--------------------|-------------|
| site_admin | CRUD | CR | R | R | - |
| admin | CRUD | CRUDE | R | R | - |
| research_assistant | CRUD | CRUD | CR | R | - |
| super_admin | CRUD | - | - | - | - |

*C = Create, R = Read, U = Update, D = Delete, E = Exclude*

### Special Handling

- **Super Admin**: Always check for `role === 'super_admin'` in user's roles array (any siteId)
- **Participants**: Return false for all permission checks (no dashboard access)
- **Missing permissions document**: Service returns false (fail closed)

## Data Structures

### User Document Structure (Firestore)
```typescript
{
  uid: string;
  email: string;
  roles: [
    { siteId: "site1", role: "site_admin" },
    { siteId: "site2", role: "admin" },
    { siteId: "site3", role: "research_assistant" }
  ]
}
```

### Permissions Document Structure (Firestore)
```typescript
// Collection: system, Document: permissions
{
  "permissions": {
    "super_admin": {
      "groups": {
        "sites": ["create", "read", "update", "delete", "exclude"],
        "schools": ["create", "read", "update", "delete", "exclude"],
        "classes": ["create", "read", "update", "delete", "exclude"],
        "cohorts": ["create", "read", "update", "delete", "exclude"]
      },
      "assignments": ["create", "read", "update", "delete", "exclude"],
      "users": ["create", "read", "update", "delete", "exclude"],
      "admins": {
        "site_admin": ["create", "read", "update", "delete"],
        "admin": ["create", "read", "update", "delete"],
        "research_assistant": ["create", "read", "update", "delete"],
        "super_admin": ["create", "read", "update", "delete"]
      },
      "tasks": ["create", "read", "update", "delete", "exclude"]
    },
    // ... other roles (see DEFAULT_PERMISSION_MATRIX)
  },
  "updatedAt": "2025-07-18T10:00:00Z",
  "version": "1.1.0"
}
```

## User Structure Adaptation

Convert Firestore user to service user:
```typescript
const user = {
  uid: firestoreUser.uid,
  email: firestoreUser.email,
  roles: firestoreUser.roles || []
};

// Check if super admin
const isSuperAdmin = user.roles.some(r => r.role === 'super_admin');
```

## Performance Optimizations

- Cache computed permissions per user/site combination
- Bulk operations to reduce repeated calculations
- Lazy loading of permission matrix
- TTL-based cache invalidation (1 hour for backend)

## Export Structure (`src/index.ts`)

```typescript
export { CacheService } from './services/cacheService.js';
export { PermissionService } from './services/permissionService.js';
export { VersionHandler } from './utils/versionHandler.js';
// Plus named constant exports (ROLES, RESOURCES, ACTIONS, DEFAULT_PERMISSION_MATRIX, ...)
// and all public types from ./types/permissions.js and ./utils/versionHandler.js
```

**Note**: No singleton instances exported - consumers instantiate as needed.

## Integration Points

### Frontend (Vue SPA)
- Pinia store for auth and current site context
- `usePermissions()` composable for reactive permission checks
- Real-time listener on permissions document
- Site context maintained across navigation
- Cache service instantiated in application for session-based caching

```typescript
// In application setup
const cache = new CacheService();
const permissions = new PermissionService(cache);
```

### Backend (Cloud Functions)
- Shared permission service with frontend
- Same permission checking logic
- Cache service instantiated at module level for container persistence
- Permission service instantiated per request (stateless)

```typescript
// At module level (outside handler)
const cache = new CacheService();

// Inside handler
export const myFunction = async (req, res) => {
  const permissions = new PermissionService(cache);
  // Use permissions service
}
```

## Testing Strategy

- Unit tests for each permission combination
- Role hierarchy tests
- Cache behavior tests
- Version migration tests
- Edge cases (missing data, malformed permissions)

## Error Handling

- Document and matrix validation is handled in-package by `VersionHandler` (no Zod or other runtime schema dependency; `firebase` is the only runtime dependency). `loadPermissions` runs `VersionHandler.processPermissionDocument`, which validates structure, checks version compatibility, and migrates when required.
- Service returns false for invalid/missing data (fail closed)
- Console warnings for debugging when permissions not loaded

## Migration Notes

The system transitions from organization-based to resource-based permissions. The new model eliminates permission management UI since roles are baked into backend logic.
