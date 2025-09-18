# Permission Service Design Plan

## Overview

This document outlines the design for a shared TypeScript package (`@yourorg/permissions-core`) that implements a resource-based access control system for a multi-site platform. The package will be used across Vue SPA frontend and Firebase Cloud Functions backend.

## Core Architecture

### Type Definitions (`src/types/permissions.ts`)

```typescript
export type Role = 'super_admin' | 'site_admin' | 'admin' | 'research_assistant' | 'participant';
export type Action = 'create' | 'read' | 'update' | 'delete' | 'exclude';
export type Resource = 'groups' | 'assignments' | 'users' | 'admins' | 'tasks';

export interface UserRole {
  siteId: string;
  role: Role;
}

export interface User {
  uid: string;
  email: string;
  roles: UserRole[];
}

export interface PermissionMatrix {
  [role: string]: {
    [resource: string]: Action[];
  };
}
```

### Main Service (`src/services/permissionService.ts`)

**Singleton pattern with caching capabilities**

#### Core Methods:
- `constructor(cacheService?)` - Accept optional cache service instance
- `loadPermissions(matrix, version)` - Load and validate permission matrix
- `canPerformSiteAction(user, siteId, resource, action)` - Main permission check
- `canPerformGlobalAction(user, resource, action)` - Super admin only
- `getUserSiteRole(user, siteId)` - Get user's role at specific site
- `hasMinimumRole(userRole, requiredRole)` - Role hierarchy check
- `getSitesWithMinRole(user, minRole)` - Find sites where user has minimum role
- `getAccessibleResources(user, siteId, action)` - Get all resources user can perform action on
- `bulkPermissionCheck(user, siteId, checks)` - Check multiple permissions at once

### Caching Layer (`src/services/cacheService.ts`)

**Exported for external instantiation**

- In-memory cache with TTL (1 hour for backend, session-based for frontend)
- Cache key: `${userId}-${siteId}` for permission results
- Methods:
  - `get(key)` - Retrieve cached value
  - `set(key, value, ttl?)` - Store with optional TTL
  - `clear()` - Clear all cache
  - `clearUser(userId)` - Clear specific user's cache
- **Cloud Functions**: Instantiate at module level for container persistence
- **Frontend**: Instantiate in application for session-based caching

### Version Compatibility (`src/utils/versionHandler.ts`)

- Handle permission matrix format changes
- Migration logic for old formats
- Backward compatibility support

## Role System

### Role Hierarchy
```
participant < research_assistant < admin < site_admin < super_admin
```

### Role Permissions Matrix

| Action | Super Admin | Site Admin | Admin | Research Assistant | Participant |
|--------|-------------|------------|-------|-------------------|-------------|
| Groups | CRUDE | CRUDE | CRUD | R | - |
| Assignments | CRUDE | CRUDE | CRUD | R | - |
| Users | CRUDE | CRUDE | CRUD | CR | - |
| Admins | CRUDE | CRUDE | R | R | - |
| Tasks | CRUDE | CRUDE | E | R | - |

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
      "groups": ["create", "read", "update", "delete", "exclude"],
      "assignments": ["create", "read", "update", "delete", "exclude"],
      "users": ["create", "read", "update", "delete", "exclude"],
      "admins": ["create", "read", "update", "delete", "exclude"],
      "tasks": ["create", "read", "update", "delete", "exclude"]
    },
    "site_admin": {
      "groups": ["create", "read", "update", "delete", "exclude"],
      "assignments": ["create", "read", "update", "delete", "exclude"],
      "users": ["create", "read", "update", "delete", "exclude"],
      "admins": ["create", "read", "update", "delete"],
      "tasks": ["create", "read", "update", "delete", "exclude"]
    },
    // ... other roles
  },
  "updatedAt": "2025-07-18T10:00:00Z",
  "version": "1.0.0"
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
export * from './types/permissions.js';
export { PermissionService } from './services/permissionService.js';
export { CacheService } from './services/cacheService.js';
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

- Permissions validation handled outside the service (via Zod)
- Service returns false for invalid/missing data (fail closed)
- Console warnings for debugging when permissions not loaded

## Migration Notes

The system transitions from organization-based to resource-based permissions. The new model eliminates permission management UI since roles are baked into backend logic.