import { db } from '../database';
import { syncQueueRepository, auditLogRepository } from '../repositories/ConcreteRepositories';
import { logger } from '../logger';
import { SyncQueueItem } from '../../types';

export type ConflictStrategy = 'LAST_WRITE_WINS' | 'NEWEST_VERSION' | 'BUSINESS_RULES' | 'MANUAL';

export interface SyncEngineStats {
  lastSyncTime: string | null;
  nextSyncTime: string | null;
  durationMs: number;
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  totalConflicts: number;
  isOnline: boolean;
}

export class SyncEngineService {
  private static syncInterval: any = null;
  private static mockNetworkStatus: boolean = true; // Simulates network toggle

  /**
   * Set simulated network connectivity status
   */
  public static setNetworkStatus(online: boolean) {
    this.mockNetworkStatus = online;
    logger.info('SyncEngine', `Simulated network status changed to: ${online ? 'ONLINE' : 'OFFLINE'}`);
  }

  public static isNetworkAvailable(): boolean {
    return navigator.onLine && this.mockNetworkStatus;
  }

  /**
   * Verifies actual network throughput to prevent navigator.onLine false positives.
   * Sends a lightweight probe to the server with a strict 5-second timeout.
   */
  public static async checkNetworkThroughput(): Promise<boolean> {
    if (!navigator.onLine || !this.mockNetworkStatus) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (e) {
      logger.warn('SyncEngine', 'Network probe failed: Host is reachable but has zero throughput.', e);
      return false;
    }
  }

  /**
   * Fetch current Sync Engine Stats
   */
  public static async getStats(): Promise<SyncEngineStats> {
    const lastSync = localStorage.getItem('fcos_last_sync_time');
    const nextSync = localStorage.getItem('fcos_next_sync_time');
    const duration = parseInt(localStorage.getItem('fcos_last_sync_duration') || '0', 10);
    const totalProcessed = parseInt(localStorage.getItem('fcos_sync_total_processed') || '0', 10);
    const totalSucceeded = parseInt(localStorage.getItem('fcos_sync_total_succeeded') || '0', 10);
    const totalFailed = parseInt(localStorage.getItem('fcos_sync_total_failed') || '0', 10);
    const totalConflicts = parseInt(localStorage.getItem('fcos_sync_total_conflicts') || '0', 10);

    return {
      lastSyncTime: lastSync,
      nextSyncTime: nextSync,
      durationMs: duration,
      totalProcessed,
      totalSucceeded,
      totalFailed,
      totalConflicts,
      isOnline: this.isNetworkAvailable()
    };
  }

  /**
   * Gets the active conflict resolution strategy
   */
  public static getConflictStrategy(): ConflictStrategy {
    return (localStorage.getItem('fcos_conflict_strategy') as ConflictStrategy) || 'LAST_WRITE_WINS';
  }

  /**
   * Sets the conflict resolution strategy
   */
  public static setConflictStrategy(strategy: ConflictStrategy) {
    localStorage.setItem('fcos_conflict_strategy', strategy);
    logger.info('SyncEngine', `Conflict strategy set to: ${strategy}`);
  }

  /**
   * Helper to resolve sync conflicts based on the configured strategy
   */
  public static resolveConflict(
    strategy: ConflictStrategy,
    clientItem: any,
    serverMockItem: any
  ): { resolvedItem: any; action: 'USE_CLIENT' | 'USE_SERVER' | 'MANUAL_PENDING' | 'REJECT' } {
    
    switch (strategy) {
      case 'LAST_WRITE_WINS':
        // Overwrite whatever is on server with client's latest change
        logger.info('Conflict', `Last Write Wins applied for client ID: ${clientItem.id}`);
        return { resolvedItem: clientItem, action: 'USE_CLIENT' };

      case 'NEWEST_VERSION':
        // Check timestamps or version numbers
        const clientVer = clientItem.version || 1;
        const serverVer = serverMockItem.version || 1;
        const clientTime = clientItem.updatedAt || clientItem.createdAt || '';
        const serverTime = serverMockItem.updatedAt || serverMockItem.createdAt || '';

        if (clientVer > serverVer || clientTime > serverTime) {
          logger.info('Conflict', `Newest Version resolves to CLIENT (Client version: ${clientVer}, Server: ${serverVer})`);
          return { resolvedItem: clientItem, action: 'USE_CLIENT' };
        } else {
          logger.info('Conflict', `Newest Version resolves to SERVER (Client version: ${clientVer}, Server: ${serverVer})`);
          return { resolvedItem: serverMockItem, action: 'USE_SERVER' };
        }

      case 'BUSINESS_RULES':
        // E.g., if a payment status is 'Verified' or 'Recorded', prevent soft-deletion or lower-amount updates
        if (clientItem.status === 'Verified' && serverMockItem.status === 'Cancelled') {
          logger.warn('Conflict', 'Business rule restriction: cannot overwrite a verified payment with cancelled status.');
          return { resolvedItem: serverMockItem, action: 'USE_SERVER' }; // Retain secure server record
        }
        
        // E.g. outstanding balance cannot go negative
        if (clientItem.remainingOutstanding !== undefined && clientItem.remainingOutstanding < 0) {
          const corrected = { ...clientItem, remainingOutstanding: 0 };
          logger.info('Conflict', 'Business rules corrected negative outstanding balance to 0.');
          return { resolvedItem: corrected, action: 'USE_CLIENT' };
        }

        return { resolvedItem: clientItem, action: 'USE_CLIENT' };

      case 'MANUAL':
      default:
        // Pushes the sync item into 'Conflict' status, requiring supervisor override
        logger.error('Conflict', `Manual resolution flag requested for item ID: ${clientItem.id}`);
        return { resolvedItem: null, action: 'MANUAL_PENDING' };
    }
  }

