# Integration Patterns

This document provides detailed integration patterns for using the permissions service in Vue SPA and Firebase Cloud Functions environments.

## Table of Contents

- [Vue SPA Integration](#vue-spa-integration)
- [Firebase Cloud Functions Integration](#firebase-cloud-functions-integration)
- [Firestore Security Rules](#firestore-security-rules)
- [Real-time Updates](#real-time-updates)
- [Multi-site Architecture](#multi-site-architecture)
- [Testing Strategies](#testing-strategies)
- [Permission Decision Logging](#permission-decision-logging)

## Vue SPA Integration

### Project Structure

```
src/
├── composables/
│   ├── usePermissions.ts
│   ├── useAuth.ts
│   └── useSite.ts
├── components/
│   ├── PermissionGuard.vue
│   └── RoleBasedComponent.vue
├── middleware/
│   └── permissions.ts
├── stores/
│   └── permissions.ts
└── utils/
    └── permissions.ts
```

### Core Composable Implementation

```typescript
// composables/usePermissions.ts
import { ref, computed, watch, onUnmounted } from 'vue';
import { PermissionService, CacheService } from 'permissions-service';
import { useAuth } from './useAuth';
import { useSite } from './useSite';
import { useFirestore } from './useFirestore';

// Global instances for session persistence
let globalCache: CacheService | null = null;
let globalPermissions: PermissionService | null = null;

export function usePermissions() {
  const { currentUser, isAuthenticated } = useAuth();
  const { currentSite } = useSite();
  const { db } = useFirestore();
  
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const version = ref<string>('');
  
  // Initialize global instances if needed
  if (!globalCache) {
    globalCache = new CacheService(300000); // 5 minutes
  }
  if (!globalPermissions) {
    globalPermissions = new PermissionService(globalCache);
  }
  
  const permissions = globalPermissions;
  const cache = globalCache;
  
  // Load permissions from Firestore
  const loadPermissions = async (force = false) => {
    if (isLoaded.value && !force) return;
    
    isLoading.value = true;
    error.value = null;
    
    try {
      const permissionDoc = await db.doc('system/permissions').get();
      
      if (!permissionDoc.exists) {
        throw new Error('Permission matrix not found in Firestore');
      }
      
      const result = permissions.loadPermissions(permissionDoc.data());
      
      if (!result.success) {
        throw new Error(`Permission validation failed: ${result.errors.join(', ')}`);
      }
      
      if (result.warnings.length > 0) {
        console.warn('Permission warnings:', result.warnings);
      }
      
      version.value = permissions.getVersion();
      isLoaded.value = true;
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load permissions';
      console.error('Permission loading failed:', err);
    } finally {
      isLoading.value = false;
    }
  };
  
  // Clear cache when user or site changes
  watch([currentUser, currentSite], ([newUser, newSite], [oldUser, oldSite]) => {
    if (oldUser && newUser?.uid !== oldUser.uid) {
      // User changed - clear all cache
      permissions.clearAllCache();
    } else if (oldSite && newSite?.id !== oldSite.id && newUser) {
      // Site changed - clear user-specific cache
      permissions.clearUserCache(newUser.uid);
    }
  });
  
  // Auto-load permissions when authenticated
  watch(isAuthenticated, (authenticated) => {
    if (authenticated) {
      loadPermissions();
    }
  }, { immediate: true });
  
  // Permission checking functions
  const hasPermission = async (resource: string, action: string): Promise<boolean> => {
    if (!isLoaded.value || !currentUser.value || !currentSite.value) {
      return false;
    }
    
    try {
      return permissions.canPerformSiteAction(
        currentUser.value,
        currentSite.value.id,
        resource,
        action
      );
    } catch (err) {
      console.error('Permission check failed:', err);
      return false;
    }
  };
  
  const hasPermissions = async (checks: Array<{resource: string, action: string}>) => {
    if (!isLoaded.value || !currentUser.value || !currentSite.value) {
      return checks.map(check => ({ ...check, allowed: false }));
    }
    
    try {
      return permissions.bulkPermissionCheck(
        currentUser.value,
        currentSite.value.id,
        checks
      );
    } catch (err) {
      console.error('Bulk permission check failed:', err);
      return checks.map(check => ({ ...check, allowed: false }));
    }
  };
  
  const getUserRole = (): string | null => {
    if (!currentUser.value || !currentSite.value) return null;
    
    return permissions.getUserSiteRole(currentUser.value, currentSite.value.id);
  };
  
  // Reactive computed properties for common permissions
  const canCreateGroups = computed(async () => {
    return await hasPermission('groups', 'create');
  });
  
  const canManageUsers = computed(async () => {
    return await hasPermission('users', 'update');
  });
  
  const canExcludeAdmins = computed(async () => {
    return await hasPermission('admins', 'exclude');
  });
  
  const isSuperAdmin = computed(() => {
    if (!currentUser.value) return false;
    return currentUser.value.roles?.some(role => role.role === 'super_admin') || false;
  });
  
  const cacheStats = computed(() => permissions.getCacheStats());
  
  // Cleanup on unmount
  onUnmounted(() => {
    // Don't destroy global cache, just clear user-specific data
    if (currentUser.value) {
      permissions.clearUserCache(currentUser.value.uid);
    }
  });
  
  return {
    // State
    isLoaded,
    isLoading,
    error,
    version,
    
    // Methods
    loadPermissions,
    hasPermission,
    hasPermissions,
    getUserRole,
    
    // Computed
    canCreateGroups,
    canManageUsers,
    canExcludeAdmins,
    isSuperAdmin,
    cacheStats,
    
    // Direct access for advanced usage
    permissions,
    cache
  };
}
```

### Permission Guard Component

```vue
<!-- components/PermissionGuard.vue -->
<template>
  <div v-if="!checkPermissions">
    <!-- Loading state -->
    <slot name="loading" v-if="isLoading">
      <div class="permission-loading">Checking permissions...</div>
    </slot>
    
    <!-- Error state -->
    <slot name="error" v-else-if="error" :error="error">
      <div class="permission-error">Permission check failed: {{ error }}</div>
    </slot>
    
    <!-- Access denied -->
    <slot name="denied" v-else>
      <div class="permission-denied">Access denied</div>
    </slot>
  </div>
  
  <!-- Authorized content -->
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { usePermissions } from '@/composables/usePermissions';

interface Props {
  resource?: string;
  action?: string;
  role?: string;
  permissions?: Array<{resource: string, action: string}>;
  requireAll?: boolean; // For multiple permissions, require all vs any
}

const props = withDefaults(defineProps<Props>(), {
  requireAll: true
});

const { hasPermission, hasPermissions, getUserRole, isLoaded, isLoading, error } = usePermissions();

const checkPermissions = ref(false);

const evaluatePermissions = async () => {
  if (!isLoaded.value) {
    checkPermissions.value = false;
    return;
  }
  
  try {
    // Role-based check
    if (props.role) {
      const userRole = getUserRole();
      checkPermissions.value = userRole === props.role;
      return;
    }
    
    // Single permission check
    if (props.resource && props.action) {
      checkPermissions.value = await hasPermission(props.resource, props.action);
      return;
    }
    
    // Multiple permissions check
    if (props.permissions && props.permissions.length > 0) {
      const results = await hasPermissions(props.permissions);
      
      if (props.requireAll) {
        checkPermissions.value = results.every(result => result.allowed);
      } else {
        checkPermissions.value = results.some(result => result.allowed);
      }
      return;
    }
    
    // No valid permission criteria
    checkPermissions.value = false;
  } catch (err) {
    console.error('Permission evaluation failed:', err);
    checkPermissions.value = false;
  }
};

// Re-evaluate when permissions load or props change
watch([isLoaded, () => props], evaluatePermissions, { immediate: true });

onMounted(evaluatePermissions);
</script>

<style scoped>
.permission-loading,
.permission-error,
.permission-denied {
  padding: 1rem;
  border-radius: 4px;
  text-align: center;
}

.permission-loading {
  background-color: #f0f0f0;
  color: #666;
}

.permission-error {
  background-color: #fee;
  color: #c33;
  border: 1px solid #fcc;
}

.permission-denied {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
}
</style>
```

### Vue Router Integration

```typescript
// middleware/permissions.ts
import { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import { usePermissions } from '@/composables/usePermissions';
import { useAuth } from '@/composables/useAuth';

export interface RoutePermission {
  resource?: string;
  action?: string;
  role?: string;
  permissions?: Array<{resource: string, action: string}>;
  requireAll?: boolean;
}

export async function checkRoutePermissions(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const { isAuthenticated } = useAuth();
  const { hasPermission, hasPermissions, getUserRole, isLoaded } = usePermissions();
  
  // Check if route requires authentication
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    next('/login');
    return;
  }
  
  // Check if route has permission requirements
  const routePermission = to.meta.permission as RoutePermission;
  if (!routePermission) {
    next();
    return;
  }
  
  // Wait for permissions to load
  if (!isLoaded.value) {
    // You might want to show a loading page here
    next('/loading');
    return;
  }
  
  try {
    let hasAccess = false;
    
    // Role-based check
    if (routePermission.role) {
      const userRole = getUserRole();
      hasAccess = userRole === routePermission.role;
    }
    // Single permission check
    else if (routePermission.resource && routePermission.action) {
      hasAccess = await hasPermission(routePermission.resource, routePermission.action);
    }
    // Multiple permissions check
    else if (routePermission.permissions) {
      const results = await hasPermissions(routePermission.permissions);
      
      if (routePermission.requireAll) {
        hasAccess = results.every(result => result.allowed);
      } else {
        hasAccess = results.some(result => result.allowed);
      }
    }
    
    if (hasAccess) {
      next();
    } else {
      next('/access-denied');
    }
  } catch (error) {
    console.error('Route permission check failed:', error);
    next('/error');
  }
}

// Router setup
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/groups',
      component: () => import('@/views/Groups.vue'),
      meta: {
        requiresAuth: true,
        permission: {
          resource: 'groups',
          action: 'read'
        }
      }
    },
    {
      path: '/admin',
      component: () => import('@/views/Admin.vue'),
      meta: {
        requiresAuth: true,
        permission: {
          role: 'admin'
        }
      }
    },
    {
      path: '/dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: {
        requiresAuth: true,
        permission: {
          permissions: [
            { resource: 'groups', action: 'read' },
            { resource: 'users', action: 'read' }
          ],
          requireAll: false // User needs access to either groups OR users
        }
      }
    }
  ]
});

router.beforeEach(checkRoutePermissions);
```

## Firebase Cloud Functions Integration

### Function Architecture

```
functions/
├── src/
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── permissions.ts
│   ├── services/
│   │   ├── permissionService.ts
│   │   └── userService.ts
│   ├── functions/
│   │   ├── groups.ts
│   │   ├── users.ts
│   │   └── admin.ts
│   └── index.ts
```

### Permission Middleware

```typescript
// middleware/permissions.ts
import { PermissionService, CacheService } from 'permissions-service';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// Module-level instances for container persistence
let globalCache: CacheService | null = null;
let globalPermissions: PermissionService | null = null;
let lastPermissionLoad = 0;
const PERMISSION_RELOAD_INTERVAL = 300000; // 5 minutes

export async function getPermissionService(): Promise<PermissionService> {
  const now = Date.now();
  
  // Initialize if needed
  if (!globalCache) {
    globalCache = new CacheService(300000); // 5 minutes
  }
  
  if (!globalPermissions) {
    globalPermissions = new PermissionService(globalCache);
  }
  
  // Reload permissions periodically
  if (now - lastPermissionLoad > PERMISSION_RELOAD_INTERVAL || !globalPermissions.isPermissionsLoaded()) {
    await loadPermissions(globalPermissions);
    lastPermissionLoad = now;
  }
  
  return globalPermissions;
}

async function loadPermissions(permissionService: PermissionService): Promise<void> {
  try {
    const db = getFirestore();
    const permissionDoc = await db.doc('system/permissions').get();
    
    if (!permissionDoc.exists) {
      throw new Error('Permission matrix not found');
    }
    
    const result = permissionService.loadPermissions(permissionDoc.data());
    
    if (!result.success) {
      throw new Error(`Permission validation failed: ${result.errors.join(', ')}`);
    }
    
    if (result.warnings.length > 0) {
      console.warn('Permission warnings:', result.warnings);
    }
    
    console.log(`Permissions loaded successfully, version: ${permissionService.getVersion()}`);
  } catch (error) {
    console.error('Failed to load permissions:', error);
    throw error;
  }
}

export interface PermissionMiddlewareOptions {
  resource: string;
  action: string;
  optional?: boolean; // If true, continues even if permission check fails
}

export function requirePermission(options: PermissionMiddlewareOptions) {
  return async (request: any, response?: any) => {
    try {
      const permissions = await getPermissionService();
      
      // Extract user and site from request context
      const { uid: userId } = request.auth;
      const siteId = request.data?.siteId || request.headers?.['x-site-id'];
      
      if (!siteId) {
        throw new HttpsError('invalid-argument', 'Site ID is required');
      }
      
      // Get user data
      const user = await getUserWithRoles(userId);
      if (!user) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      // Check permission
      const hasPermission = permissions.canPerformSiteAction(
        user,
        siteId,
        options.resource,
        options.action
      );
      
      if (!hasPermission && !options.optional) {
        throw new HttpsError(
          'permission-denied',
          `Insufficient permissions for ${options.action} on ${options.resource}`
        );
      }
      
      // Add permission context to request
      request.permissionContext = {
        hasPermission,
        user,
        siteId,
        resource: options.resource,
        action: options.action
      };
      
      return hasPermission;
    } catch (error) {
      if (options.optional) {
        console.warn('Optional permission check failed:', error);
        return false;
      }
      throw error;
    }
  };
}

async function getUserWithRoles(userId: string) {
  const db = getFirestore();
  const userDoc = await db.doc(`users/${userId}`).get();
  
  if (!userDoc.exists) {
    return null;
  }
  
  const userData = userDoc.data();
  return {
    uid: userId,
    roles: userData?.roles || [],
    userType: userData?.userType
  };
}
```

### Function Implementation

```typescript
// functions/groups.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requirePermission } from '../middleware/permissions.js';

export const createGroup = onCall(async (request) => {
  // Check permission
  await requirePermission({
    resource: 'groups',
    action: 'create'
  })(request);
  
  const { name, description } = request.data;
  const { siteId, user } = request.permissionContext;
  
  try {
    // Validate input
    if (!name || typeof name !== 'string') {
      throw new HttpsError('invalid-argument', 'Group name is required');
    }
    
    // Create group in Firestore
    const db = getFirestore();
    const groupRef = db.collection('groups').doc();
    
    await groupRef.set({
      id: groupRef.id,
      name,
      description: description || '',
      siteId,
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return {
      success: true,
      groupId: groupRef.id,
      message: 'Group created successfully'
    };
  } catch (error) {
    console.error('Create group failed:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Failed to create group');
  }
});

export const updateGroup = onCall(async (request) => {
  await requirePermission({
    resource: 'groups',
    action: 'update'
  })(request);
  
  const { groupId, updates } = request.data;
  const { siteId } = request.permissionContext;
  
  try {
    const db = getFirestore();
    const groupRef = db.doc(`groups/${groupId}`);
    
    // Verify group exists and belongs to site
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      throw new HttpsError('not-found', 'Group not found');
    }
    
    const groupData = groupDoc.data();
    if (groupData?.siteId !== siteId) {
      throw new HttpsError('permission-denied', 'Group does not belong to current site');
    }
    
    // Update group
    await groupRef.update({
      ...updates,
      updatedAt: new Date()
    });
    
    return {
      success: true,
      message: 'Group updated successfully'
    };
  } catch (error) {
    console.error('Update group failed:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Failed to update group');
  }
});

export const deleteGroup = onCall(async (request) => {
  await requirePermission({
    resource: 'groups',
    action: 'delete'
  })(request);
  
  const { groupId } = request.data;
  const { siteId } = request.permissionContext;
  
  try {
    const db = getFirestore();
    const groupRef = db.doc(`groups/${groupId}`);
    
    // Verify group exists and belongs to site
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      throw new HttpsError('not-found', 'Group not found');
    }
    
    const groupData = groupDoc.data();
    if (groupData?.siteId !== siteId) {
      throw new HttpsError('permission-denied', 'Group does not belong to current site');
    }
    
    // Delete group
    await groupRef.delete();
    
    return {
      success: true,
      message: 'Group deleted successfully'
    };
  } catch (error) {
    console.error('Delete group failed:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Failed to delete group');
  }
});
```

## Permission Decision Logging

Permission logging is optional and controlled through `LoggingModeConfig`. Provide a sink suited to your runtime and keep event payloads de-identified.

### Backend (Firestore) Sink

```typescript
import { PermissionService, CacheService } from 'permissions-service';
import { getFirestore } from 'firebase-admin/firestore';

const cache = new CacheService();
const loggingConfig = { mode: 'baseline' as const };

const db = getFirestore();

const FirestoreSink = {
  isEnabled: () => loggingConfig.mode !== 'off',
  emit: (event) => {
    setImmediate(async () => {
      await db.collection('permission_events').add({
        ...event,
        expireAt: Date.now() + 1000 * 60 * 60 * 24 * 90 // 90 days
      });
    });
  }
};

const permissions = new PermissionService(cache, loggingConfig, FirestoreSink);
```

### Frontend (Navigator Beacon) Sink

```typescript
import { PermissionService, CacheService } from 'permissions-service';

const cache = new CacheService();
const loggingConfig = { mode: 'baseline' as const };

const BrowserSink = {
  isEnabled: () => loggingConfig.mode !== 'off',
  emit: (event) => {
    const { userId, ...sanitized } = event; // Strip identifiers if policy requires
    navigator.sendBeacon('/api/permission-log', JSON.stringify(sanitized));
  }
};

export const permissions = new PermissionService(cache, loggingConfig, BrowserSink);
```

### Operational Notes

- Keep payloads de-identified—avoid recording IP address, user agent, or other volatile identifiers.
- Use `'debug'` mode sparingly for incident response; revert to `'baseline'` or `'off'` for normal operation.
- Aggregate counters/dashboards are intentionally deferred; rely on raw event storage with TTL (Firestore TTL, BigQuery partition expiry, etc.).

## Firestore Security Rules

### Permission-aware Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserRoles() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles;
    }
    
    function hasRoleInSite(siteId, role) {
      let userRoles = getUserRoles();
      return userRoles != null && 
             userRoles.hasAny([{siteId: siteId, role: role}]);
    }
    
    function isSuperAdmin() {
      let userRoles = getUserRoles();
      return userRoles != null && 
             userRoles.hasAny([{role: 'super_admin'}]);
    }
    
    function hasMinimumRole(siteId, minRole) {
      let userRoles = getUserRoles();
      let roleHierarchy = ['participant', 'research_assistant', 'admin', 'site_admin', 'super_admin'];
      let minLevel = roleHierarchy.indexOf(minRole);
      
      if (userRoles == null || minLevel == -1) {
        return false;
      }
      
      return isSuperAdmin() || 
             userRoles.hasAny(function(role) {
               return role.siteId == siteId && 
                      roleHierarchy.indexOf(role.role) >= minLevel;
             });
    }
    
    // System documents (permission matrix)
    match /system/{document} {
      allow read: if isAuthenticated();
      allow write: if isSuperAdmin();
    }
    
    // User documents
    match /users/{userId} {
      allow read: if isAuthenticated() && 
                     (request.auth.uid == userId || isSuperAdmin());
      allow write: if isSuperAdmin();
    }
    
    // Groups
    match /groups/{groupId} {
      allow read: if isAuthenticated() && 
                     (hasMinimumRole(resource.data.siteId, 'research_assistant') || 
                      isSuperAdmin());
      allow create: if isAuthenticated() && 
                       (hasMinimumRole(request.resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow update: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow delete: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'site_admin') || 
                        isSuperAdmin());
    }
    
    // Assignments
    match /assignments/{assignmentId} {
      allow read: if isAuthenticated() && 
                     (hasMinimumRole(resource.data.siteId, 'research_assistant') || 
                      isSuperAdmin());
      allow create: if isAuthenticated() && 
                       (hasMinimumRole(request.resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow update: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow delete: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'site_admin') || 
                        isSuperAdmin());
    }
    
    // Tasks
    match /tasks/{taskId} {
      allow read: if isAuthenticated() && 
                     (hasMinimumRole(resource.data.siteId, 'research_assistant') || 
                      isSuperAdmin());
      allow create: if isAuthenticated() && 
                       (hasMinimumRole(request.resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow update: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'admin') || 
                        isSuperAdmin());
      allow delete: if isAuthenticated() && 
                       (hasMinimumRole(resource.data.siteId, 'site_admin') || 
                        isSuperAdmin());
    }
  }
}
```

## Real-time Updates

### Permission-aware Firestore Listeners

```typescript
// utils/realtimePermissions.ts
import { onSnapshot, query, where, collection } from 'firebase/firestore';
import { usePermissions } from '@/composables/usePermissions';
import { useAuth } from '@/composables/useAuth';
import { useSite } from '@/composables/useSite';

export function useRealtimeGroups() {
  const { hasPermission } = usePermissions();
  const { currentUser } = useAuth();
  const { currentSite } = useSite();
  const { db } = useFirestore();
  
  const groups = ref([]);
  const loading = ref(false);
  const error = ref(null);
  let unsubscribe: (() => void) | null = null;
  
  const startListening = async () => {
    if (!currentUser.value || !currentSite.value) return;
    
    // Check if user can read groups
    const canRead = await hasPermission('groups', 'read');
    if (!canRead) {
      error.value = 'Insufficient permissions to view groups';
      return;
    }
    
    loading.value = true;
    
    try {
      const groupsQuery = query(
        collection(db, 'groups'),
        where('siteId', '==', currentSite.value.id)
      );
      
      unsubscribe = onSnapshot(
        groupsQuery,
        (snapshot) => {
          groups.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          loading.value = false;
          error.value = null;
        },
        (err) => {
          console.error('Groups listener error:', err);
          error.value = 'Failed to load groups';
          loading.value = false;
        }
      );
    } catch (err) {
      error.value = 'Failed to start groups listener';
      loading.value = false;
    }
  };
  
  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
  
  // Auto-start/stop based on user and site changes
  watch([currentUser, currentSite], () => {
    stopListening();
    if (currentUser.value && currentSite.value) {
      startListening();
    }
  }, { immediate: true });
  
  onUnmounted(stopListening);
  
  return {
    groups,
    loading,
    error,
    startListening,
    stopListening
  };
}
```

## Multi-site Architecture

### Site Context Management

```typescript
// composables/useSite.ts
import { ref, computed, watch } from 'vue';
import { usePermissions } from './usePermissions';
import { useAuth } from './useAuth';

export function useSite() {
  const { currentUser } = useAuth();
  const { permissions } = usePermissions();
  
  const currentSite = ref(null);
  const availableSites = ref([]);
  const loading = ref(false);
  
  const loadAvailableSites = async () => {
    if (!currentUser.value) return;
    
    loading.value = true;
    
    try {
      // Get sites where user has at least participant role
      const sites = permissions.getSitesWithMinRole(currentUser.value, 'participant');
      
      if (sites.includes('*')) {
        // Super admin - load all sites
        availableSites.value = await loadAllSites();
      } else {
        // Load specific sites
        availableSites.value = await loadSitesByIds(sites);
      }
      
      // Set default site if none selected
      if (!currentSite.value && availableSites.value.length > 0) {
        currentSite.value = availableSites.value[0];
      }
    } catch (error) {
      console.error('Failed to load available sites:', error);
    } finally {
      loading.value = false;
    }
  };
  
  const switchSite = (site) => {
    if (availableSites.value.find(s => s.id === site.id)) {
      currentSite.value = site;
      
      // Clear user cache when switching sites
      if (currentUser.value) {
        permissions.clearUserCache(currentUser.value.uid);
      }
    }
  };
  
  const userRoleInCurrentSite = computed(() => {
    if (!currentUser.value || !currentSite.value) return null;
    
    return permissions.getUserSiteRole(currentUser.value, currentSite.value.id);
  });
  
  // Load sites when user changes
  watch(currentUser, loadAvailableSites, { immediate: true });
  
  return {
    currentSite,
    availableSites,
    loading,
    userRoleInCurrentSite,
    loadAvailableSites,
    switchSite
  };
}
```

## Testing Strategies

### Unit Testing with Mock Permissions

```typescript
// tests/permissions.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionService, CacheService } from 'permissions-service';

describe('Permission Integration', () => {
  let permissions: PermissionService;
  let cache: CacheService;
  
  beforeEach(() => {
    cache = new CacheService();
    permissions = new PermissionService(cache);
    
    // Load test permission matrix
    const testMatrix = {
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
    
    permissions.loadPermissions(testMatrix);
  });
  
  it('should handle Vue composable integration', async () => {
    const user = {
      uid: 'test-user',
      roles: [{ siteId: 'site1', role: 'admin' }]
    };
    
    // Test permission checking
    const canCreate = permissions.canPerformSiteAction(user, 'site1', 'groups', 'create');
    const canDelete = permissions.canPerformSiteAction(user, 'site1', 'groups', 'delete');
    
    expect(canCreate).toBe(true);
    expect(canDelete).toBe(false);
  });
  
  it('should handle Cloud Functions integration', async () => {
    const user = {
      uid: 'test-user',
      roles: [{ siteId: 'site1', role: 'site_admin' }]
    };
    
    // Test bulk permission check (common in Cloud Functions)
    const checks = [
      { resource: 'groups', action: 'create' },
      { resource: 'groups', action: 'delete' },
      { resource: 'admins', action: 'exclude' }
    ];
    
    const results = permissions.bulkPermissionCheck(user, 'site1', checks);
    
    expect(results).toEqual([
      { resource: 'groups', action: 'create', allowed: true },
      { resource: 'groups', action: 'delete', allowed: true },
      { resource: 'admins', action: 'exclude', allowed: true }
    ]);
  });
});
```

### E2E Testing with Cypress

```typescript
// cypress/integration/permissions.spec.ts
describe('Permission System E2E', () => {
  beforeEach(() => {
    // Login as admin user
    cy.login('admin@test.com', 'password');
    cy.visit('/dashboard');
  });
  
  it('should show/hide UI elements based on permissions', () => {
    // Admin should see create group button
    cy.get('[data-testid="create-group-btn"]').should('be.visible');
    
    // Admin should not see delete group button
    cy.get('[data-testid="delete-group-btn"]').should('not.exist');
  });
  
  it('should prevent unauthorized actions', () => {
    // Try to access site admin page as regular admin
    cy.visit('/site-admin');
    cy.url().should('include', '/access-denied');
  });
  
  it('should handle site switching', () => {
    // Switch to different site
    cy.get('[data-testid="site-selector"]').click();
    cy.get('[data-testid="site-option-2"]').click();
    
    // Verify permissions are re-evaluated
    cy.get('[data-testid="user-role"]').should('contain', 'admin');
  });
});
```
