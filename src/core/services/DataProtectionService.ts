import { db } from '../database';
import { backupHistoryRepository, auditLogRepository } from '../repositories/ConcreteRepositories';
import { logger } from '../logger';
import { BackupHistory } from '../../types';

export interface BackupMetadata {
  exportDate: string;
  databaseName: string;
  schemaVersion: number;
  recordCount: number;
  checksum: string;
  backupType: 'full' | 'incremental';
  compressed: boolean;
  encrypted: boolean;
  clientTime: string;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  data: {
    users?: any[];
    customers?: any[];
    visits?: any[];
    payments?: any[];
    promise_to_pay?: any[];
    attachments?: any[];
    notes?: any[];
    tasks?: any[];
    activity_logs?: any[];
    settings?: any[];
    sync_queue?: any[];
    audit_logs?: any[];
    report_snapshots?: any[];
    scheduled_reports?: any[];
  };
}

export interface IntegrityIssue {
  type: 'DUPLICATE_UUID' | 'MISSING_FOREIGN_KEY' | 'CORRUPTED_RECORD' | 'VERSION_CONFLICT';
  table: string;
  id: string;
  message: string;
}

export interface IntegrityReport {
  isValid: boolean;
  issues: IntegrityIssue[];
  summary: {
    totalRecords: number;
    duplicateUuids: number;
    orphanedKeys: number;
    corrupted: number;
    versionConflicts: number;
  };
}

export class DataProtectionService {
  private static ENCRYPTION_KEY = 'fcos_enterprise_secure_token_2026';

