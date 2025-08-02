# Permissions Service

A TypeScript package implementing a resource-based access control system for multi-site platforms. Designed for use in both frontend (Vue SPA) and backend (Firebase Cloud Functions) environments.

## Features

- **Multi-site Support**: Site-scoped permissions with super admin global access
- **Role Hierarchy**: Five-tier role system from participant to super admin
- **Resource-based Access Control**: Granular permissions for groups, assignments, users, admins, and tasks
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

// Check if user can perform action
const canEdit = await permissions.hasPermission(
  'user123',
  'site456',
  'groups',
  'update'
);

if (canEdit) {
  // User can edit groups
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

### Role Permissions Matrix

| Resource | Action | participant | research_assistant | admin | site_admin | super_admin |
|----------|--------|-------------|-------------------|-------|------------|-------------|
| groups | create | ❌ | ❌ | ✅ | ✅ | ✅ |
| groups | read | ❌ | ✅ | ✅ | ✅ | ✅ |
| groups | update | ❌ | ❌ | ✅ | ✅ | ✅ |
| groups | delete | ❌ | ❌ | ❌ | ✅ | ✅ |
| users | create | ❌ | ✅ | ✅ | ✅ | ✅ |
| users | read | ❌ | ✅ | ✅ | ✅ | ✅ |
| admins | exclude | ❌ | ❌ | ❌ | ✅ | ✅ |

## API Reference

### PermissionService

#### Constructor

```typescript
new PermissionService(cache?: CacheService)
```

#### Methods

##### `hasPermission(userId, siteId, resource, action)`

Check if a user has permission to perform an action on a resource.

```typescript
const canEdit = await permissions.hasPermission(
  'user123',
  'site456', 
  'groups',
  'update'
);
```

##### `hasPermissions(userId, siteId, checks)`

Bulk permission checking for multiple resource/action combinations.

```typescript
const results = await permissions.hasPermissions('user123', 'site456', [
  { resource: 'groups', action: 'create' },
  { resource: 'users', action: 'read' }
]);
// Returns: [{ resource: 'groups', action: 'create', allowed: true }, ...]
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

The system expects a permission matrix document at `system/permissions`:

```typescript
interface PermissionMatrix {
  version: string;
  permissions: {
    [role: string]: {
      [resource: string]: string[]; // Array of allowed actions
    };
  };
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
