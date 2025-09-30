export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SITE_ADMIN: 'site_admin',
  ADMIN: 'admin',
  RESEARCH_ASSISTANT: 'research_assistant',
  PARTICIPANT: 'participant'
} as const;

export const RESOURCES = {
  GROUPS: 'groups',
  ASSIGNMENTS: 'assignments',
  USERS: 'users',
  ADMINS: 'admins',
  TASKS: 'tasks'
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXCLUDE: 'exclude'
} as const;

export const GROUP_SUB_RESOURCES = {
  SITES: 'sites',
  SCHOOLS: 'schools',
  CLASSES: 'classes',
  COHORTS: 'cohorts'
} as const;

export const ADMIN_SUB_RESOURCES = {
  SITE_ADMIN: 'site_admin',
  ADMIN: 'admin',
  RESEARCH_ASSISTANT: 'research_assistant'
} as const;

export const FLAT_RESOURCES = [
  RESOURCES.ASSIGNMENTS,
  RESOURCES.USERS,
  RESOURCES.TASKS
] as const;

export const NESTED_RESOURCES = [
  RESOURCES.GROUPS,
  RESOURCES.ADMINS
] as const;

export const ALL_ROLES = Object.values(ROLES);
export const ALL_RESOURCES = Object.values(RESOURCES);
export const ALL_ACTIONS = Object.values(ACTIONS);
export const ALL_GROUP_SUB_RESOURCES = Object.values(GROUP_SUB_RESOURCES);
export const ALL_ADMIN_SUB_RESOURCES = Object.values(ADMIN_SUB_RESOURCES);