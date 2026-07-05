import { create } from 'zustand';
import { Collector, SyncQueueItem } from '../types';
import { db } from './database';
import { logger } from './logger';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { triggerHaptic, playSuccessChime } from '../shared/utils/feedback';

interface StoreState {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  session: any | null;
  activeCollector: Collector | null;

  theme: 'light' | 'dark';
  offlinePreference: boolean;
  notificationPreference: boolean;

  activeTab: string;
  isSyncing: boolean;
  syncProgress: number;
  pendingSyncCount: number;
  isOnline: boolean;

  setActiveTab: (tab: string) => void;
  setActiveCollector: (collector: Collector | null) => void;
  setOnlineStatus: (status: boolean) => void;
  refreshPendingSyncCount: () => Promise<number>;
  triggerSync: () => Promise<boolean>;
  login: (email: string, password: string, remember: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setAuthError: (error: string | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setOfflinePreference: (pref: boolean) => void;
  setNotificationPreference: (pref: boolean) => void;
  updateActiveCollector: (fullName: string, branch: string, targetAmount?: number, dailyTargetAmount?: number) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  isAuthenticated: false,
  isAuthLoading: false,
  authError: null,
  session: null,
  activeCollector: null,

  theme: (localStorage.getItem('fc_os_theme') as 'light' | 'dark') || 'light',
  offlinePreference: localStorage.getItem('fc_os_offline_pref') === 'true',
  notificationPreference: localStorage.getItem('fc_os_notif_pref') !== 'false',

  activeTab: 'dashboard',
  isSyncing: false,
  syncProgress: 0,
  pendingSyncCount: 0,
  isOnline: navigator.onLine,

  setActiveTab: (tab: string) => {
    logger.debug('Navigation', `Tab changed to: ${tab}`);
    set({ activeTab: tab });
  },

  setActiveCollector: (collector: Collector | null) => {
    logger.info('Auth', collector ? `Collector aktif: ${collector.fullName}` : 'Logout');
    set({ activeCollector: collector, isAuthenticated: !!collector });
  },

  setOnlineStatus: (isOnline: boolean) => {
    set({ isOnline });
    get().refreshPendingSyncCount();
  },

  refreshPendingSyncCount: async () => {
    try {
      const count = await db.syncQueue.count();
      set({ pendingSyncCount: count });
      return count;
    } catch (e) {
      logger.error('Sync', 'Failed to fetch pending sync count', e);
      return 0;
    }
  },

  setAuthError: (error: string | null) => set({ authError: error }),

  // login kept for interface compatibility (not used — LoginScreen uses AuthService directly)
  login: async (_email: string, _password: string, _remember: boolean) => {
    logger.warn('Auth', 'Direct login() called — use LoginScreen PIN flow instead');
    return false;
  },

  logout: async () => {
    logger.info('Auth', 'Logging out...');
    const hasSupabase = isSupabaseConfigured();
    if (hasSupabase) {
      try { await getSupabase().auth.signOut(); } catch (e) { /* ignore */ }
    }
    set({
      isAuthenticated: false,
      session: null,
      activeCollector: null,
      authError: null,
      activeTab: 'dashboard',
    });
    logger.info('Auth', 'Logged out. Session cleared.');
  },

  initializeAuth: async () => {
    // PIN-based auth: no stored session to auto-restore.
    // User must enter PIN on every app open (by design for field security).
    set({ isAuthLoading: false });
    logger.info('Auth', 'PIN-based auth: user must enter PIN to proceed.');
  },

  setTheme: (theme: 'light' | 'dark') => {
    localStorage.setItem('fc_os_theme', theme);
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set({ theme });
  },

  setOfflinePreference: (pref: boolean) => {
    localStorage.setItem('fc_os_offline_pref', String(pref));
    set({ offlinePreference: pref });
  },

  setNotificationPreference: (pref: boolean) => {
    localStorage.setItem('fc_os_notif_pref', String(pref));
    set({ notificationPreference: pref });
  },

  updateActiveCollector: async (fullName: string, branch: string, targetAmount?: number, dailyTargetAmount?: number) => {
    const { activeCollector } = get();
    if (!activeCollector) return;
    const updated = { 
      ...activeCollector, 
      fullName, 
      branch,
      ...(targetAmount !== undefined ? { targetAmount } : {}),
      ...(dailyTargetAmount !== undefined ? { dailyTargetAmount } : {})
    };
    await db.collectors.put(updated);
    set({ activeCollector: updated });
    logger.info('System', `Updated collector profile: ${fullName} (${branch}), Targets - Monthly: ${targetAmount}, Daily: ${dailyTargetAmount}`);
  },

  triggerSync: async () => {
    const { isSyncing, isOnline } = get();
    if (isSyncing) return false;
    await get().refreshPendingSyncCount();
    const count = get().pendingSyncCount;
    if (!isOnline) { logger.warn('Sync', 'Device offline, sync aborted.'); return false; }

    set({ isSyncing: true, syncProgress: 0 });
    logger.info('Sync', `Starting bidirectional sync (pending items to push: ${count})...`);

    const supabaseAvailable = isSupabaseConfigured();
    let supabaseClient: any = null;
    if (supabaseAvailable) {
      try { supabaseClient = getSupabase(); } catch (_) { /* no Supabase configured */ }
    }

    try {
      // 1. PUSH PHASE (Push local mutations to Supabase)
      if (count > 0) {
        const queueItems = await db.syncQueue.toArray();
        let succeeded = 0;

        for (let i = 0; i < queueItems.length; i++) {
          const item = queueItems[i];
          try {
            if (supabaseClient && item.id) {
              const table = item.entityType === 'visit' ? 'visits'
                : item.entityType === 'payment' ? 'payments'
                : item.entityType === 'customer' ? 'customers'
                : 'promise_to_pay';
              let query: any;
              if (item.action === 'CREATE') {
                query = supabaseClient.from(table).upsert(item.payload);
              } else if (item.action === 'UPDATE') {
                query = supabaseClient.from(table).upsert(item.payload);
              } else {
                query = supabaseClient.from(table).delete().eq('id', item.entityId);
              }
              const { error } = await query;
              if (error) throw error;
            } else {
              await new Promise(r => setTimeout(r, 200));
            }
            if (item.id !== undefined) { await db.syncQueue.delete(item.id); succeeded++; }
            set({ syncProgress: Math.round(((i + 1) / queueItems.length) * 50) });
          } catch (itemErr: any) {
            logger.error('Sync', `Failed item ${item.entityId}`, itemErr);
            if (item.id !== undefined) {
              await db.syncQueue.update(item.id, {
                attempts: item.attempts + 1,
                lastAttemptAt: new Date().toISOString(),
                error: itemErr?.message || String(itemErr)
              });
            }
          }
        }
        logger.info('Sync', `Push phase complete. ${succeeded}/${count} synced.`);
      } else {
        set({ syncProgress: 50 });
      }

      // 2. PULL PHASE (Pull latest records from Supabase and sync back to Dexie)
      if (supabaseClient) {
        logger.info('Sync', 'Starting pull phase from Supabase...');
        const tables = ['customers', 'visits', 'payments', 'promise_to_pay'];
        for (let t = 0; t < tables.length; t++) {
          const table = tables[t];
          const dexieTable = table === 'promise_to_pay' ? db.promiseToPay : (db as any)[table];
          if (!dexieTable) continue;

          // Fetch records from Supabase
          const { data, error } = await supabaseClient.from(table).select('*');
          if (error) {
            logger.error('Sync', `Failed to pull table ${table} from Supabase:`, error);
            continue;
          }

          if (data && data.length > 0) {
            logger.info('Sync', `Pulled ${data.length} records for table ${table}`);
            for (const record of data) {
              const localRecord = await dexieTable.get(record.id);
              // Only overwrite if the record doesn't exist locally OR if the local record is not pending sync and the pulled record has a higher or equal version, OR if the pulled record has a strictly higher version
              const isLocalPending = localRecord?.syncStatus === 'pending';
              const canOverwrite = !localRecord || 
                (isLocalPending && (record.version || 1) > (localRecord.version || 1)) ||
                (!isLocalPending && (record.version || 1) >= (localRecord.version || 1));

              if (canOverwrite) {
                await dexieTable.put({
                  ...record,
                  syncStatus: 'synced' // Mark as synced locally
                });
              }
            }
          }
          set({ syncProgress: 50 + Math.round(((t + 1) / tables.length) * 50) });
        }
        logger.info('Sync', 'Pull phase completed successfully.');
      }

      await get().refreshPendingSyncCount();
      set({ isSyncing: false, syncProgress: 100 });
      triggerHaptic([80, 50, 80]);
      playSuccessChime();
      return true;
    } catch (err) {
      logger.error('Sync', 'Sync failed', err);
      set({ isSyncing: false });
      return false;
    }
  }
}));

export default useStore;
