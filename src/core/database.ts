import Dexie, { Table } from 'dexie';
import { 
  User, 
  Customer, 
  Visit, 
  Payment, 
  PromiseToPay, 
  Attachment, 
  Note, 
  Task, 
  ActivityLog, 
  Setting, 
  SyncQueueItem, 
  BackupHistory, 
  AuditLog,
  Collector
} from '../types';
import { ReportSnapshot, ScheduledReportTask } from '../types/reports';
import { logger } from './logger';

/**
 * FC.OS Centralized Dexie IndexedDB Database - FCOS_DB
 * Permanent data foundation for all offline operations.
 */
export class FCOSDatabase extends Dexie {
  public users!: Table<User, string>;
  public collectors!: Table<Collector, string>; // Kept for Sprint 1 backward compatibility
  public customers!: Table<Customer, string>;
  public visits!: Table<Visit, string>;
  public payments!: Table<Payment, string>;
  public promise_to_pay!: Table<PromiseToPay, string>;
  public attachments!: Table<Attachment, string>;
  public notes!: Table<Note, string>;
  public tasks!: Table<Task, string>;
  public activity_logs!: Table<ActivityLog, string>;
  public settings!: Table<Setting, string>;
  public sync_queue!: Table<SyncQueueItem, string>;
  public backup_history!: Table<BackupHistory, string>;
  public audit_logs!: Table<AuditLog, string>;
  public report_snapshots!: Table<ReportSnapshot, string>;
  public scheduled_reports!: Table<ScheduledReportTask, string>;

  constructor() {
    super('FCOS_DB');
    
    // Schema definition for Version 1 of FCOS_DB
    // We index properties that are vital for sorting, filtering, searching, or status checks.
    this.version(1).stores({
      users: 'id, uuid, username, email, isDeleted, syncStatus',
      collectors: 'id, username',
      customers: 'id, uuid, name, status, daysOverdue, isDeleted, syncStatus',
      visits: 'id, uuid, customerId, collectorId, visitDate, isDeleted, syncStatus',
      payments: 'id, uuid, customerId, collectorId, paymentDate, isDeleted, syncStatus',
      promise_to_pay: 'id, uuid, customerId, collectorId, promiseDate, isDeleted, syncStatus',
      attachments: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      notes: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      tasks: 'id, uuid, status, assignedTo, isDeleted, syncStatus',
      activity_logs: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      settings: 'id, uuid, key, isDeleted, syncStatus',
      sync_queue: 'id, uuid, entityType, entityId, action, isDeleted, syncStatus',
      backup_history: 'id, uuid, status, backupDate, isDeleted, syncStatus',
      audit_logs: 'id, uuid, level, tag, timestamp, isDeleted, syncStatus',
    });

    // Version 2: Adds Operational Report Snapshots & Scheduled Reports tables
    this.version(2).stores({
      users: 'id, uuid, username, email, isDeleted, syncStatus',
      collectors: 'id, username',
      customers: 'id, uuid, name, status, daysOverdue, isDeleted, syncStatus',
      visits: 'id, uuid, customerId, collectorId, visitDate, isDeleted, syncStatus',
      payments: 'id, uuid, customerId, collectorId, paymentDate, isDeleted, syncStatus',
      promise_to_pay: 'id, uuid, customerId, collectorId, promiseDate, isDeleted, syncStatus',
      attachments: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      notes: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      tasks: 'id, uuid, status, assignedTo, isDeleted, syncStatus',
      activity_logs: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      settings: 'id, uuid, key, isDeleted, syncStatus',
      sync_queue: 'id, uuid, entityType, entityId, action, isDeleted, syncStatus',
      backup_history: 'id, uuid, status, backupDate, isDeleted, syncStatus',
      audit_logs: 'id, uuid, level, tag, timestamp, isDeleted, syncStatus',
      report_snapshots: 'id, uuid, generatedTime, reportType, isDeleted, syncStatus',
      scheduled_reports: 'id, uuid, reportType, isActive, isDeleted, syncStatus',
    });

    // Version 3: Upgrades backup_history schema to include backupDate index for existing databases
    this.version(3).stores({
      users: 'id, uuid, username, email, isDeleted, syncStatus',
      collectors: 'id, username',
      customers: 'id, uuid, name, status, daysOverdue, isDeleted, syncStatus',
      visits: 'id, uuid, customerId, collectorId, visitDate, isDeleted, syncStatus',
      payments: 'id, uuid, customerId, collectorId, paymentDate, isDeleted, syncStatus',
      promise_to_pay: 'id, uuid, customerId, collectorId, promiseDate, isDeleted, syncStatus',
      attachments: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      notes: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      tasks: 'id, uuid, status, assignedTo, isDeleted, syncStatus',
      activity_logs: 'id, uuid, entityType, entityId, isDeleted, syncStatus',
      settings: 'id, uuid, key, isDeleted, syncStatus',
      sync_queue: 'id, uuid, entityType, entityId, action, isDeleted, syncStatus',
      backup_history: 'id, uuid, status, backupDate, isDeleted, syncStatus',
      audit_logs: 'id, uuid, level, tag, timestamp, isDeleted, syncStatus',
      report_snapshots: 'id, uuid, generatedTime, reportType, isDeleted, syncStatus',
      scheduled_reports: 'id, uuid, reportType, isActive, isDeleted, syncStatus',
    });
  }

