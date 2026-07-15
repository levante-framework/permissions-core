# @levante-framework/permissions-core

A TypeScript package implementing a resource-based access control system for multi-site platforms. Designed for use in both frontend (Vue SPA) and backend (Firebase Cloud Functions) environments.

## Features

- **Multi-site Support**: Site-scoped permissions with super admin global access
- **Role Hierarchy**: Five-tier role system from participant to super admin
- **Resource-based Access Control**: Granular permissions with nested sub-resources for groups and admins
- **Caching**: TTL-based caching with user-specific clearing and automatic cleanup
- **Decision Logging (opt-in)**: Configurable modes with pluggable sinks for observability
- **Version Management**: Document validation and migration framework
- **TypeScript**: Full type safety with comprehensive interfaces
- **ESM**: Modern ES module support with source maps

## Installation

```bash
npm i --save @levante-framework/permissions-core
```

## Quick Start

### Basic Usage

```typescript
import {
  PermissionService,
  CacheService,
  DEFAULT_PERMISSION_MATRIX
} from '@levante-framework/permissions-core';

const cache = new CacheService();

const loggingConfig = { mode: 'off' as const }; // 'off' | 'baseline' | 'debug'
const sink = {
  isEnabled: () => loggingConfig.mode !== 'off',
  emit: (event) => {
    // no-op by default; plug in Firestore, console, etc.
  }
};

const permissions = new PermissionService(cache, loggingConfig, sink);

// Load a permission matrix before checking. Checks fail closed (return false)
// until this succeeds. In production, fetch this document from Firestore.
const loadResult = permissions.loadPermissions({
  version: '1.1.0',
  updatedAt: '2025-07-18T10:00:00Z',
  permissions: DEFAULT_PERMISSION_MATRIX
});
if (!loadResult.success) {
  throw new Error(`Failed to load permissions: ${loadResult.errors.join(', ')}`);
}

// A User is { uid, email, roles }, where roles are per-site.
const user = {
  uid: 'user123',
  email: 'user@example.com',
  roles: [{ siteId: 'site456', role: 'site_admin' as const }]
};

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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { PermissionService, CacheService } from '@levante-framework/permissions-core';

// Module-level cache for container persistence
const cache = new CacheService();

const loggingConfig = {
  mode: process.env.PERM_LOG_MODE ?? 'baseline'
};

const firestoreSink = {
  isEnabled: () => loggingConfig.mode !== 'off',
  emit: (event) => {
    setImmediate(async () => {
      await getFirestore()
        .collection('permission_events')
        .add({ ...event, expireAt: Date.now() + 1000 * 60 * 60 * 24 * 90 }); // 90-day TTL
    });
  }
};

export const updateGroup = onCall(async (request) => {
  const permissions = new PermissionService(cache, loggingConfig, firestoreSink);
  // Ensure the matrix is loaded (e.g. permissions.loadPermissions(await fetchDoc())).
  const { siteId } = request.data;

  // Build the User object ({ uid, email, roles }) from your user store.
  const user = await getUserWithRoles(request.auth.uid);

  // Nested resources (groups, admins) require a sub-resource. Returns a boolean.
  const canUpdate = permissions.canPerformSiteAction(
    user,
    siteId,
    'groups',
    'update',
    'schools'
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
import { PermissionService, CacheService } from '@levante-framework/permissions-core';
import { ref, computed } from 'vue';

// Session-level cache
const cache = new CacheService();
const permissions = new PermissionService(cache);

export function usePermissions() {
  const currentUser = ref(null); // a User object: { uid, email, roles }
  const currentSite = ref(null);
  
  const canCreateSchools = computed(() => {
    if (!currentUser.value || !currentSite.value) return false;
    
    return permissions.canPerformSiteAction(
      currentUser.value,
      currentSite.value.id,
      'groups',
      'create',
      'schools'
    );
  });
  
  return {
    canCreateSchools,
    canPerformSiteAction: permissions.canPerformSiteAction.bind(permissions)
  };
}
```

### Logging & Observability

Permission decisions remain boolean for callers, but you can enable structured logging by supplying a `LoggingModeConfig` and sink:

```typescript
import { PermissionService, CacheService } from '@levante-framework/permissions-core';

const cache = new CacheService();
const loggingConfig = { mode: 'baseline' as const };

const sink = {
  isEnabled: () => loggingConfig.mode !== 'off',
  emit: (event) => {
    // Persist to Firestore, enqueue to Pub/Sub, etc.
    // Keep payloads de-identified (avoid IP / user agent).
  }
};

const permissions = new PermissionService(cache, loggingConfig, sink);
```

Recommended sink patterns:

- **Firestore (backend)** — write each event with a TTL:

  ```typescript
  const FirestoreSink = {
    isEnabled: () => true,
    emit: (event) => {
      setImmediate(async () => {
        await db.collection('permission_events').add({
          ...event,
          expireAt: Date.now() + 1000 * 60 * 60 * 24 * 60 // 60 days
        });
      });
    }
  };
  ```

