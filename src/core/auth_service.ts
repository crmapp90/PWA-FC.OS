/**
 * auth_service.ts — PIN-based local authentication using WebCrypto
 * Replaces hardcoded credentials entirely. No plaintext passwords stored anywhere.
 */

import { db } from './database';
import { logger } from './logger';

const SALT_KEY = 'fcos_auth_salt';
const PIN_HASH_KEY = 'fcos_pin_hash';
const COLLECTOR_ID_KEY = 'fcos_collector_id';
const LOCKOUT_KEY = 'fcos_lockout';
const ATTEMPT_KEY = 'fcos_attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function generateSalt(): Promise<string> {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPIN(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const AuthService = {
  /** Returns true if a PIN has been set up on this device */
  hasPIN(): boolean {
    return !!localStorage.getItem(PIN_HASH_KEY);
  },

  /** One-time setup: hash and store PIN with random salt */
  async setupPIN(pin: string, collectorId: string): Promise<void> {
    if (pin.length < 4) throw new Error('PIN minimal 4 digit');
    const salt = await generateSalt();
    const hash = await hashPIN(pin, salt);
    localStorage.setItem(SALT_KEY, salt);
    localStorage.setItem(PIN_HASH_KEY, hash);
    localStorage.setItem(COLLECTOR_ID_KEY, collectorId);
    localStorage.removeItem(ATTEMPT_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
    logger.info('Auth', 'PIN configured securely via WebCrypto SHA-256');
  },

  /** Verify PIN — returns collector ID on success, null on failure */
  async verifyPIN(pin: string): Promise<string | null> {
    // Check lockout
    const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0');
    if (Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      throw new Error(`Terlalu banyak percobaan. Coba lagi dalam ${remaining} detik.`);
    }

    const salt = localStorage.getItem(SALT_KEY);
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    const collectorId = localStorage.getItem(COLLECTOR_ID_KEY);

    if (!salt || !storedHash || !collectorId) {
      throw new Error('PIN belum dikonfigurasi. Hubungi supervisor.');
    }

    const hash = await hashPIN(pin, salt);
    if (hash === storedHash) {
      // Success — reset attempts
      localStorage.removeItem(ATTEMPT_KEY);
      localStorage.removeItem(LOCKOUT_KEY);
      logger.info('Auth', 'PIN verified successfully');
      return collectorId;
    }

    // Failed — increment attempts
    const attempts = parseInt(localStorage.getItem(ATTEMPT_KEY) || '0') + 1;
    localStorage.setItem(ATTEMPT_KEY, String(attempts));
    if (attempts >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(LOCKOUT_KEY, String(lockUntil));
      localStorage.removeItem(ATTEMPT_KEY);
      throw new Error(`PIN salah ${MAX_ATTEMPTS}x. Akun terkunci 5 menit.`);
    }
    logger.warn('Auth', `PIN salah. Percobaan ${attempts}/${MAX_ATTEMPTS}`);
    return null;
  },

  /** Change PIN — requires old PIN verification first */
  async changePIN(oldPin: string, newPin: string): Promise<void> {
    const collectorId = await AuthService.verifyPIN(oldPin);
    if (!collectorId) throw new Error('PIN lama tidak cocok');
    await AuthService.setupPIN(newPin, collectorId);
  },

  /** Clear all auth data (logout/reset) */
  clearAuth(): void {
    // Keep PIN setup intact, only clear session tokens
    sessionStorage.removeItem('fcos_session');
  },

  /** Clear PIN entirely (device reset) */
  resetDevice(): void {
    localStorage.removeItem(SALT_KEY);
    localStorage.removeItem(PIN_HASH_KEY);
    localStorage.removeItem(COLLECTOR_ID_KEY);
    localStorage.removeItem(ATTEMPT_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
    logger.warn('Auth', 'Device reset: all auth data cleared');
  },

  getRemainingLockout(): number {
    const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0');
    return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
  }
};