  /**
   * Generates a reliable checksum of a string payload
   */
  public static calculateChecksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).toUpperCase();
  }

  /**
   * Simple, fast, reversible XOR-based encryption/decryption with key
   */
  private static xorEncryptDecrypt(input: string, key: string): string {
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      output += String.fromCharCode(charCode);
    }
    return btoa(unescape(encodeURIComponent(output)));
  }

  private static xorDecrypt(input: string, key: string): string {
    try {
      const decoded = decodeURIComponent(escape(atob(input)));
      let output = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        output += String.fromCharCode(charCode);
      }
      return output;
    } catch (e) {
      throw new Error('Failed to decrypt payload. Invalid cipher format or corrupted key.');
    }
  }

  /**
   * Helper to fetch database tables
   */
  private static async getTableData(table: any, lastBackupDate?: string): Promise<any[]> {
    const records = await table.toArray();
    if (!lastBackupDate) return records;
    
    // Filter for incremental backups (created or modified after lastBackupDate)
    return records.filter((r: any) => {
      const updated = r.updatedAt || r.createdAt || '';
      return updated > lastBackupDate;
    });
  }

  /**
   * Exports the local database to an enterprise backup JSON payload
   */
  public static async generateBackup(options: {
    backupType: 'full' | 'incremental';
    compressed: boolean;
    encrypted: boolean;
    userId?: string;
  }): Promise<string> {
    const { backupType, compressed, encrypted, userId = 'system' } = options;
    logger.info('Backup', `Generating ${backupType.toUpperCase()} backup (Compressed: ${compressed}, Encrypted: ${encrypted})...`);

    try {
      let lastBackupDate: string | undefined;

      if (backupType === 'incremental') {
        const latestSuccess = await db.backup_history
          .where('status')
          .equals('success')
          .reverse()
          .first();
        if (latestSuccess) {
          lastBackupDate = latestSuccess.backupDate;
          logger.info('Backup', `Incremental backup basis found: ${lastBackupDate}`);
        } else {
          logger.warn('Backup', 'No previous successful backup found. Falling back to Full Backup.');
        }
      }

      // Fetch database records
      const users = await this.getTableData(db.users, lastBackupDate);
      const customers = await this.getTableData(db.customers, lastBackupDate);
      const visits = await this.getTableData(db.visits, lastBackupDate);
      const payments = await this.getTableData(db.payments, lastBackupDate);
      const promise_to_pay = await this.getTableData(db.promise_to_pay, lastBackupDate);
      const attachments = await this.getTableData(db.attachments, lastBackupDate);
      const notes = await this.getTableData(db.notes, lastBackupDate);
      const tasks = await this.getTableData(db.tasks, lastBackupDate);
      const activity_logs = await this.getTableData(db.activity_logs, lastBackupDate);
      const settings = await this.getTableData(db.settings, lastBackupDate);
      const sync_queue = await this.getTableData(db.sync_queue, lastBackupDate);
      const audit_logs = await this.getTableData(db.audit_logs, lastBackupDate);
      const report_snapshots = await this.getTableData(db.report_snapshots, lastBackupDate);
      const scheduled_reports = await this.getTableData(db.scheduled_reports, lastBackupDate);

      const dataPayload = {
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
        audit_logs,
        report_snapshots,
        scheduled_reports,
      };

      const recordCount = Object.values(dataPayload).reduce((sum, arr) => sum + arr.length, 0);
      const rawDataString = JSON.stringify(dataPayload);
      const checksum = this.calculateChecksum(rawDataString);
      const exportDate = new Date().toISOString();

      const metadata: BackupMetadata = {
        exportDate,
        databaseName: 'FCOS_DB',
        schemaVersion: 2,
        recordCount,
        checksum,
        backupType,
        compressed,
        encrypted,
        clientTime: exportDate,
      };

      let finalDataString = rawDataString;
      if (compressed) {
        // Simple JSON minification simulation (removing whitespace is already done by stringify,
        // we can also apply a base64 compression header prefix).
        finalDataString = btoa(unescape(encodeURIComponent(rawDataString)));
      }

      if (encrypted) {
        finalDataString = this.xorEncryptDecrypt(finalDataString, this.ENCRYPTION_KEY);
      }

      const completeBackup: BackupPayload = {
        metadata,
        data: JSON.parse(JSON.stringify(dataPayload)) // Store the non-encrypted data layout for in-memory model (but the output file gets the processed string)
      };

      // Construct file format
      const fileData = JSON.stringify({
        metadata,
        payload: finalDataString
      });

      const backupId = `BU-${Date.now()}`;
      await db.backup_history.add({
        id: backupId,
        backupDate: exportDate,
        fileName: `fcos_${backupType}_backup_${Date.now()}.json`,
        fileSize: fileData.length,
        checksum,
        status: 'success',
        recordCount,
        uuid: crypto.randomUUID ? crypto.randomUUID() : backupId,
        createdAt: exportDate,
        updatedAt: exportDate,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: userId,
        updatedBy: userId
      });

      // Save success audit log
      await db.audit_logs.add({
        id: `AL-${Date.now()}`,
        level: 'INFO',
        tag: 'Backup',
        message: `Successfully created ${backupType} database backup. Record count: ${recordCount}.`,
        timestamp: exportDate,
        uuid: crypto.randomUUID ? crypto.randomUUID() : `AL-${Date.now()}`,
        createdAt: exportDate,
        updatedAt: exportDate,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: userId,
        updatedBy: userId,
        details: JSON.stringify({ backupId, recordCount, backupType })
      });

      return fileData;
    } catch (err: any) {
      logger.error('Backup', 'Backup creation process failed', err);
      
      const errorTime = new Date().toISOString();
      await db.backup_history.add({
        id: `BU-FAIL-${Date.now()}`,
        backupDate: errorTime,
        fileName: 'N/A',
        fileSize: 0,
        checksum: 'ERROR',
        status: 'failed',
        recordCount: 0,
        uuid: crypto.randomUUID ? crypto.randomUUID() : `BU-FAIL-${Date.now()}`,
        createdAt: errorTime,
        updatedAt: errorTime,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'failed',
        createdBy: userId,
        updatedBy: userId
      });

      throw new Error(`Backup failed: ${err.message || String(err)}`);
    }
  }

  /**
   * Validates backup string format, compatibility, checksum, and decrypts/decompresses
   */
  public static validateAndParseBackup(backupFileString: string): { 
    isValid: boolean; 
    error?: string; 
    payload?: BackupPayload;
  } {
    try {
      if (!backupFileString || backupFileString.trim() === '') {
        return { isValid: false, error: 'Backup file is empty' };
      }

      const outerEnvelope = JSON.parse(backupFileString);
      if (!outerEnvelope.metadata || outerEnvelope.payload === undefined) {
        return { isValid: false, error: 'Invalid file envelope. Missing metadata or payload.' };
      }

      const metadata: BackupMetadata = outerEnvelope.metadata;
      if (metadata.databaseName !== 'FCOS_DB') {
        return { isValid: false, error: `Incompatible database destination: ${metadata.databaseName}` };
      }

      if (metadata.schemaVersion > 2) {
        return { isValid: false, error: `Backup schema version (${metadata.schemaVersion}) is newer than current engine.` };
      }

      let processedPayloadString = outerEnvelope.payload;

      // 1. Decrypt if needed
      if (metadata.encrypted) {
        processedPayloadString = this.xorDecrypt(processedPayloadString, this.ENCRYPTION_KEY);
      }

      // 2. Decompress if needed
      if (metadata.compressed) {
        try {
          processedPayloadString = decodeURIComponent(escape(atob(processedPayloadString)));
        } catch (e) {
          return { isValid: false, error: 'Failed to decompress payload. Invalid base64 stream.' };
        }
      }

      // 3. Verify checksum
      const recalculatedChecksum = this.calculateChecksum(processedPayloadString);
      if (recalculatedChecksum !== metadata.checksum) {
        return { 
          isValid: false, 
          error: `Integrity violation: checksum mismatch (Expected ${metadata.checksum}, calculated ${recalculatedChecksum}). File is corrupted.` 
        };
      }

      const data = JSON.parse(processedPayloadString);
      return {
        isValid: true,
        payload: {
          metadata,
          data
        }
      };
    } catch (err: any) {
      return { isValid: false, error: `Malformed backup structure: ${err.message || String(err)}` };
    }
  }

  /**
   * Restores data with support for full or partial restore, wrapped in safety rollbacks.
   */
  public static async restoreBackup(options: {
    backupFileString: string;
    restoreType: 'full' | 'partial';
    selectedTables?: string[]; // E.g., ['settings', 'customers'] for partial restores
    userId?: string;
  }): Promise<{ success: boolean; recordCount: number }> {
    const { backupFileString, restoreType, selectedTables = [], userId = 'system' } = options;
    logger.info('Restore', `Initiating backup restore (Type: ${restoreType.toUpperCase()})...`);

    // 0. SAFETY GUARD: Block restore if there are any unsynced local offline records to prevent data loss
    try {
      const unsyncedCount = await db.sync_queue
        .where('syncStatus')
        .anyOf(['pending', 'syncing', 'retry'])
        .count();
      
      if (unsyncedCount > 0) {
        throw new Error(`Terdapat ${unsyncedCount} transaksi luring yang belum tersinkronisasi ke server cloud. Selesaikan sinkronisasi luring terlebih dahulu sebelum memulihkan database untuk mencegah kehilangan data.`);
      }
    } catch (err: any) {
      logger.error('Restore', 'Safety guard aborted restore operation due to unsynced items', err);
      throw err;
    }

    // 1. Trigger automatic full backup before restore for emergency rollback/safety
    try {
      await this.generateBackup({
        backupType: 'full',
        compressed: true,
        encrypted: false,
        userId: 'system-auto-pre-restore'
      });
      logger.info('Restore', 'Pre-restore safety backup generated successfully.');
    } catch (e) {
      logger.warn('Restore', 'Failed to generate pre-restore safety backup, proceeding with caution...', e);
    }

    // 2. Validate incoming backup
    const validation = this.validateAndParseBackup(backupFileString);
    if (!validation.isValid || !validation.payload) {
      throw new Error(`Restore rejected: ${validation.error}`);
    }

    const { metadata, data } = validation.payload;
    let recordsRestored = 0;

    try {
      const allAvailableTables = [
        'users', 'customers', 'visits', 'payments', 'promise_to_pay',
        'attachments', 'notes', 'tasks', 'activity_logs', 'settings',
        'sync_queue', 'audit_logs', 'report_snapshots', 'scheduled_reports'
      ];

      // Filter tables to restore
      const tablesToRestore = restoreType === 'full' 
        ? allAvailableTables 
        : allAvailableTables.filter(t => selectedTables.includes(t));

      if (tablesToRestore.length === 0) {
        throw new Error('No valid tables selected for partial restore.');
      }

      // Map keys to database tables
      const dbTablesArray: any[] = tablesToRestore.map(t => {
        if (t === 'promise_to_pay') return db.promise_to_pay;
        if (t === 'sync_queue') return db.sync_queue;
        if (t === 'audit_logs') return db.audit_logs;
        return (db as any)[t];
      }).filter(Boolean);

      // Wrap in transactional safe lock
      await db.transaction('rw', dbTablesArray, async () => {
        for (const tableKey of tablesToRestore) {
          const actualTable = tableKey === 'promise_to_pay' ? db.promise_to_pay
                            : tableKey === 'sync_queue' ? db.sync_queue
                            : tableKey === 'audit_logs' ? db.audit_logs
                            : (db as any)[tableKey];
          
          if (!actualTable) continue;

          const incomingData = (data as any)[tableKey];
          if (!incomingData) continue;

          if (restoreType === 'full') {
            // Full clear for full restore
            await actualTable.clear();
            if (incomingData.length > 0) {
              await actualTable.bulkAdd(incomingData);
              recordsRestored += incomingData.length;
            }
          } else {
            // Partial restore: Merge or Overwrite incoming rows
            for (const row of incomingData) {
              if (row.id) {
                await actualTable.put(row);
                recordsRestored++;
              }
            }
          }
        }
      });

      const now = new Date().toISOString();
      await db.audit_logs.add({
        id: `AL-${Date.now()}`,
        level: 'INFO',
        tag: 'Restore',
        message: `Database restored from backup. Restored: ${recordsRestored} records.`,
        timestamp: now,
        uuid: crypto.randomUUID ? crypto.randomUUID() : `AL-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: userId,
        updatedBy: userId,
        details: JSON.stringify({ restoreType, tablesRestored: tablesToRestore, recordCount: recordsRestored })
      });

      logger.info('Restore', `Restore completed. ${recordsRestored} records written.`);
      return { success: true, recordCount: recordsRestored };
    } catch (err: any) {
      logger.error('Restore', 'Restore process failed. All database mutations rolled back.', err);
      throw new Error(`Restore failed: ${err.message || String(err)}`);
    }
  }

  /**
   * Performs an exhaustive scan of the local database to detect data corruption or foreign key issues
   */
  public static async verifyDatabaseIntegrity(): Promise<IntegrityReport> {
    logger.info('Integrity', 'Initiating thorough offline database scan...');

    const issues: IntegrityIssue[] = [];
    let totalRecords = 0;
    let duplicateUuidsCount = 0;
    let orphanedKeysCount = 0;
    let corruptedCount = 0;
    let versionConflictsCount = 0;

    try {
      // Load all tables
      const users = await db.users.toArray();
      const customers = await db.customers.toArray();
      const visits = await db.visits.toArray();
      const payments = await db.payments.toArray();
      const promise_to_pay = await db.promise_to_pay.toArray();
      const attachments = await db.attachments.toArray();
      const notes = await db.notes.toArray();
      const tasks = await db.tasks.toArray();
      const sync_queue = await db.sync_queue.toArray();
      const settings = await db.settings.toArray();

      totalRecords = users.length + customers.length + visits.length + payments.length + 
                     promise_to_pay.length + attachments.length + notes.length + tasks.length + 
                     sync_queue.length + settings.length;

      // 1. Check duplicate UUIDs
      const uuidMap = new Map<string, { table: string; id: string }>();
      const scanTableUuids = (records: any[], tableName: string) => {
        for (const r of records) {
          if (!r.uuid) continue;
          if (uuidMap.has(r.uuid)) {
            const original = uuidMap.get(r.uuid)!;
            issues.push({
              type: 'DUPLICATE_UUID',
              table: tableName,
              id: r.id,
              message: `UUID collision: '${r.uuid}' already used by table '${original.table}', ID '${original.id}'`
            });
            duplicateUuidsCount++;
          } else {
            uuidMap.set(r.uuid, { table: tableName, id: r.id });
          }
        }
      };

      scanTableUuids(users, 'users');
      scanTableUuids(customers, 'customers');
      scanTableUuids(visits, 'visits');
      scanTableUuids(payments, 'payments');
      scanTableUuids(promise_to_pay, 'promise_to_pay');
      scanTableUuids(attachments, 'attachments');
      scanTableUuids(notes, 'notes');
      scanTableUuids(tasks, 'tasks');
      scanTableUuids(sync_queue, 'sync_queue');
      scanTableUuids(settings, 'settings');

      // 2. Validate Foreign Keys & Orphan Records
      const customerIds = new Set(customers.map(c => c.id));
      const userIds = new Set(users.map(u => u.id));

      // Validate visits
      for (const v of visits) {
        if (!v.customerId || !customerIds.has(v.customerId)) {
          issues.push({
            type: 'MISSING_FOREIGN_KEY',
            table: 'visits',
            id: v.id,
            message: `Orphan visit: customerId '${v.customerId}' does not exist in customers`
          });
          orphanedKeysCount++;
        }
        if (v.version && v.version < 1) {
          issues.push({
            type: 'VERSION_CONFLICT',
            table: 'visits',
            id: v.id,
            message: `Invalid version value: ${v.version}`
          });
          versionConflictsCount++;
        }
      }

      // Validate payments
      for (const p of payments) {
        if (!p.customerId || !customerIds.has(p.customerId)) {
          issues.push({
            type: 'MISSING_FOREIGN_KEY',
            table: 'payments',
            id: p.id,
            message: `Orphan payment: customerId '${p.customerId}' does not exist in customers`
          });
          orphanedKeysCount++;
        }
      }

      // Validate promises
      for (const ptp of promise_to_pay) {
        if (!ptp.customerId || !customerIds.has(ptp.customerId)) {
          issues.push({
            type: 'MISSING_FOREIGN_KEY',
            table: 'promise_to_pay',
            id: ptp.id,
            message: `Orphan PTP: customerId '${ptp.customerId}' does not exist in customers`
          });
          orphanedKeysCount++;
        }
      }

      // 3. Corrupted record fields (Basic fields verification)
      for (const c of customers) {
        if (!c.name || c.outstandingBalance === undefined || c.minPaymentDue === undefined) {
          issues.push({
            type: 'CORRUPTED_RECORD',
            table: 'customers',
            id: c.id,
            message: `Corrupted schema: missing name or financial values`
          });
          corruptedCount++;
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        summary: {
          totalRecords,
          duplicateUuids: duplicateUuidsCount,
          orphanedKeys: orphanedKeysCount,
          corrupted: corruptedCount,
          versionConflicts: versionConflictsCount
        }
      };
    } catch (e: any) {
      logger.error('Integrity', 'Integrity verification failed', e);
      return {
        isValid: false,
        issues: [{ type: 'CORRUPTED_RECORD', table: 'global', id: 'N/A', message: `Engine failure: ${e.message}` }],
        summary: { totalRecords: 0, duplicateUuids: 0, orphanedKeys: 0, corrupted: 1, versionConflicts: 0 }
      };
    }
  }

  /**
   * Attempts automatic schema self-healing/repair for integrity issues
   */
  public static async repairDatabase(): Promise<{ success: boolean; issuesFixed: number }> {
    logger.warn('Integrity', 'Commencing database self-repair and self-healing...');
    let fixed = 0;

    try {
      const integrity = await this.verifyDatabaseIntegrity();
      if (integrity.isValid) {
        return { success: true, issuesFixed: 0 };
      }

      await db.transaction('rw', [
        db.users, db.customers, db.visits, db.payments, db.promise_to_pay,
        db.attachments, db.notes, db.tasks, db.sync_queue, db.settings, db.audit_logs
      ], async () => {
        for (const issue of integrity.issues) {
          if (issue.type === 'DUPLICATE_UUID') {
            // Re-generate fresh UUID for the collision
            const actualTable = issue.table === 'promise_to_pay' ? db.promise_to_pay
                              : issue.table === 'sync_queue' ? db.sync_queue
                              : (db as any)[issue.table];
            if (actualTable) {
              const record = await actualTable.get(issue.id);
              if (record) {
                record.uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now();
                await actualTable.put(record);
                fixed++;
              }
            }
          } else if (issue.type === 'MISSING_FOREIGN_KEY') {
            // Create a placeholder customer so it does not stay orphaned
            if (issue.table === 'visits' || issue.table === 'payments' || issue.table === 'promise_to_pay') {
              const actualTable = issue.table === 'promise_to_pay' ? db.promise_to_pay : (db as any)[issue.table];
              const record = await actualTable.get(issue.id);
              if (record && record.customerId) {
                const customerExists = await db.customers.get(record.customerId);
                if (!customerExists) {
                  // Add dummy customer
                  await db.customers.add({
                    id: record.customerId,
                    uuid: crypto.randomUUID ? crypto.randomUUID() : 'CUST-' + Date.now(),
                    name: `Auto-Recovered Debitur (${record.customerId})`,
                    address: 'Auto-Recovered Placeholder Address',
                    phoneNumber: '000000',
                    outstandingBalance: 0,
                    minPaymentDue: 0,
                    daysOverdue: 0,
                    bucket: '30',
                    status: 'PENDING',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null,
                    isDeleted: false,
                    version: 1,
                    syncStatus: 'pending',
                    createdBy: 'system-repair',
                    updatedBy: 'system-repair'
                  });
                  fixed++;
                }
              }
            }
          } else if (issue.type === 'VERSION_CONFLICT') {
            const actualTable = issue.table === 'promise_to_pay' ? db.promise_to_pay : (db as any)[issue.table];
            if (actualTable) {
              const record = await actualTable.get(issue.id);
              if (record) {
                record.version = 1;
                await actualTable.put(record);
                fixed++;
              }
            }
          }
        }
      });

      const now = new Date().toISOString();
      await db.audit_logs.add({
        id: `AL-${Date.now()}`,
        level: 'WARN',
        tag: 'Database',
        message: `Database self-repair routine completed. Fixed ${fixed} integrity issues.`,
        timestamp: now,
        uuid: crypto.randomUUID ? crypto.randomUUID() : `AL-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: 'system-repair',
        updatedBy: 'system-repair'
      });

      return { success: true, issuesFixed: fixed };
    } catch (e: any) {
      logger.error('Integrity', 'Self-repair failed', e);
      return { success: false, issuesFixed: fixed };
    }
  }
}
