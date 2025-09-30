import type { CacheEntry, CacheOptions } from '../types/permissions.js';

/**
 * TTL-based cache service with automatic cleanup and user-specific clearing.
 * Designed for caching permission checks and user data.
 */
export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultTtl: number;

  /**
   * Creates a new CacheService instance with automatic cleanup.
   * @param defaultTtl - Default time-to-live in milliseconds (default: 1 hour)
   */
  constructor(defaultTtl: number = 3600000) { // 1 hour default
    this.defaultTtl = defaultTtl;
    this.startCleanupTimer();
  }

  /**
   * Retrieves a value from the cache.
   * Automatically removes expired entries.
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): T | null {
    if (!key) {
      console.warn('CacheService.get failed: key is missing');
      return null;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Stores a value in the cache with TTL.
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Cache options including custom TTL
   */
  set<T>(key: string, value: T, options?: CacheOptions): void {
    if (!key) {
      console.warn('CacheService.set failed: key is missing');
      return;
    }

    const ttl = options?.ttl ?? this.defaultTtl;
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, {
      value,
      expiresAt
    });
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clears all cache entries for a specific user.
   * Removes entries with keys starting with userId or matching userId exactly.
   * @param userId - User ID to clear cache for
   */
  clearUser(userId: string): void {
    if (!userId) {
      console.warn('CacheService.clearUser failed: userId is missing');
      return;
    }

    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}-`) || key === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Generates a cache key for permission checks.
   * @param userId - User identifier
   * @param siteId - Site identifier
   * @param resource - Resource type
   * @param action - Action type
   * @param subResource - Optional sub-resource type
   * @returns Formatted cache key
   */
  generatePermissionKey(userId: string, siteId: string, resource: string, action: string, subResource?: string): string {
    if (!userId || !siteId || !resource || !action) {
      console.warn('CacheService.generatePermissionKey failed: missing required parameters', { userId: !!userId, siteId, resource, action });
      return '';
    }

    if (subResource) {
      return `${userId}-${siteId}-${resource}-${subResource}-${action}`;
    }
    return `${userId}-${siteId}-${resource}-${action}`;
  }

  /**
   * Generates a cache key for user role lookups.
   * @param userId - User identifier
   * @param siteId - Site identifier
   * @returns Formatted cache key for user role
   */
  generateUserRoleKey(userId: string, siteId: string): string {
    if (!userId || !siteId) {
      console.warn('CacheService.generateUserRoleKey failed: missing required parameters', { userId: !!userId, siteId });
      return '';
    }
    return `${userId}-${siteId}-role`;
  }

  /**
   * Generates a cache key for bulk permission checks.
   * @param userId - User identifier
   * @param siteId - Site identifier
   * @param checkHash - Hash of the permission checks
   * @returns Formatted cache key for bulk permissions
   */
  generateBulkPermissionKey(userId: string, siteId: string, checkHash: string): string {
    if (!userId || !siteId || !checkHash) {
      console.warn('CacheService.generateBulkPermissionKey failed: missing required parameters', { userId: !!userId, siteId, checkHash: !!checkHash });
      return '';
    }
    return `${userId}-${siteId}-bulk-${checkHash}`;
  }

  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 300000);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Destroys the cache service, stopping cleanup timer and clearing all data.
   * Should be called when the service is no longer needed.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  /**
   * Gets the current number of entries in the cache.
   * @returns Number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   * Automatically removes expired entries.
   * @param key - Cache key to check
   * @returns True if key exists and is not expired
   */
  has(key: string): boolean {
    if (!key) {
      console.warn('CacheService.has failed: key is missing');
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}

