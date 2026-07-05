import { syncQueueRepository } from './ConcreteRepositories';
import { SyncQueueItem } from '../../types';
import { logger } from '../logger';

/**
 * Sync Queue Manager
 * Coordinates offline action queuing and transaction states.
 * (Actual background networking sync logic will be implemented in a future sprint).
 */
export class SyncQueueManager {
  /**
   * Enqueues a new offline operation to the sync queue
   */
  public static async enqueue(
    entityType: 'customer' | 'visit' | 'payment' | 'promise_to_pay',
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: Record<string, any>,
    userId = 'system'
  ): Promise<SyncQueueItem> {
    const id = `SQ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newItem: Omit<SyncQueueItem, 'uuid' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isDeleted' | 'version' | 'createdBy' | 'updatedBy'> & { id: string } = {
      id,
      entityType,
      entityId,
      action,
      payload,
      attempts: 0,
      syncStatus: 'pending'
    };

    try {
      const saved = await syncQueueRepository.insert(newItem as any, userId);
      logger.info('SyncQueue', `Enqueued ${action} action for ${entityType} ${entityId} with Sync ID: ${saved.id}`);
      return saved;
    } catch (err) {
      logger.error('SyncQueue', `Failed to enqueue action for ${entityType} ${entityId}`, err);
      throw err;
    }
  }

  /**
   * Resolves a queue item as successfully synced to the cloud
   */
  public static async markSuccess(id: string, userId = 'system'): Promise<void> {
    try {
      const item = await syncQueueRepository.findById(id);
      if (!item) {
        throw new Error(`Queue item ${id} not found.`);
      }

      // We can either soft-delete or physical-delete the queue item. 
      // Soft delete is cleaner for sync history audits.
      await syncQueueRepository.update(id, {
        syncStatus: 'synced',
        attempts: item.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        error: undefined
      }, userId);

      await syncQueueRepository.softDelete(id, userId);
      logger.info('SyncQueue', `Successfully synced and archived queue item: ${id}`);
    } catch (err) {
      logger.error('SyncQueue', `Failed to mark queue item ${id} as success`, err);
      throw err;
    }
  }

  /**
   * Marks a sync item as failed and increments retry attempts
   */
  public static async markFailed(id: string, error: string, userId = 'system'): Promise<void> {
    try {
      const item = await syncQueueRepository.findById(id);
      if (!item) {
        throw new Error(`Queue item ${id} not found.`);
      }

      const nextAttempts = item.attempts + 1;
      const syncStatus = nextAttempts >= 5 ? ('failed' as const) : ('pending' as const);

      await syncQueueRepository.update(id, {
        syncStatus,
        attempts: nextAttempts,
        lastAttemptAt: new Date().toISOString(),
        error: error || 'Unknown transmission exception'
      }, userId);

      logger.warn('SyncQueue', `Queue item ${id} failed attempt #${nextAttempts}: ${error}`);
    } catch (err) {
      logger.error('SyncQueue', `Failed to update failure state for queue item ${id}`, err);
      throw err;
    }
  }

  /**
   * Marks a sync item as in a state of conflict (requiring supervisor override or reconciliation)
   */
  public static async markConflict(id: string, conflictDetails: string, userId = 'system'): Promise<void> {
    try {
      const item = await syncQueueRepository.findById(id);
      if (!item) {
        throw new Error(`Queue item ${id} not found.`);
      }

      await syncQueueRepository.update(id, {
        syncStatus: 'failed',
        error: `CONFLICT: ${conflictDetails}`,
        lastAttemptAt: new Date().toISOString(),
        attempts: item.attempts + 1
      }, userId);

      logger.error('SyncQueue', `Sync item ${id} is in conflict: ${conflictDetails}`);
    } catch (err) {
      logger.error('SyncQueue', `Failed to mark conflict on sync queue item ${id}`, err);
      throw err;
    }
  }

  /**
   * Forces a retry of a failed or pending queue item
   */
  public static async retry(id: string, userId = 'system'): Promise<void> {
    try {
      const item = await syncQueueRepository.findById(id, true); // Include soft-deleted if we want to restore
      if (!item) {
        throw new Error(`Queue item ${id} not found.`);
      }

      if (item.isDeleted) {
        await syncQueueRepository.restore(id, userId);
      }

      await syncQueueRepository.update(id, {
        syncStatus: 'pending',
        attempts: 0,
        error: undefined
      }, userId);

      logger.info('SyncQueue', `Forced retry requested for queue item: ${id}`);
    } catch (err) {
      logger.error('SyncQueue', `Failed to retry sync queue item ${id}`, err);
      throw err;
    }
  }

  /**
   * Retrieves all items currently awaiting processing
   */
  public static async getPendingQueue(): Promise<SyncQueueItem[]> {
    return syncQueueRepository.getPendingQueue();
  }

  /**
   * Retrieves all items that failed processing
   */
  public static async getFailedQueue(): Promise<SyncQueueItem[]> {
    return syncQueueRepository.getFailedQueue();
  }
}
