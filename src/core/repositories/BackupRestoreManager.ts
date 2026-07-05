import { db } from '../database';
import { backupHistoryRepository, auditLogRepository } from './ConcreteRepositories';
import { logger } from '../logger';

export interface BackupPayload {
  metadata: {
    exportDate: string;
    databaseName: string;
    schemaVersion: number;
    recordCount: number;
    checksum: string;
  };
  data: {
    users: any[];
    customers: any[];
    visits: any[];
    payments: any[];
    promise_to_pay: any[];
    attachments: any[];
    notes: any[];
    tasks: any[];
    activity_logs: any[];
    settings: any[];
    sync_queue: any[];
    audit_logs: any[];
  };
}

/**
 * Backup and Restore Manager
 * Core infrastructure for local file-based database preservation.
 */
export class BackupRestoreManager {
  
  /**
   * Generates a fast, reliable checksum of a string payload for integrity checking
   */
  private static calculateChecksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Exports the entire database into a single, structured JSON string
   */
  public static async exportBackup(userId = 'system'): Promise<string> {
    try {
      logger.info('Backup', 'Database export initiated...');
      
      // Fetch all records from all primary tables
      const users = await db.users.toArray();
      const customers = await db.customers.toArray();
      const visits = await db.visits.toArray();
      const payments = await db.payments.toArray();
      const promise_to_pay = await db.promise_to_pay.toArray();
      const attachments = await db.attachments.toArray();
      const notes = await db.notes.toArray();
      const tasks = await db.tasks.toArray();
      const activity_logs = await db.activity_logs.toArray();
      const settings = await db.settings.toArray();
      const sync_queue = await db.sync_queue.toArray();
      const audit_logs = await db.audit_logs.toArray();

      const recordCount = 
        users.length + customers.length + visits.length + payments.length + 
        promise_to_pay.length + attachments.length + notes.length + tasks.length + 
        activity_logs.length + settings.length + sync_queue.length + audit_logs.length;

      // Extract records to data payload
      const payloadData = {
        users,
        customers,
        visits,
        payments,
        promise_to_pay,
        attachments,
        notes,
        tasks,
        activity_logs,
        settings,
        sync_queue,
        audit_logs
      };

      const rawDataString = JSON.stringify(payloadData);
      const checksum = this.calculateChecksum(rawDataString);
      const exportDate = new Date().toISOString();

      const completePayload: BackupPayload = {
        metadata: {
          exportDate,
          databaseName: 'FCOS_DB',
          schemaVersion: 1,
          recordCount,
          checksum
        },
        data: payloadData
      };

      const finalBackupString = JSON.stringify(completePayload);
      const id = `BU-${Date.now()}`;
      
      // Save log entry in backup history repository
      await backupHistoryRepository.insert({
        id,
        backupDate: exportDate,
        fileName: `fcos_backup_${Date.now()}.json`,
        fileSize: finalBackupString.length,
        checksum,
        status: 'success',
        recordCount
      }, userId);

      logger.info('Backup', `Database backup successfully exported. ${recordCount} records processed. Hash: ${checksum}`);
      return finalBackupString;
    } catch (err: any) {
      logger.error('Backup', 'Backup export process failed', err);
      throw new Error(`Export failed: ${err.message || 'Unknown database issue'}`);
    }
  }

  /**
   * Validates database backup format and integrity checksums
   */
  public static validateBackup(backupJsonString: string): { isValid: boolean; error?: string; payload?: BackupPayload } {
    try {
      if (!backupJsonString) {
        return { isValid: false, error: 'Backup payload is empty.' };
      }

      const payload: BackupPayload = JSON.parse(backupJsonString);

      // 1. Structure check
      if (!payload.metadata || !payload.data) {
        return { isValid: false, error: 'Invalid backup format. Missing metadata or data payload.' };
      }

      const { checksum, schemaVersion, databaseName } = payload.metadata;
      if (databaseName !== 'FCOS_DB') {
        return { isValid: false, error: `Invalid database target: ${databaseName}` };
      }

      // 2. Recalculate checksum
      const rawDataString = JSON.stringify(payload.data);
      const recalculated = this.calculateChecksum(rawDataString);

      if (recalculated !== checksum) {
        return { 
          isValid: false, 
          error: `Integrity check failed: checksum mismatch (Expected ${checksum}, calculated ${recalculated}). Data may be corrupted.` 
        };
      }

      return { isValid: true, payload };
    } catch (err: any) {
      return { isValid: false, error: `Failed to parse backup payload: ${err.message || 'Malformed JSON'}` };
    }
  }

  /**
   * Restores the database atomicly from a backup payload.
   * If any step fails, the entire restore rolls back.
   */
  public static async restoreBackup(backupJsonString: string, userId = 'system'): Promise<boolean> {
    const validation = this.validateBackup(backupJsonString);
    if (!validation.isValid || !validation.payload) {
      throw new Error(`Restore rejected: ${validation.error}`);
    }

    const payload = validation.payload;
    const { data } = payload;

    try {
      logger.warn('Restore', 'Commencing database restoration from validated backup...');
      
      // Perform restore wrapped in a safe Dexie transaction across all tables
      await db.transaction('rw', [
        db.users, db.customers, db.visits, db.payments, db.promise_to_pay,
        db.attachments, db.notes, db.tasks, db.activity_logs, db.settings,
        db.sync_queue, db.audit_logs
      ], async () => {
        // Clear all tables before inserting backup
        await db.users.clear();
        await db.customers.clear();
        await db.visits.clear();
        await db.payments.clear();
        await db.promise_to_pay.clear();
        await db.attachments.clear();
        await db.notes.clear();
        await db.tasks.clear();
        await db.activity_logs.clear();
        await db.settings.clear();
        await db.sync_queue.clear();
        await db.audit_logs.clear();

        // Safe insertion of backup row data
        if (data.users?.length) await db.users.bulkAdd(data.users);
        if (data.customers?.length) await db.customers.bulkAdd(data.customers);
        if (data.visits?.length) await db.visits.bulkAdd(data.visits);
        if (data.payments?.length) await db.payments.bulkAdd(data.payments);
        if (data.promise_to_pay?.length) await db.promise_to_pay.bulkAdd(data.promise_to_pay);
        if (data.attachments?.length) await db.attachments.bulkAdd(data.attachments);
        if (data.notes?.length) await db.notes.bulkAdd(data.notes);
        if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
        if (data.activity_logs?.length) await db.activity_logs.bulkAdd(data.activity_logs);
        if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        if (data.sync_queue?.length) await db.sync_queue.bulkAdd(data.sync_queue);
        if (data.audit_logs?.length) await db.audit_logs.bulkAdd(data.audit_logs);
      });

      // Record successful audit log
      const nowStr = new Date().toISOString();
      await auditLogRepository.insert({
        id: `AL-${Date.now()}`,
        level: 'INFO',
        tag: 'Database',
        message: 'Database successfully restored from backup file.',
        timestamp: nowStr,
        details: JSON.stringify({
          recordsRestored: payload.metadata.recordCount,
          backupChecksum: payload.metadata.checksum,
          restoredBy: userId
        })
      } as any, userId);

      logger.info('Restore', `Restore completed successfully! ${payload.metadata.recordCount} records loaded.`);
      return true;
    } catch (err: any) {
      logger.error('Restore', 'Fatal restore failure encountered. Transaction rolled back successfully.', err);
      throw new Error(`Restore failed: ${err.message || 'Internal database failure'}`);
    }
  }
}
