import { describe, it, expect, beforeEach } from 'vitest'
import { PermissionsService, type Permission } from './permissions.js'

describe('PermissionsService', () => {
  let service: PermissionsService
  let mockUser: { uid: string }
  let testPermission: Permission

  beforeEach(() => {
    service = new PermissionsService()
    mockUser = { uid: 'test-user-123' }
    testPermission = {
      id: 'read-posts',
      name: 'Read Posts',
      description: 'Can read blog posts'
    }
  })

  it('should grant permission to user', () => {
    service.grantPermission(mockUser.uid, testPermission)
    
    const permissions = service.getUserPermissions(mockUser.uid)
    expect(permissions).toHaveLength(1)
    expect(permissions[0]).toEqual(testPermission)
  })

  it('should check if user has permission', () => {
    service.grantPermission(mockUser.uid, testPermission)
    
    expect(service.hasPermission(mockUser as any, 'read-posts')).toBe(true)
    expect(service.hasPermission(mockUser as any, 'write-posts')).toBe(false)
  })

  it('should revoke permission from user', () => {
    service.grantPermission(mockUser.uid, testPermission)
    service.revokePermission(mockUser.uid, 'read-posts')
    
    expect(service.hasPermission(mockUser as any, 'read-posts')).toBe(false)
    expect(service.getUserPermissions(mockUser.uid)).toHaveLength(0)
  })

  it('should not duplicate permissions', () => {
    service.grantPermission(mockUser.uid, testPermission)
    service.grantPermission(mockUser.uid, testPermission)
    
    expect(service.getUserPermissions(mockUser.uid)).toHaveLength(1)
  })
})