  // Backward compatibility getters to prevent breaking Sprint 1 screens & store
  get promiseToPay(): Table<PromiseToPay, string> {
    return this.table('promise_to_pay');
  }

  get syncQueue(): Table<any, any> {
    return this.table('sync_queue');
  }

  get logs(): Table<any, any> {
    return this.table('audit_logs');
  }

  /**
   * Resets database safely in case of corruption
   */
  async safeReset() {
    try {
      logger.warn('Database', 'Performing database safe reset...');
      await this.delete();
      await this.open();
      logger.info('Database', 'Database reset and reopened successfully.');
    } catch (err) {
      logger.error('Database', 'Failed to safely reset database', err);
      throw err;
    }
  }
}

export const db = new FCOSDatabase();

// --- DATABASE HELPER UTILITIES ---

/**
 * Generates a standard BaseEntity template filled with robust defaults
 */
export function createBaseEntityFields(createdBy = 'system'): {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
  version: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  createdBy: string;
  updatedBy: string;
} {
  const now = new Date().toISOString();
  return {
    uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    isDeleted: false,
    version: 1,
    syncStatus: 'pending',
    createdBy,
    updatedBy: createdBy
  };
}

/**
 * Seeds initial config/collector data for the Field Collector app if empty,
 * and ensures any old mockup data is fully cleaned from IndexedDB.
 */
export async function seedDatabaseIfEmpty() {
  const collectorCount = await db.collectors.count();

  // Generate a stable seed ID from device — not hardcoded
  const seedCollectorId = localStorage.getItem('fcos_collector_id') || `COL-${Math.floor(1000 + Math.random() * 9000)}`;

  if (collectorCount === 0) {
    const activeCollector: Collector = {
      id: seedCollectorId,
      username: 'collector',
      fullName: 'Field Collector',
      region: 'Jakarta',
      branch: 'Kantor Pusat',
      targetAmount: 50000000,
      collectedAmount: 0,
      lastLoginAt: new Date().toISOString(),
    };
    await db.collectors.add(activeCollector);

    const userFields = createBaseEntityFields('system');
    await db.users.add({
      id: seedCollectorId,
      ...userFields,
      username: 'collector',
      email: '',
      fullName: 'Field Collector',
      role: 'collector',
      branch: 'KCP Fatmawati',
      region: 'Jakarta Selatan',
      lastLoginAt: userFields.createdAt
    });
  }

  // Define mock customer IDs to be purged
  const mockIds = ['ACC-100234', 'ACC-104921', 'ACC-108711', 'ACC-102384', 'ACC-109921'];
  
  try {
    // Delete specific mock customer records
    for (const id of mockIds) {
      await db.customers.delete(id);
    }
    // Delete any visits, payments, promise to pay records, notes, attachments, or activity logs associated with mock IDs
    await db.visits.where('customerId').anyOf(mockIds).delete();
    await db.payments.where('customerId').anyOf(mockIds).delete();
    await db.promise_to_pay.where('customerId').anyOf(mockIds).delete();
    await db.notes.where('entityId').anyOf(mockIds).delete();
    await db.attachments.where('entityId').anyOf(mockIds).delete();
    await db.activity_logs.where('entityId').anyOf(mockIds).delete();
  } catch (error) {
    logger.error('Database', 'Error purging mockup data:', error);
  }
}
