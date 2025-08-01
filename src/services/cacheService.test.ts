import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from './cacheService.js';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService(1000); // 1 second TTL for testing
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('constructor', () => {
    it('should create cache with default TTL', () => {
      const defaultCache = new CacheService();
      expect(defaultCache).toBeInstanceOf(CacheService);
      defaultCache.destroy();
    });

    it('should create cache with custom TTL', () => {
      const customCache = new CacheService(5000);
      expect(customCache).toBeInstanceOf(CacheService);
      customCache.destroy();
    });
  });

  describe('get and set operations', () => {
    it('should store and retrieve values', () => {
      cache.set('test-key', 'test-value');
      const result = cache.get<string>('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should handle different value types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('object', { test: 'value' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get<string>('string')).toBe('hello');
      expect(cache.get<number>('number')).toBe(42);
      expect(cache.get<boolean>('boolean')).toBe(true);
      expect(cache.get<object>('object')).toEqual({ test: 'value' });
      expect(cache.get<number[]>('array')).toEqual([1, 2, 3]);
    });

    it('should override existing values', () => {
      cache.set('key', 'value1');
      cache.set('key', 'value2');
      expect(cache.get<string>('key')).toBe('value2');
    });
  });

  describe('TTL functionality', () => {
    it('should expire entries after TTL', async () => {
      cache.set('expire-key', 'expire-value', { ttl: 100 });
      expect(cache.get('expire-key')).toBe('expire-value');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('expire-key')).toBeNull();
    });

    it('should use default TTL when no options provided', async () => {
      cache.set('default-ttl', 'value');
      expect(cache.get('default-ttl')).toBe('value');
      
      // Should still be there after a short time
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('default-ttl')).toBe('value');
    });

    it('should use custom TTL when provided', async () => {
      cache.set('custom-ttl', 'value', { ttl: 50 });
      expect(cache.get('custom-ttl')).toBe('value');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('custom-ttl')).toBeNull();
    });
  });

  describe('has method', () => {
    it('should return true for existing non-expired entries', () => {
      cache.set('exists', 'value');
      expect(cache.has('exists')).toBe(true);
    });

    it('should return false for non-existent entries', () => {
      expect(cache.has('does-not-exist')).toBe(false);
    });

    it('should return false for expired entries', async () => {
      cache.set('will-expire', 'value', { ttl: 50 });
      expect(cache.has('will-expire')).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.has('will-expire')).toBe(false);
    });
  });

  describe('clear operations', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      expect(cache.size()).toBe(3);
      cache.clear();
      expect(cache.size()).toBe(0);
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });

    it('should clear user-specific entries', () => {
      cache.set('user123-site1-groups-read', true);
      cache.set('user123-site2-users-create', false);
      cache.set('user456-site1-groups-read', true);
      cache.set('other-key', 'value');
      
      expect(cache.size()).toBe(4);
      cache.clearUser('user123');
      expect(cache.size()).toBe(2);
      
      expect(cache.get('user123-site1-groups-read')).toBeNull();
      expect(cache.get('user123-site2-users-create')).toBeNull();
      expect(cache.get('user456-site1-groups-read')).toBe(true);
      expect(cache.get('other-key')).toBe('value');
    });

    it('should clear entries with user ID as exact key', () => {
      cache.set('user123', 'user-data');
      cache.set('user123-site1-role', 'admin');
      cache.set('user456', 'other-user-data');
      
      cache.clearUser('user123');
      
      expect(cache.get('user123')).toBeNull();
      expect(cache.get('user123-site1-role')).toBeNull();
      expect(cache.get('user456')).toBe('other-user-data');
    });
  });

  describe('key generation utilities', () => {
    it('should generate permission keys', () => {
      const key = cache.generatePermissionKey('user123', 'site456', 'groups', 'read');
      expect(key).toBe('user123-site456-groups-read');
    });

    it('should generate user role keys', () => {
      const key = cache.generateUserRoleKey('user123', 'site456');
      expect(key).toBe('user123-site456-role');
    });

    it('should generate bulk permission keys', () => {
      const key = cache.generateBulkPermissionKey('user123', 'site456', 'hash123');
      expect(key).toBe('user123-site456-bulk-hash123');
    });
  });

  describe('size method', () => {
    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should not count expired entries in size', async () => {
      cache.set('key1', 'value1', { ttl: 50 });
      cache.set('key2', 'value2');
      
      expect(cache.size()).toBe(2);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Accessing expired entry should remove it
      cache.get('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('cleanup mechanism', () => {
    it('should start cleanup timer on construction', () => {
      const spySetInterval = vi.spyOn(global, 'setInterval');
      const testCache = new CacheService();
      
      expect(spySetInterval).toHaveBeenCalledWith(expect.any(Function), 300000);
      
      testCache.destroy();
      spySetInterval.mockRestore();
    });

    it('should clean up expired entries when accessed', async () => {
      // Test that expired entries are cleaned up when accessed
      cache.set('expire1', 'value1', { ttl: 25 });
      cache.set('expire2', 'value2', { ttl: 25 });
      cache.set('keep', 'value3', { ttl: 200 });
      
      expect(cache.size()).toBe(3);
      
      // Wait for some entries to expire
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Accessing expired entries should remove them
      expect(cache.get('expire1')).toBeNull();
      expect(cache.get('expire2')).toBeNull();
      expect(cache.get('keep')).toBe('value3');
      
      // Size should now reflect the cleanup
      expect(cache.size()).toBe(1);
    });
  });

  describe('destroy method', () => {
    it('should clear cache and stop cleanup timer', () => {
      const spyClearInterval = vi.spyOn(global, 'clearInterval');
      
      cache.set('key', 'value');
      expect(cache.size()).toBe(1);
      
      cache.destroy();
      
      expect(cache.size()).toBe(0);
      expect(spyClearInterval).toHaveBeenCalled();
      
      spyClearInterval.mockRestore();
    });

    it('should handle multiple destroy calls gracefully', () => {
      cache.set('key', 'value');
      
      cache.destroy();
      expect(cache.size()).toBe(0);
      
      // Should not throw
      expect(() => cache.destroy()).not.toThrow();
    });
  });
});
