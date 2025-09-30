# Permissions Service

A TypeScript package implementing a resource-based access control system for multi-site platforms. Designed for use in both frontend (Vue SPA) and backend (Firebase Cloud Functions) environments.

## Features

- **Multi-site Support**: Site-scoped permissions with super admin global access
- **Role Hierarchy**: Five-tier role system from participant to super admin
- **Resource-based Access Control**: Granular permissions with nested sub-resources for groups and admins
- **Caching**: TTL-based caching with user-specific clearing and automatic cleanup
- **Version Management**: Document validation and migration framework
- **TypeScript**: Full type safety with comprehensive interfaces
- **ESM**: Modern ES module support with source maps

## Installation

```bash
npm install permissions-service
```

## Quick Start

### Basic Usage

```typescript
import { PermissionService, CacheService } from 'permissions-service';

// Create cache instance (reuse across requests in Cloud Functions)
const cache = new CacheService();

// Create permission service
const permissions = new PermissionService(cache);

// Check if user can perform action on a nested resource
const canEdit = permissions.canPerformSiteAction(
  user,
  'site456',
  'groups',
  'update',
  'schools' // sub-resource required for groups
);

if (canEdit) {
  // User can edit schools
}
```

### Cloud Functions Integration

```typescript
// functions/src/permissions.ts
import { PermissionService, CacheService } from 'permissions-service';

// Module-level cache for container persistence
const cache = new CacheService();

export const updateGroup = onCall(async (request) => {
  const permissions = new PermissionService(cache);
  const { userId, siteId } = request.auth;
  
  // Check permission
  const canUpdate = await permissions.hasPermission(
    userId,
    siteId,
    'groups',
    'update'
  );
  
  if (!canUpdate) {
    throw new HttpsError('permission-denied', 'Insufficient permissions');
  }
  
  // Proceed with update
});
```

### Vue SPA Integration

```typescript
// composables/usePermissions.ts
import { PermissionService, CacheService } from 'permissions-service';
import { ref, computed } from 'vue';

// Session-level cache
const cache = new CacheService();
const permissions = new PermissionService(cache);

export function usePermissions() {
  const currentUser = ref(null);
  const currentSite = ref(null);
  
  const canCreateGroups = computed(async () => {
    if (!currentUser.value || !currentSite.value) return false;
    
    return await permissions.hasPermission(
      currentUser.value.id,
      currentSite.value.id,
      'groups',
      'create'
    );
  });
  
  return {
    canCreateGroups,
    hasPermission: permissions.hasPermission.bind(permissions)
  };
}
```

## Role Hierarchy

The system implements a five-tier role hierarchy:

1. **`participant`** - No admin dashboard access
2. **`research_assistant`** - Read access + user creation
3. **`admin`** - Subset of actions within their site
4. **`site_admin`** - Full control over their site's resources
5. **`super_admin`** - Full system access across all sites

### Nested Permissions Structure

The permission system uses nested sub-resources for `groups` and `admins`:

**Group Sub-Resources:**
- `sites` - Site-level groups
- `schools` - School-level groups
- `classes` - Class-level groups  
- `cohorts` - Cohort-level groups

**Admin Sub-Resources:**
- `site_admin` - Site administrator accounts
- `admin` - Admin accounts
- `research_assistant` - Research assistant accounts

**Flat Resources:**
- `assignments` - Task assignments
- `users` - User accounts
- `tasks` - System tasks

### Permission Matrix Example

```typescript
{
  "admin": {
    "groups": {
      "sites": ["read", "update"],
      "schools": ["read", "update", "delete"],
      "classes": ["read", "update", "delete"],
      "cohorts": ["read", "update", "delete"]
    },
    "admins": {
      "site_admin": ["read"],
      "admin": ["read"],
      "research_assistant": ["create", "read"]
    },
    "assignments": ["create", "read", "update", "delete"],
    "users": ["create", "read", "update"],
    "tasks": ["read"]
  }
}
```

## API Reference

### PermissionService

#### Constructor

```typescript
new PermissionService(cache?: CacheService)
```

#### Methods

##### `canPerformSiteAction(user, siteId, resource, action, subResource?)`

Check if a user has permission to perform an action on a resource within a site.

```typescript
// Nested resource (requires sub-resource)
const canEditSchools = permissions.canPerformSiteAction(
  user,
  'site456', 
  'groups',
  'update',
  'schools' // required for nested resources
);

// Flat resource (no sub-resource needed)
const canEditUsers = permissions.canPerformSiteAction(
  user,
  'site456',
  'users',
  'update'
);
```

##### `canPerformGlobalAction(user, resource, action, subResource?)`

Check if a super admin can perform a global action.

```typescript
const canManageAdmins = permissions.canPerformGlobalAction(
  superAdminUser,
  'admins',
  'delete',
  'admin'
);
```

##### `bulkPermissionCheck(user, siteId, checks)`

Bulk permission checking for multiple resource/action combinations.

