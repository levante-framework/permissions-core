import type { User } from 'firebase/auth'

export interface Permission {
  id: string
  name: string
  description: string
}

export interface UserPermissions {
  userId: string
  permissions: Permission[]
}

export class PermissionsService {
  private userPermissions: Map<string, Permission[]> = new Map()

  hasPermission(user: User, permissionId: string): boolean {
    const permissions = this.userPermissions.get(user.uid)
    return permissions?.some(p => p.id === permissionId) ?? false
  }

  grantPermission(userId: string, permission: Permission): void {
    const existing = this.userPermissions.get(userId) ?? []
    if (!existing.some(p => p.id === permission.id)) {
      this.userPermissions.set(userId, [...existing, permission])
    }
  }

  revokePermission(userId: string, permissionId: string): void {
    const existing = this.userPermissions.get(userId) ?? []
    this.userPermissions.set(
      userId,
      existing.filter(p => p.id !== permissionId)
    )
  }

  getUserPermissions(userId: string): Permission[] {
    return this.userPermissions.get(userId) ?? []
  }
}