  /**
   * Runs the core Incremental Sync Loop simulation
   */
  public static async executeSync(onProgress?: (progress: number) => void): Promise<boolean> {
    if (!this.isNetworkAvailable()) {
      logger.warn('SyncEngine', 'Sync aborted. Simulated device is OFFLINE.');
      return false;
    }

    // Verify true network throughput via lightweight ping to prevent navigator.onLine false positives
    const hasThroughput = await this.checkNetworkThroughput();
    if (!hasThroughput) {
      logger.warn('SyncEngine', 'Sync aborted: Device is connected to a signal but has zero actual internet throughput (Ping timed out).');
      return false;
    }

    const startTime = Date.now();
    logger.info('SyncEngine', 'Initiating sync process execution...');

    // Fetch pending items
    const pendingItems = await db.sync_queue
      .where('syncStatus')
      .anyOf(['pending', 'retry'])
      .toArray();

    if (pendingItems.length === 0) {
      logger.info('SyncEngine', 'Sync complete: no pending mutations.');
      localStorage.setItem('fcos_last_sync_time', new Date().toISOString());
      return true;
    }

    const strategy = this.getConflictStrategy();
    let succeeded = 0;
    let failed = 0;
    let conflicts = 0;

    onProgress?.(5);

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        
        // Simulate minor propagation latency
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Dynamic simulated network interruption check
        if (!this.isNetworkAvailable()) {
          throw new Error('Sync interrupted: network connection lost midway.');
        }

        try {
          // Wrap operations in an atomic Dexie transaction to prevent state overwrite race conditions
          await db.transaction('rw', [db.sync_queue, db.promise_to_pay, db.visits, db.payments, db.customers], async () => {
            // Sync status: processing
            await db.sync_queue.update(item.id, { syncStatus: 'syncing' });

            // Simulate resolving table targets
            const tableKey = item.entityType === 'visit' ? 'visits' 
                            : item.entityType === 'payment' ? 'payments' 
                            : item.entityType === 'customer' ? 'customers'
                            : 'promise_to_pay';
            
            const actualTable = tableKey === 'promise_to_pay' ? db.promise_to_pay : (db as any)[tableKey];
            
            if (!actualTable) {
              throw new Error(`Invalid entity type target: ${item.entityType}`);
            }

            const localRecord = await actualTable.get(item.entityId);

            // Simulate server status to determine conflict
            // 25% chance of conflict simulation for items that have versions greater than 1
            const isConflictSimulated = (localRecord?.version || 1) > 1 && Math.random() < 0.25;

            if (isConflictSimulated) {
              // Mock server has an older or conflicting version
              const serverMockRecord = {
                ...localRecord,
                version: (localRecord.version || 1) - 1,
                updatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                notes: 'SERVER_CONFLICT_VERSION_MOCK'
              };

              const resolution = this.resolveConflict(strategy, localRecord, serverMockRecord);

              if (resolution.action === 'USE_CLIENT') {
                // Write resolved record back to database and sync
                await actualTable.put(resolution.resolvedItem);
                await db.sync_queue.delete(item.id);
              } else if (resolution.action === 'USE_SERVER') {
                // Server wins: replace client's record with server's record
                await actualTable.put(resolution.resolvedItem);
                await db.sync_queue.delete(item.id);
              } else if (resolution.action === 'MANUAL_PENDING') {
                // Mark conflict in queue
                await db.sync_queue.update(item.id, {
                  syncStatus: 'failed',
                  error: 'CONFLICT: Manual resolution required by supervisor',
                  attempts: item.attempts + 1
                });
                conflicts++;
              } else {
                throw new Error('Conflict resolution rejected action.');
              }
            } else {
              // Normal, conflict-free sync
              if (item.action === 'DELETE' || item.action === 'UPDATE' && localRecord?.isDeleted) {
                // Soft delete or hard delete handling
                if (localRecord) {
                  localRecord.syncStatus = 'synced';
                  await actualTable.put(localRecord);
                }
              } else {
                if (localRecord) {
                  localRecord.syncStatus = 'synced';
                  await actualTable.put(localRecord);
                }
              }

              // Remove from sync queue on successful syncing
              await db.sync_queue.delete(item.id);
            }
          });
          succeeded++;
        } catch (itemErr: any) {
          failed++;
          logger.error('SyncEngine', `Item ID ${item.entityId} sync failed`, itemErr);
          
          const attempts = item.attempts + 1;
          const status = attempts >= 5 ? ('failed' as const) : ('pending' as const);
          
          await db.sync_queue.update(item.id, {
            syncStatus: status,
            attempts,
            lastAttemptAt: new Date().toISOString(),
            error: itemErr.message || String(itemErr)
          });
        }

        const progressPercent = Math.round(5 + ((i + 1) / pendingItems.length) * 90);
        onProgress?.(progressPercent);
      }