```typescript
const results = permissions.bulkPermissionCheck(user, 'site456', [
  { resource: 'groups', action: 'create', subResource: 'schools' },
  { resource: 'users', action: 'read' }
]);
// Returns: [{ resource: 'groups', action: 'create', subResource: 'schools', allowed: true }, ...]
```

##### `getAccessibleResources(user, siteId, action)`

Get flat resources the user can perform an action on.

```typescript
const resources = permissions.getAccessibleResources(user, 'site456', 'create');
// Returns: ['assignments', 'users'] (only flat resources)
```

##### `getAccessibleGroupSubResources(user, siteId, action)`

Get group sub-resources the user can perform an action on.

```typescript
const groupTypes = permissions.getAccessibleGroupSubResources(user, 'site456', 'create');
// Returns: ['schools', 'classes', 'cohorts']
```

##### `getAccessibleAdminSubResources(user, siteId, action)`

Get admin sub-resources the user can perform an action on.

```typescript
const adminTypes = permissions.getAccessibleAdminSubResources(user, 'site456', 'create');
// Returns: ['research_assistant']
```

##### `getUserRole(userId, siteId)`

Get the user's role for a specific site.

```typescript
const role = await permissions.getUserRole('user123', 'site456');
// Returns: 'admin' | 'site_admin' | etc.
```

##### `clearUserCache(userId)`

Clear cached data for a specific user.

```typescript
await permissions.clearUserCache('user123');
```

### CacheService

#### Constructor

```typescript
new CacheService(defaultTtl?: number) // Default: 5 minutes
```

#### Methods

##### `get(key)`

Retrieve cached value.

```typescript
const value = cache.get('user:123:permissions');
```

##### `set(key, value, ttl?)`

Store value in cache with optional TTL.

```typescript
cache.set('user:123:permissions', permissions, 300000); // 5 minutes
```

##### `delete(key)` / `clear()`

Remove specific key or clear entire cache.

```typescript
cache.delete('user:123:permissions');
cache.clear();
```

## User Data Structure

Users must have the following structure in Firestore:

```typescript
interface User {
  id: string;
  roles: Array<{
    siteId: string;
    role: 'participant' | 'research_assistant' | 'admin' | 'site_admin' | 'super_admin';
  }>;
  userType?: 'admin' | 'student' | 'teacher' | 'caregiver';
}
```

## Permission Matrix Document

The system expects a permission matrix document with nested structure:

```typescript
interface PermissionMatrix {
  [role: string]: {
    groups: {
      sites: Action[];
      schools: Action[];
      classes: Action[];
      cohorts: Action[];
    };
    admins: {
      site_admin: Action[];
      admin: Action[];
      research_assistant: Action[];
    };
    assignments: Action[];
    users: Action[];
    tasks: Action[];
  };
}

interface PermissionDocument {
  permissions: PermissionMatrix;
  version: string;
  updatedAt: string;
}
```

**Example Document (stored at `system/permissions`):**

```json
{
  "permissions": {
    "site_admin": {
      "groups": {
        "sites": ["read", "update"],
        "schools": ["create", "read", "update", "delete", "exclude"],
        "classes": ["create", "read", "update", "delete", "exclude"],
        "cohorts": ["create", "read", "update", "delete", "exclude"]
      },
      "assignments": ["create", "read", "update", "delete", "exclude"],
      "users": ["create", "read", "update", "delete", "exclude"],
      "admins": {
        "site_admin": ["create", "read"],
        "admin": ["create", "read", "update", "delete", "exclude"],
        "research_assistant": ["create", "read", "update", "delete"]
      },
      "tasks": ["create", "read", "update", "delete", "exclude"]
    }
  },
  "version": "1.1.0",
  "updatedAt": "2025-09-29T00:00:00Z"
}
```

## Error Handling

The service throws specific errors for different scenarios:

```typescript
try {
  const canEdit = await permissions.hasPermission(userId, siteId, 'groups', 'update');
} catch (error) {
  if (error.message.includes('User not found')) {
    // Handle missing user
  } else if (error.message.includes('Permission matrix not found')) {
    // Handle missing configuration
  }
}
```

## Performance Considerations

### Caching Strategy

- **Frontend**: Session-level cache, cleared on user/site changes
- **Backend**: Module-level cache for container persistence
- **TTL**: Default 5 minutes, configurable per cache instance
- **Bulk Operations**: Use `hasPermissions()` for multiple checks

### Best Practices

1. **Reuse Cache Instances**: Create once per session/container
2. **Bulk Checks**: Use `hasPermissions()` for multiple permission checks
3. **Clear Cache**: Clear user cache after role changes
4. **Error Handling**: Always handle permission check failures gracefully

## Development

### Build

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run clean    # Remove dist directory
```

### Testing

```bash
npm test         # Run tests in watch mode
npm run test:run # Run tests once
```

### Package Testing

```bash
npm pack         # Create tarball for local testing
```

## Migration from Organization-based Permissions

This package replaces organization-based permissions with resource-based permissions. Key changes:

- Roles are now site-scoped instead of organization-scoped
- Permissions are defined per resource/action combination
- Super admin role provides global access across all sites
- No permission management UI (roles are backend-managed)

## License

TBD
