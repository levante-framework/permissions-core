# Usage Examples

This document provides comprehensive examples of using the permissions service in various scenarios.

## Table of Contents

- [Basic Permission Checking](#basic-permission-checking)
- [Cloud Functions Integration](#cloud-functions-integration)
- [Vue SPA Integration](#vue-spa-integration)
- [Bulk Permission Checks](#bulk-permission-checks)
- [Role Management](#role-management)
- [Cache Management](#cache-management)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)

## Basic Permission Checking

### Simple Permission Check

```typescript
import { PermissionService, CacheService } from 'permissions-service';

const cache = new CacheService();
const permissions = new PermissionService(cache);

// Load permissions from Firestore document
const permissionDoc = {
  version: '1.0.0',
  permissions: {
    admin: {
      groups: ['create', 'read', 'update'],
      users: ['create', 'read', 'update']
    },
    site_admin: {
      groups: ['create', 'read', 'update', 'delete'],
      users: ['create', 'read', 'update', 'delete'],
      admins: ['exclude']
    }
  }
};

const result = permissions.loadPermissions(permissionDoc);
if (!result.success) {
  console.error('Failed to load permissions:', result.errors);
  return;
}

// Check if user can edit groups
const user = {
  uid: 'user123',
  roles: [{ siteId: 'site456', role: 'admin' }]
};

const canEdit = permissions.canPerformSiteAction(
  user, 
  'site456', 
  'groups', 
  'update'
);

console.log('Can edit groups:', canEdit); // true
```

### Super Admin Global Access

```typescript
const superAdminUser = {
  uid: 'admin001',
  roles: [{ siteId: 'any-site', role: 'super_admin' }]
};

// Super admin can perform global actions
const canDeleteGlobally = permissions.canPerformGlobalAction(
  superAdminUser,
  'groups',
  'delete'
);

// Super admin has access to all sites
const accessibleSites = permissions.getSitesWithMinRole(
  superAdminUser,
  'admin'
);
console.log('Accessible sites:', accessibleSites); // ['*']
```

## Cloud Functions Integration

### HTTP Function with Permission Middleware

```typescript
// functions/src/middleware/permissions.ts
import { PermissionService, CacheService } from 'permissions-service';
import { getFirestore } from 'firebase-admin/firestore';

// Module-level cache for container persistence
const cache = new CacheService(300000); // 5 minutes
let permissionsService: PermissionService | null = null;

export async function initializePermissions(): Promise<PermissionService> {
  if (!permissionsService) {
    permissionsService = new PermissionService(cache);
    
    // Load permissions from Firestore
    const db = getFirestore();
    const permissionDoc = await db.doc('system/permissions').get();
    
    if (!permissionDoc.exists) {
      throw new Error('Permission matrix not found');
    }
    
    const result = permissionsService.loadPermissions(permissionDoc.data());
    if (!result.success) {
      throw new Error(`Failed to load permissions: ${result.errors.join(', ')}`);
    }
  }
  
  return permissionsService;
}

export async function requirePermission(
  resource: string,
  action: string
) {
  return async (req: any, res: any, next: any) => {
    try {
      const permissions = await initializePermissions();
      const { user, siteId } = req.auth; // Assume auth middleware sets this
      
      const hasPermission = permissions.canPerformSiteAction(
        user,
        siteId,
        resource,
        action
      );
      
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: { resource, action }
        });
      }
      
      next();
    } catch (error) {
      console.error('Permission check failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
```

### Cloud Function Implementation

```typescript
// functions/src/groups.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializePermissions } from './middleware/permissions.js';

export const createGroup = onCall(async (request) => {
  const { userId, siteId } = request.auth;
  const { name, description } = request.data;
  
  try {
    const permissions = await initializePermissions();
    
    // Check permission
    const canCreate = permissions.canPerformSiteAction(
      { uid: userId, roles: await getUserRoles(userId) },
      siteId,
      'groups',
      'create'
    );
    
    if (!canCreate) {
      throw new HttpsError(
        'permission-denied',
        'Insufficient permissions to create groups'
      );
    }
    
    // Create group logic here
    const groupId = await createGroupInDatabase(name, description, siteId);
    
    return { success: true, groupId };
  } catch (error) {
    console.error('Create group failed:', error);
    throw new HttpsError('internal', 'Failed to create group');
  }
});

async function getUserRoles(userId: string) {
  // Fetch user roles from Firestore
  const db = getFirestore();
  const userDoc = await db.doc(`users/${userId}`).get();
  return userDoc.data()?.roles || [];
}
```

## Vue SPA Integration

### Composable for Permission Management

```typescript
// composables/usePermissions.ts
import { ref, computed, watch } from 'vue';
import { PermissionService, CacheService } from 'permissions-service';
import { useAuth } from './useAuth';
import { useSite } from './useSite';

// Session-level cache
const cache = new CacheService(300000); // 5 minutes
const permissionsService = new PermissionService(cache);

export function usePermissions() {
  const { currentUser } = useAuth();
  const { currentSite } = useSite();
  const isLoaded = ref(false);
  const error = ref<string | null>(null);
  
  // Load permissions on initialization
  const loadPermissions = async () => {
    try {
      const response = await fetch('/api/permissions');
      const permissionDoc = await response.json();
      
      const result = permissionsService.loadPermissions(permissionDoc);
      if (!result.success) {
        error.value = result.errors.join(', ');
        return;
      }
      
      isLoaded.value = true;
      error.value = null;
    } catch (err) {
      error.value = 'Failed to load permissions';
      console.error('Permission loading failed:', err);
    }
  };
  
  // Clear cache when user or site changes
  watch([currentUser, currentSite], ([newUser, newSite], [oldUser, oldSite]) => {
    if (oldUser && newUser?.uid !== oldUser.uid) {
      permissionsService.clearAllCache();
    } else if (oldSite && newSite?.id !== oldSite.id) {
      permissionsService.clearUserCache(newUser?.uid || '');
    }
  });
  
  const hasPermission = async (resource: string, action: string): Promise<boolean> => {
    if (!isLoaded.value || !currentUser.value || !currentSite.value) {
      return false;
    }
    
    return permissionsService.canPerformSiteAction(
      currentUser.value,
      currentSite.value.id,
      resource,
      action
    );
  };
  
  const hasPermissions = async (checks: Array<{resource: string, action: string}>) => {
    if (!isLoaded.value || !currentUser.value || !currentSite.value) {
      return checks.map(check => ({ ...check, allowed: false }));
    }
    
    return permissionsService.bulkPermissionCheck(
      currentUser.value,
      currentSite.value.id,
      checks
    );
  };
  
  // Reactive permission checks
  const canCreateGroups = computed(async () => {
    return await hasPermission('groups', 'create');
  });
  
  const canManageUsers = computed(async () => {
    return await hasPermission('users', 'update');
  });
  
  return {
    isLoaded,
    error,
    loadPermissions,
    hasPermission,
    hasPermissions,
    canCreateGroups,
    canManageUsers
  };
}
```

### Vue Component with Permission Guards

```vue
<!-- components/GroupManager.vue -->
<template>
  <div class="group-manager">
    <div v-if="!permissions.isLoaded" class="loading">
      Loading permissions...
    </div>
    
    <div v-else-if="permissions.error" class="error">
      {{ permissions.error }}
    </div>
    
    <div v-else>
      <button 
        v-if="canCreate" 
        @click="createGroup"
        class="btn-primary"
      >
        Create Group
      </button>
      
      <div class="groups-list">
        <div 
          v-for="group in groups" 
          :key="group.id"
          class="group-item"
        >
          <h3>{{ group.name }}</h3>
          <div class="actions">
            <button 
              v-if="canEdit" 
              @click="editGroup(group)"
            >
              Edit
            </button>
            <button 
              v-if="canDelete" 
              @click="deleteGroup(group)"
              class="btn-danger"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePermissions } from '@/composables/usePermissions';

const permissions = usePermissions();
const groups = ref([]);
const canCreate = ref(false);
const canEdit = ref(false);
const canDelete = ref(false);

onMounted(async () => {
  await permissions.loadPermissions();
  
  // Check multiple permissions at once
  const permissionChecks = await permissions.hasPermissions([
    { resource: 'groups', action: 'create' },
    { resource: 'groups', action: 'update' },
    { resource: 'groups', action: 'delete' }
  ]);
  
  canCreate.value = permissionChecks[0].allowed;
  canEdit.value = permissionChecks[1].allowed;
  canDelete.value = permissionChecks[2].allowed;
  
  // Load groups if user can read them
  if (await permissions.hasPermission('groups', 'read')) {
    loadGroups();
  }
});

const createGroup = async () => {
  // Create group logic
};

const editGroup = async (group: any) => {
  // Edit group logic
};

const deleteGroup = async (group: any) => {
  // Delete group logic
};

const loadGroups = async () => {
  // Load groups from API
};
</script>
```

## Bulk Permission Checks

### Efficient Dashboard Permission Loading

```typescript
// Dashboard component permission setup
const setupDashboardPermissions = async () => {
  const permissions = await initializePermissions();
  const user = getCurrentUser();
  const siteId = getCurrentSiteId();
  
  // Check all dashboard permissions at once
  const dashboardChecks = [
    { resource: 'groups', action: 'read' },
    { resource: 'groups', action: 'create' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'create' },
    { resource: 'assignments', action: 'read' },
    { resource: 'assignments', action: 'create' },
    { resource: 'admins', action: 'read' },
    { resource: 'tasks', action: 'read' }
  ];
  
  const results = permissions.bulkPermissionCheck(user, siteId, dashboardChecks);
  
  // Convert to object for easy access
  const dashboardPermissions = results.reduce((acc, result) => {
    const key = `${result.resource}_${result.action}`;
    acc[key] = result.allowed;
    return acc;
  }, {} as Record<string, boolean>);
  
  return {
    canViewGroups: dashboardPermissions.groups_read,
    canCreateGroups: dashboardPermissions.groups_create,
    canViewUsers: dashboardPermissions.users_read,
    canCreateUsers: dashboardPermissions.users_create,
    canViewAssignments: dashboardPermissions.assignments_read,
    canCreateAssignments: dashboardPermissions.assignments_create,
    canViewAdmins: dashboardPermissions.admins_read,
    canViewTasks: dashboardPermissions.tasks_read
  };
};
```

## Role Management

### Getting User Roles and Accessible Sites

```typescript
const manageUserAccess = async () => {
  const permissions = await initializePermissions();
  const user = getCurrentUser();
  
  // Get user's role for current site
  const currentRole = permissions.getUserSiteRole(user, 'site123');
  console.log('Current role:', currentRole); // 'admin'
  
  // Get all sites where user has admin or higher
  const adminSites = permissions.getSitesWithMinRole(user, 'admin');
  console.log('Admin sites:', adminSites); // ['site123', 'site456']
  
  // Get all resources user can create
  const creatableResources = permissions.getAccessibleResources(
    user, 
    'site123', 
    'create'
  );
  console.log('Can create:', creatableResources); // ['groups', 'users']
  
  // Check role hierarchy
  const hasMinRole = permissions.hasMinimumRole('site_admin', 'admin');
  console.log('Site admin >= admin:', hasMinRole); // true
};
```

### Role-based UI Rendering

```typescript
const renderRoleBasedUI = async () => {
  const permissions = await initializePermissions();
  const user = getCurrentUser();
  const siteId = getCurrentSiteId();
  
  const userRole = permissions.getUserSiteRole(user, siteId);
  
  switch (userRole) {
    case 'super_admin':
      return renderSuperAdminDashboard();
    case 'site_admin':
      return renderSiteAdminDashboard();
    case 'admin':
      return renderAdminDashboard();
    case 'research_assistant':
      return renderResearchAssistantDashboard();
    case 'participant':
      return renderParticipantView();
    default:
      return renderAccessDenied();
  }
};
```

## Cache Management

### Optimizing Cache Usage

```typescript
const optimizeCacheUsage = () => {
  // Create cache with custom TTL
  const cache = new CacheService(600000); // 10 minutes
  const permissions = new PermissionService(cache);
  
  // Monitor cache performance
  const logCacheStats = () => {
    const stats = permissions.getCacheStats();
    console.log(`Cache: ${stats.size} entries, enabled: ${stats.enabled}`);
  };
  
  // Clear cache when user roles change
  const handleRoleChange = (userId: string) => {
    permissions.clearUserCache(userId);
    console.log(`Cleared cache for user: ${userId}`);
  };
  
  // Clear all cache when permissions are updated
  const handlePermissionUpdate = () => {
    permissions.clearAllCache();
    console.log('Cleared all permission cache');
  };
  
  return {
    logCacheStats,
    handleRoleChange,
    handlePermissionUpdate
  };
};
```

## Error Handling

### Comprehensive Error Handling

```typescript
const robustPermissionCheck = async (
  userId: string, 
  siteId: string, 
  resource: string, 
  action: string
) => {
  try {
    const permissions = await initializePermissions();
    
    // Validate inputs
    if (!userId || !siteId || !resource || !action) {
      throw new Error('Missing required parameters');
    }
    
    // Get user data
    const user = await getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Check if permissions are loaded
    if (!permissions.isPermissionsLoaded()) {
      throw new Error('Permissions not loaded');
    }
    
    // Perform permission check
    const hasPermission = permissions.canPerformSiteAction(
      user,
      siteId,
      resource,
      action
    );
    
    return {
      success: true,
      allowed: hasPermission,
      user: user.uid,
      site: siteId,
      resource,
      action
    };
    
  } catch (error) {
    console.error('Permission check failed:', error);
    
    return {
      success: false,
      allowed: false,
      error: error.message,
      user: userId,
      site: siteId,
      resource,
      action
    };
  }
};
```

### Graceful Degradation

```typescript
const safePermissionCheck = async (
  user: any,
  siteId: string,
  resource: string,
  action: string,
  fallback: boolean = false
) => {
  try {
    const permissions = await initializePermissions();
    return permissions.canPerformSiteAction(user, siteId, resource, action);
  } catch (error) {
    console.warn('Permission check failed, using fallback:', error);
    return fallback; // Return safe default
  }
};
```

## Performance Optimization

### Batch Operations for Multiple Users

```typescript
const checkMultipleUsersPermissions = async (
  userIds: string[],
  siteId: string,
  resource: string,
  action: string
) => {
  const permissions = await initializePermissions();
  const results = new Map<string, boolean>();
  
  // Process in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (userId) => {
      try {
        const user = await getUserById(userId);
        const hasPermission = permissions.canPerformSiteAction(
          user,
          siteId,
          resource,
          action
        );
        results.set(userId, hasPermission);
      } catch (error) {
        console.error(`Failed to check permission for user ${userId}:`, error);
        results.set(userId, false);
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return results;
};
```

### Preloading Common Permissions

```typescript
const preloadCommonPermissions = async (user: any, siteId: string) => {
  const permissions = await initializePermissions();
  
  // Common permission checks for dashboard
  const commonChecks = [
    { resource: 'groups', action: 'read' },
    { resource: 'groups', action: 'create' },
    { resource: 'groups', action: 'update' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'create' },
    { resource: 'assignments', action: 'read' }
  ];
  
  // Bulk check to populate cache
  const results = permissions.bulkPermissionCheck(user, siteId, commonChecks);
  
  console.log('Preloaded permissions:', results.length);
  return results;
};
```
