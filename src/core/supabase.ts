import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Lazy Initializer for Supabase Client
 * Safely handles missing environment variables without crashing the application on startup,
 * which is critical for local sandbox/preview environments and robust offline fallback.
 */
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = localStorage.getItem('supabase_url_override') || (import.meta as any).env.VITE_SUPABASE_URL;
  const supabaseKey = localStorage.getItem('supabase_anon_key_override') || (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const errorMsg = 'Supabase environment variables (VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY) are missing.';
    logger.warn('Supabase', `${errorMsg} Real-time cloud synchronization is suspended. App running in offline-only IndexedDB mode.`);
    throw new Error(errorMsg);
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      }
    });
    logger.info('Supabase', 'Supabase Client initialized successfully');
    return supabaseInstance;
  } catch (error) {
    logger.error('Supabase', 'Failed to initialize Supabase Client', error);
    throw error;
  }
}

/**
 * Helper to check if Supabase is properly configured in the current environment
 */
export function isSupabaseConfigured(): boolean {
  const url = localStorage.getItem('supabase_url_override') || (import.meta as any).env.VITE_SUPABASE_URL;
  const key = localStorage.getItem('supabase_anon_key_override') || (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * Update the Supabase client with new credentials manually from the app's UI (fallback)
 */
export function updateSupabaseConfig(url: string, key: string) {
  if (url.trim() && key.trim()) {
    localStorage.setItem('supabase_url_override', url.trim());
    localStorage.setItem('supabase_anon_key_override', key.trim());
  } else {
    localStorage.removeItem('supabase_url_override');
    localStorage.removeItem('supabase_anon_key_override');
  }
  supabaseInstance = null; // Forces recreate client on next call
  logger.info('Supabase', 'Supabase configurations updated manually. Connection instance reset.');
}

