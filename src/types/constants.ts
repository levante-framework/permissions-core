import type { PermissionMatrix } from './permissions';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SITE_ADMIN: 'site_admin',
  ADMIN: 'admin',
  RESEARCH_ASSISTANT: 'research_assistant',
  PARTICIPANT: 'participant',
} as const;

export const RESOURCES = {
  GROUPS: 'groups',
  ASSIGNMENTS: 'assignments',
  USERS: 'users',
  ADMINS: 'admins',
  TASKS: 'tasks',
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXCLUDE: 'exclude',
} as const;

export const GROUP_SUB_RESOURCES = {
  SITES: 'sites',
  SCHOOLS: 'schools',
  CLASSES: 'classes',
  COHORTS: 'cohorts',
} as const;

export const ADMIN_SUB_RESOURCES = {
  SITE_ADMIN: 'site_admin',
  ADMIN: 'admin',
  RESEARCH_ASSISTANT: 'research_assistant',
  SUPER_ADMIN: 'super_admin',
} as const;

export const FLAT_RESOURCES = [
  RESOURCES.ASSIGNMENTS,
  RESOURCES.USERS,
  RESOURCES.TASKS,
] as const;

export const NESTED_RESOURCES = [RESOURCES.GROUPS, RESOURCES.ADMINS] as const;

export const ALL_ROLES = Object.values(ROLES);
export const ALL_RESOURCES = Object.values(RESOURCES);
export const ALL_ACTIONS = Object.values(ACTIONS);
export const ALL_GROUP_SUB_RESOURCES = Object.values(GROUP_SUB_RESOURCES);
export const ALL_ADMIN_SUB_RESOURCES = Object.values(ADMIN_SUB_RESOURCES);
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  super_admin: {
    groups: {
      sites: ['create', 'read', 'update', 'delete', 'exclude'],
      schools: ['create', 'read', 'update', 'delete', 'exclude'],
      classes: ['create', 'read', 'update', 'delete', 'exclude'],
      cohorts: ['create', 'read', 'update', 'delete', 'exclude'],
    },
    assignments: ['create', 'read', 'update', 'delete', 'exclude'],
    users: ['create', 'read', 'update', 'delete', 'exclude'],
    admins: {
      site_admin: ['create', 'read', 'update', 'delete'],
      admin: ['create', 'read', 'update', 'delete'],
      research_assistant: ['create', 'read', 'update', 'delete'],
      super_admin: ['create', 'read', 'update', 'delete'],
    },
    tasks: ['create', 'read', 'update', 'delete', 'exclude'],
  },
  site_admin: {
    groups: {
      sites: ['read', 'update'],
      schools: ['create', 'read', 'update', 'delete', 'exclude'],
      classes: ['create', 'read', 'update', 'delete', 'exclude'],
      cohorts: ['create', 'read', 'update', 'delete', 'exclude'],
    },
    assignments: ['create', 'read', 'update', 'delete', 'exclude'],
    users: ['create', 'read', 'update', 'delete', 'exclude'],
    admins: {
      site_admin: ['create', 'read'],
      admin: ['create', 'read', 'update', 'delete', 'exclude'],
      research_assistant: ['create', 'read', 'update', 'delete'],
      super_admin: [],
    },
    tasks: ['create', 'read', 'update', 'delete', 'exclude'],
  },
  admin: {
    groups: {
      sites: ['read', 'update'],
      schools: ['read', 'update', 'delete'],
      classes: ['read', 'update', 'delete'],
      cohorts: ['read', 'update', 'delete'],
    },
    assignments: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update'],
    admins: {
      site_admin: ['read'],
      admin: ['read'],
      research_assistant: ['create', 'read'],
      super_admin: [],
    },
    tasks: ['read'],
  },
  research_assistant: {
    groups: {
      sites: ['read'],
      schools: ['read'],
      classes: ['read'],
      cohorts: ['read'],
    },
    assignments: ['read'],
    users: ['create', 'read'],
    admins: {
      site_admin: ['read'],
      admin: ['read'],
      research_assistant: ['read'],
      super_admin: [],
    },
    tasks: ['read'],
  },
  participant: {
    groups: {
      sites: [],
      schools: [],
      classes: [],
      cohorts: [],
    },
    assignments: [],
    users: [],
    admins: {
      site_admin: [],
      admin: [],
      research_assistant: [],
      super_admin: [],
    },
    tasks: [],
  },
};