      onProgress?.(100);
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Update Local Stats
      const prevProcessed = parseInt(localStorage.getItem('fcos_sync_total_processed') || '0', 10);
      const prevSucceeded = parseInt(localStorage.getItem('fcos_sync_total_succeeded') || '0', 10);
      const prevFailed = parseInt(localStorage.getItem('fcos_sync_total_failed') || '0', 10);
      const prevConflicts = parseInt(localStorage.getItem('fcos_sync_total_conflicts') || '0', 10);

      localStorage.setItem('fcos_last_sync_time', new Date().toISOString());
      localStorage.setItem('fcos_last_sync_duration', String(durationMs));
      localStorage.setItem('fcos_sync_total_processed', String(prevProcessed + pendingItems.length));
      localStorage.setItem('fcos_sync_total_succeeded', String(prevSucceeded + succeeded));
      localStorage.setItem('fcos_sync_total_failed', String(prevFailed + failed));
      localStorage.setItem('fcos_sync_total_conflicts', String(prevConflicts + conflicts));

      // Audit logs
      await db.audit_logs.add({
        id: `AL-${Date.now()}`,
        level: failed > 0 ? 'WARN' : 'INFO',
        tag: 'SyncEngine',
        message: `Sync execution completed. Success: ${succeeded}, Failed: ${failed}, Conflicts: ${conflicts}.`,
        timestamp: new Date().toISOString(),
        uuid: crypto.randomUUID ? crypto.randomUUID() : `AL-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: 'system-sync',
        updatedBy: 'system-sync'
      });

      return true;
    } catch (globalErr: any) {
      logger.error('SyncEngine', 'Global sync routine interrupted', globalErr);
      
      onProgress?.(0);
      return false;
    }
  }

  /**
   * Initializes automatic periodic background sync simulator (runs every 60s)
   */
  public static startBackgroundSync(onSyncFinished?: () => void) {
    if (this.syncInterval) clearInterval(this.syncInterval);

    logger.info('SyncEngine', 'Starting automatic offline sync scheduler (60s loop)...');
    
    // Set simulated next sync time
    const setNextTime = () => {
      const nextDate = new Date(Date.now() + 60 * 1000).toISOString();
      localStorage.setItem('fcos_next_sync_time', nextDate);
    };
    
    setNextTime();

    this.syncInterval = setInterval(async () => {
      if (this.isNetworkAvailable()) {
        const count = await db.sync_queue.count();
        if (count > 0) {
          logger.info('SyncEngine', `Scheduler: processing ${count} mutations in background...`);
          await this.executeSync();
          onSyncFinished?.();
        }
      }
      setNextTime();
    }, 60 * 1000);
  }

  public static stopBackgroundSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('SyncEngine', 'Background sync scheduler stopped.');
    }
  }
}
