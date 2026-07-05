import { logger } from './logger';

/**
 * Secure Storage Utility for PWA
 * Obfuscates sensitive values stored in localStorage to prevent easy inspection,
 * fulfilling the secure local storage guidelines in the Sprint 0 and Master Constitution specs.
 */
class SecureStorageService {
  private prefix = 'fc_os_';

  // Basic Base64 encoding for client-side obfuscation. In production, a stronger client-side 
  // encryption using WebCrypto API (AES-GCM) with an environment-derived key can be layered.
  private encrypt(value: string): string {
    try {
      return btoa(encodeURIComponent(value));
    } catch (e) {
      logger.error('SecureStorage', 'Encryption error', e);
      return value;
    }
  }

  private decrypt(encoded: string): string {
    try {
      return decodeURIComponent(atob(encoded));
    } catch (e) {
      logger.error('SecureStorage', 'Decryption error', e);
      return encoded;
    }
  }

  public setItem(key: string, value: string): void {
    try {
      const encryptedKey = this.prefix + key;
      const encryptedValue = this.encrypt(value);
      localStorage.setItem(encryptedKey, encryptedValue);
    } catch (error) {
      logger.error('SecureStorage', `Failed to write key: ${key}`, error);
    }
  }

  public getItem(key: string): string | null {
    try {
      const encryptedKey = this.prefix + key;
      const storedValue = localStorage.getItem(encryptedKey);
      if (!storedValue) return null;
      return this.decrypt(storedValue);
    } catch (error) {
      logger.error('SecureStorage', `Failed to read key: ${key}`, error);
      return null;
    }
  }

  public removeItem(key: string): void {
    try {
      const encryptedKey = this.prefix + key;
      localStorage.removeItem(encryptedKey);
    } catch (error) {
      logger.error('SecureStorage', `Failed to remove key: ${key}`, error);
    }
  }

  public clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      logger.info('SecureStorage', 'All secured items cleared');
    } catch (error) {
      logger.error('SecureStorage', 'Clear operation failed', error);
    }
  }
}

export const secureStorage = new SecureStorageService();
export default secureStorage;
