# Agents Configuration

This file contains commands and context for AI agents working on the permissions service package.

## Project Context

This is a shared TypeScript package (`@yourorg/permissions-core`) that implements a resource-based access control system for a multi-site platform. The package is used by:
- **Frontend**: Vue SPA with composition API
- **Backend**: Firebase Cloud Functions
- **Database**: Firestore with security rules

## System Architecture

### Role Hierarchy
- **Super Admin**: Full system access
- **Site Admin**: Full control over their site's resources  
- **Admin**: Subset of actions within their site
- **Research Assistant**: Read access + user creation
- **Participant**: No admin dashboard access

### User Classification
- `userType`: WHO they are ('admin' | 'student' | 'teacher' | 'caregiver') - affects assessment eligibility
- `role`: WHAT they can do - determines management permissions

### Resources & Actions
- **Resources**: groups, assignments, users, admins, tasks
- **Actions**: create, read, update, delete, exclude

## Development Commands

### Build & Development
```bash
npm run build          # Compile TypeScript to ESM with source maps
npm run dev           # Watch mode compilation
npm run clean         # Remove dist directory
```

### Testing
```bash
npm test              # Run Vitest in watch mode
npm run test:run      # Run tests once
```

### Package Management
```bash
npm install           # Install dependencies
npm pack             # Create tarball for local testing
```

## Key Implementation Files

- `src/permissions.ts` - Core PermissionService class
- `src/index.ts` - Package exports
- `src/permissions.test.ts` - Unit tests
- `tsconfig.json` - TypeScript configuration for ESM output
- `vitest.config.ts` - Test configuration

## Integration Points

### Frontend (Vue SPA)
- Composables for permission checking: `usePermissions()`
- Component guards: `PermissionGuard`
- Real-time updates via Firestore listeners

### Backend (Cloud Functions)
- Permission validation in function middleware
- Firestore security rules enforcement
- Site-based role assignment

### Database (Firestore)
- `system/permissions` - Permission matrix document
- User documents with `roles` array for site-specific permissions
- Multi-site support with site switcher context

## Development Guidelines

1. **ESM Only**: Package uses ES modules with `.js` extensions in imports
2. **Firebase Types**: Only external dependency for type safety
3. **Source Maps**: Enabled for debugging in both environments
4. **Testing**: Comprehensive unit tests with Vitest
5. **Multi-Site**: All permissions are site-scoped

## Migration Notes

The system is transitioning from organization-based to resource-based permissions. The new model eliminates permission management UI since roles are baked into backend logic.