- **Beacon (frontend)** — forward sampled events to an HTTPS endpoint:

  ```typescript
  const BrowserSink = {
    isEnabled: () => true,
    emit: (event) => {
      const { userId, ...sanitized } = event; // strip identifiers if required
      navigator.sendBeacon('/api/permission-log', JSON.stringify(sanitized));
    }
  };
  ```

Toggle logging modes via environment variables or Remote Config (`'off'` → no emission, `'baseline'` → minimal denies, `'debug'` → full capture for investigations). Return to `'off'` once debugging is complete to avoid unnecessary overhead.

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
- `super_admin` - Super administrator accounts

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
      "research_assistant": ["create", "read"],
      "super_admin": []
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
new PermissionService(
  cache?: CacheService,
  loggingConfig?: LoggingModeConfig,
  sink?: PermEventSink
)
```

- `loggingConfig` defaults to `{ mode: 'off' }`.
- `sink` defaults to the internal no-op sink; callers can supply Firestore/beacon/etc.

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

##### `getUserSiteRole(user, siteId)`

Get the user's role for a specific site (returns `Role | null`; super admins resolve to `'super_admin'`).

```typescript
const role = permissions.getUserSiteRole(user, 'site456');
// Returns: 'admin' | 'site_admin' | null | etc.
```

##### `clearUserCache(userId)`

Clear cached data for a specific user.

```typescript
permissions.clearUserCache('user123');
```

### CacheService

#### Constructor

```typescript
new CacheService(defaultTtl?: number) // Default: 3600000 ms (1 hour)
```

#### Methods

##### `get(key)`

Retrieve cached value (returns `null` if missing or expired).

```typescript
const value = cache.get('user:123:permissions');
```

##### `set(key, value, options?)`

Store value in cache with an optional `{ ttl }` (milliseconds).

```typescript
cache.set('user:123:permissions', permissions, { ttl: 300000 }); // 5 minutes
```

##### `clearUser(userId)` / `clear()`

Clear a specific user's entries or the entire cache.

```typescript
cache.clearUser('user123');
cache.clear();
```

##### `has(key)` / `size()` / `destroy()`

Check membership, read the entry count, or stop the cleanup timer and clear all data.

```typescript
if (cache.has('user:123:permissions')) { /* ... */ }
const count = cache.size();
cache.destroy();
```

## User Data Structure

The service expects a `User` object with the following structure:

```typescript
interface User {
  uid: string;
  email: string;
  roles: Array<{
    siteId: string;
    role: 'participant' | 'research_assistant' | 'admin' | 'site_admin' | 'super_admin';
  }>;
}
```

Note: `userType` ('admin' | 'student' | 'teacher' | 'caregiver') is a separate platform concept about assessment eligibility and is not part of the package's `User` type or permission checks.

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
      super_admin: Action[];
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
        "research_assistant": ["create", "read", "update", "delete"],
        "super_admin": []
      },
      "tasks": ["create", "read", "update", "delete", "exclude"]
    }
  },
  "version": "1.1.0",
  "updatedAt": "2025-09-29T00:00:00Z"
}
```

## Error Handling

Permission checks fail closed: `canPerformSiteAction` / `canPerformGlobalAction` return `false` (never throw) for missing data, unloaded permissions, or a missing/invalid sub-resource, and log a `console.warn` for debugging.

Validation errors surface when loading the matrix. `loadPermissions` returns a result object instead of throwing:

```typescript
const result = permissions.loadPermissions(permissionDoc);
if (!result.success) {
  // result.errors: string[] describing why the document was rejected
  throw new Error(`Failed to load permissions: ${result.errors.join(', ')}`);
}
if (result.warnings.length > 0) {
  console.warn('Permission warnings:', result.warnings);
}

// Checks are safe to call even before load; they simply return false until loaded.
const canEdit = permissions.canPerformSiteAction(user, siteId, 'groups', 'update', 'schools');
```

## Performance Considerations

### Caching Strategy

- **Frontend**: Session-level cache, cleared on user/site changes
- **Backend**: Module-level cache for container persistence
- **TTL**: Default 1 hour, configurable per cache instance
- **Bulk Operations**: Use `bulkPermissionCheck()` for multiple checks

### Best Practices

1. **Reuse Cache Instances**: Create once per session/container
2. **Bulk Checks**: Use `bulkPermissionCheck()` for multiple permission checks
3. **Clear Cache**: Clear user cache after role changes
4. **Error Handling**: Always handle permission check failures gracefully

## Development

### Build

```bash
npm run build     # Compile TypeScript (tsc)
npm run dev       # Watch mode
```

### Lint & Format

```bash
npm run check     # Biome check
npm run check:fix # Biome check with auto-fix
```

### Testing

```bash
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
```

### Package Testing

```bash
npm pack          # Create tarball for local testing (npm built-in)
```

## Migration from Organization-based Permissions

This package replaces organization-based permissions with resource-based permissions. Key changes:

- Roles are now site-scoped instead of organization-scoped
- Permissions are defined per resource/action combination
- Super admin role provides global access across all sites
- No permission management UI (roles are backend-managed)

## License

ISC
