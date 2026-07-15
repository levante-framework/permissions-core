# permissions-core

Shared TypeScript package (`@levante-framework/permissions-core`) implementing resource-based access control for a multi-site platform. Consumed by a Vue SPA frontend, Firebase Cloud Functions backend, and Firestore security rules. ESM-only, Node 24.

## Commands

```bash
npm run build       # tsc -> dist/
npm run dev         # tsc --watch
npm test            # vitest (watch)
npm run test:run    # vitest run (single pass; use in CI/verification)
npm run check       # biome check .
npm run check:fix   # biome check . --write
```

Verify changes with `npm run test:run && npm run check`.

## Core concepts

- **Role** = WHAT a user can do (manage permissions). Hierarchy, low to high: `participant` < `research_assistant` < `admin` < `site_admin` < `super_admin`.
- **userType** = WHO a user is (`admin` | `student` | `teacher` | `caregiver`); affects assessment eligibility, not management permissions. Don't conflate the two.
- Users hold per-site roles: `user.roles: { siteId, role }[]`. All permissions are site-scoped except `super_admin`, which uses `siteId: '*'` and is checked globally.
- **Resources**: `groups`, `assignments`, `users`, `admins`, `tasks`. **Actions**: `create`, `read`, `update`, `delete`, `exclude`.
- Nested resources (`groups`, `admins`) require a `subResource`; flat resources (`assignments`, `users`, `tasks`) do not. See `NESTED_RESOURCES` / `FLAT_RESOURCES` in `src/types/constants.ts`.

## Key files

- `src/services/permissionService.ts` — `PermissionService`, the core class (all permission checks).
- `src/services/cacheService.ts` — `CacheService`, optional TTL cache passed into `PermissionService`.
- `src/types/constants.ts` — roles, resources, actions, and `DEFAULT_PERMISSION_MATRIX`.
- `src/types/permissions.ts` — all exported types.
- `src/utils/versionHandler.ts` — `VersionHandler`, validates/migrates permission documents.
- `src/index.ts` — public exports. Anything added to the public API must be re-exported here.

## Which check method to use

| Question                                              | Use                        |
| ----------------------------------------------------- | -------------------------- |
| Action scoped to one site (the common case)?          | `canPerformSiteAction`     |
| Global action requiring `super_admin`?                | `canPerformGlobalAction`   |
| Just need a yes/no role-level gate?                   | `hasMinimumRole`           |
| Checking many resource/action pairs at once?          | `bulkPermissionCheck`      |
| Populating UI (e.g. list of allowed resources)?       | `getAccessibleResources`   |

Both `canPerform*` methods take `(user, [siteId,] resource, action, subResource?)` and return `boolean`. Pass `subResource` for `groups`/`admins`, omit it for flat resources.

## Example: a site-scoped check

Real usage from the codebase — copy this shape rather than inventing your own:

```typescript
import { PermissionService, CacheService } from '@levante-framework/permissions-core';

const permissions = new PermissionService(new CacheService());
const loadResult = permissions.loadPermissions(permissionDoc); // { permissions, version, updatedAt }
if (!loadResult.success) {
  throw new Error(`Failed to load permissions: ${loadResult.errors.join(', ')}`);
}

const user = { uid: 'u123', email: 'a@b.co', roles: [{ siteId: 'site-001', role: 'admin' }] };
const canEdit = permissions.canPerformSiteAction(user, 'site-001', 'groups', 'update', 'schools');
```

## Workflow: adding a new resource or action

1. Add the constant to `RESOURCES`/`ACTIONS` in `src/types/constants.ts`, and to `FLAT_RESOURCES` or `NESTED_RESOURCES` if it's a resource.
2. Extend the matching union type (`Resource` / `Action`) in `src/types/permissions.ts`.
3. Add entries for every role in `DEFAULT_PERMISSION_MATRIX` (all five roles must be present, even if the value is `[]`).
4. Re-export any new symbols from `src/index.ts`.
5. Add/extend tests in the relevant `*.test.ts` (co-located with source).
6. Run `npm run test:run && npm run check`.

## Conventions (do / don't)

- **Do** write relative imports with explicit `.js` extensions (`'../types/constants.js'`) — it's ESM. **Don't** use extensionless or `.ts` import paths; they break the build.
- **Do** keep `PermissionService` pure/stateless per check and let callers own I/O (Firestore reads, listeners). **Don't** add Firebase SDK calls or network I/O inside this package.
- **Do** give every role an explicit entry in the permission matrix. **Don't** rely on a missing key defaulting to denied — validation expects the key present.
- **Do** treat the matrix as immutable from the outside (`getPermissionMatrix()` returns a deep copy). **Don't** mutate returned matrices.

## Reference docs (load on demand)

- `docs/integration-patterns.md` — Vue composables, Cloud Functions middleware, Firestore rules, real-time updates, logging sink wiring.
- `docs/permissions-logging-plan.md` — `PermEventSink` / logging modes (`off` | `baseline` | `debug`).
- `docs/design-plan.md` — resource-based model rationale and migration from org-based permissions.
- `docs/github-actions.md` — CI setup.
