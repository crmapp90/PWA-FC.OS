import { z } from 'zod';
import { BaseRepository } from './BaseRepository';
import { db } from '../database';
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
  AuditLog
} from '../../types';

// ==========================================
// ZOD SCHEMAS FOR STRICT IN-DB VALIDATION
// ==========================================

export const userValidationSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email format'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'supervisor', 'collector']),
  branch: z.string().min(1, 'Branch is required'),
  region: z.string().min(1, 'Region is required'),
});

export const customerValidationSchema = z.object({
  id: z.string().min(1, 'Customer ID is required'),
  name: z.string().min(1, 'Customer name is required'),
  address: z.string().min(1, 'Customer address is required'),
  phoneNumber: z.string().min(5, 'Valid phone number is required'),
  outstandingBalance: z.number().nonnegative('Outstanding balance cannot be negative'),
  minPaymentDue: z.number().nonnegative('Minimum payment due cannot be negative'),
  daysOverdue: z.number().int().nonnegative('Days overdue must be non-negative integer'),
  bucket: z.enum(['30', '60', '90', '90+']),
  status: z.enum(['PENDING', 'VISITED', 'PAID', 'PROMISED']),
  // Sprint 4 Customer Portfolio fields
  contractNumber: z.string().optional(),
  alternativePhone: z.string().optional(),
  area: z.string().optional(),
  branch: z.string().optional(),
  priorityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  installmentAmount: z.number().nonnegative().optional(),
  dueDate: z.string().optional(),
  lastPaymentDate: z.string().optional(),
  lastContactDate: z.string().optional(),
  assignedCollectorId: z.string().optional(),
});

export const visitValidationSchema = z.object({
  id: z.string().min(1, 'Visit ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  collectorId: z.string().min(1, 'Collector ID is required'),
  visitDate: z.string().min(1, 'Visit date is required'),
  status: z.enum(['CONTACT', 'NO_CONTACT', 'BUSINESS_CLOSED', 'ADDRESS_NOT_FOUND']),
  notes: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nonnegative(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.number().optional(),
  addressConfirmation: z.enum(['CONFIRMED', 'UNCONFIRMED', 'NOT_FOUND']).optional(),
  visitResult: z.enum([
    'CUSTOMER_MET',
    'CUSTOMER_NOT_HOME',
    'ADDRESS_UNKNOWN',
    'MOVED',
    'WRONG_ADDRESS',
    'PROMISE_TO_PAY',
    'PAID',
    'PARTIAL_PAYMENT',
    'REFUSED',
    'CANNOT_CONTACT',
    'OTHER'
  ]).optional(),
  visitStatus: z.enum(['ASSIGNED', 'READY', 'STARTED', 'COMPLETED', 'SAVED_OFFLINE']).optional(),
  customerCondition: z.string().optional(),
  collectorNotes: z.string().optional(),
  nextAction: z.enum(['REVISIT', 'CALL', 'REMINDER', 'ESCALATION', 'LEGAL_REVIEW', 'CLOSE_CASE', 'WAIT']).optional(),
  followUpDate: z.string().optional(),
  attachmentCount: z.number().optional(),
  photoCount: z.number().optional(),
  voiceCount: z.number().optional(),
  signatureStatus: z.enum(['SIGNED', 'UNSIGNED']).optional(),
  offlineStatus: z.enum(['OFFLINE', 'ONLINE']).optional(),
  photoUrls: z.array(z.string()).optional(),
  voiceUrl: z.string().optional(),
  signatureBase64: z.string().optional(),
});

export const paymentValidationSchema = z.object({
  id: z.string().min(1, 'Payment ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  collectorId: z.string().min(1, 'Collector ID is required'),
  amount: z.number().positive('Payment amount must be positive'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS', 'OTHER']),
  receiptNumber: z.string().min(1, 'Receipt number is required'),
  signatureBase64: z.string().optional(),
  photoUrl: z.string().optional(),
  paymentDate: z.string().min(1, 'Payment date is required'),

  // Sprint 7 payment fields
  visitId: z.string().optional(),
  commitmentId: z.string().optional(),
  paymentTime: z.string().optional(),
  remainingOutstanding: z.number().optional(),
  installmentNumber: z.number().optional(),
  referenceNumber: z.string().optional(),
  evidenceCount: z.number().optional(),
  collectorNotes: z.string().optional(),
  customerNotes: z.string().optional(),
  status: z.enum(['Draft', 'Recorded', 'Verified', 'Cancelled', 'Pending Sync']).optional(),
});

export const promiseToPayValidationSchema = z.object({
  id: z.string().min(1, 'PTP ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  collectorId: z.string().min(1, 'Collector ID is required'),
  amount: z.number().positive('Promise to pay amount must be positive'),
  promiseDate: z.string().min(1, 'Promise date is required'),
  notes: z.string(),

  // Rich Commitment Fields
  visitId: z.string().optional(),
  commitmentDate: z.string().optional(),
  dueDate: z.string().optional(),
  promisedAmount: z.number().optional(),
  expectedPaymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']).optional(),
  status: z.enum(['Draft', 'Active', 'Due Today', 'Overdue', 'Completed', 'Broken', 'Cancelled']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  reminderDate: z.string().optional(),
  reminderTime: z.string().optional(),
  followUpDate: z.string().optional(),
  riskLevel: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  reason: z.string().optional(),
  collectorNotes: z.string().optional(),
  customerNotes: z.string().optional(),
});

export const attachmentValidationSchema = z.object({
  id: z.string().min(1, 'Attachment ID is required'),
  entityType: z.enum(['visit', 'payment', 'customer']),
  entityId: z.string().min(1, 'Entity reference ID is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.string().min(1, 'File type is required'),
  fileSize: z.number().positive(),
  fileUrlOrBase64: z.string().min(1, 'File payload is required'),
});

export const noteValidationSchema = z.object({
  id: z.string().min(1, 'Note ID is required'),
  entityType: z.enum(['customer', 'visit', 'payment']),
  entityId: z.string().min(1, 'Entity reference ID is required'),
  content: z.string().min(1, 'Note content is required'),
});

export const taskValidationSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  title: z.string().min(1, 'Task title is required'),
  description: z.string(),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.enum(['pending', 'completed', 'cancelled']),
  assignedTo: z.string().min(1, 'Assigned user is required'),
});

export const settingValidationSchema = z.object({
  id: z.string().min(1, 'Setting ID is required'),
  key: z.string().min(1, 'Setting key is required'),
  value: z.string(),
});

export const syncQueueValidationSchema = z.object({
  id: z.string().min(1, 'Sync Queue ID is required'),
  entityType: z.enum(['customer', 'visit', 'payment', 'promise_to_pay']),
  entityId: z.string().min(1, 'Entity ID is required'),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  payload: z.record(z.string(), z.any()),
  attempts: z.number().int().nonnegative(),
});

export const backupHistoryValidationSchema = z.object({
  id: z.string().min(1, 'Backup ID is required'),
  backupDate: z.string().min(1, 'Backup date is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().nonnegative(),
  checksum: z.string().min(1, 'Checksum is required'),
  status: z.enum(['success', 'failed']),
  recordCount: z.number().int().nonnegative(),
});

export const auditLogValidationSchema = z.object({
  id: z.string().min(1, 'Audit Log ID is required'),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
  tag: z.string().min(1, 'Tag is required'),
  message: z.string().min(1, 'Message is required'),
  timestamp: z.string().min(1, 'Timestamp is required'),
});

// ==========================================
// CONCRETE REPOSITORY CLASSES
// ==========================================

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(db.users, 'User', userValidationSchema);
  }

  async findByUsername(username: string): Promise<User | null> {
    const results = await this.findAll({
      filters: { equals: { username } }
    });
    return results.length > 0 ? results[0] : null;
  }
}

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() {
    super(db.customers, 'Customer', customerValidationSchema);
  }

  async findByBucket(bucket: '30' | '60' | '90' | '90+'): Promise<Customer[]> {
    return this.findAll({
      filters: { equals: { bucket } }
    });
  }

  async searchByNameOrId(term: string): Promise<Customer[]> {
    return this.findAll({
      search: {
        query: term,
        fields: ['id', 'name', 'address']
      }
    });
  }
}

export class VisitRepository extends BaseRepository<Visit> {
  constructor() {
    super(db.visits, 'Visit', visitValidationSchema);
  }

  async findByCustomer(customerId: string): Promise<Visit[]> {
    return this.findAll({
      filters: { equals: { customerId } },
      sort: { field: 'visitDate', order: 'desc' }
    });
  }
}

export class PaymentRepository extends BaseRepository<Payment> {
  constructor() {
    super(db.payments, 'Payment', paymentValidationSchema);
  }

  async findByCustomer(customerId: string): Promise<Payment[]> {
    return this.findAll({
      filters: { equals: { customerId } },
      sort: { field: 'paymentDate', order: 'desc' }
    });
  }
}

export class PromiseToPayRepository extends BaseRepository<PromiseToPay> {
  constructor() {
    super(db.promiseToPay, 'PromiseToPay', promiseToPayValidationSchema);
  }

  async findActivePromises(customerId?: string): Promise<PromiseToPay[]> {
    const filters: any = {};
    if (customerId) {
      filters.equals = { customerId };
    }
    return this.findAll({
      filters,
      sort: { field: 'promiseDate', order: 'asc' }
    });
  }
}

export class AttachmentRepository extends BaseRepository<Attachment> {
  constructor() {
    super(db.attachments, 'Attachment', attachmentValidationSchema);
  }

  async findForEntity(entityType: 'visit' | 'payment' | 'customer', entityId: string): Promise<Attachment[]> {
    return this.findAll({
      filters: { equals: { entityType, entityId } }
    });
  }
}

export class NoteRepository extends BaseRepository<Note> {
  constructor() {
    super(db.notes, 'Note', noteValidationSchema);
  }

  async findForEntity(entityType: 'customer' | 'visit' | 'payment', entityId: string): Promise<Note[]> {
    return this.findAll({
      filters: { equals: { entityType, entityId } },
      sort: { field: 'createdAt', order: 'desc' }
    });
  }
}

export class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super(db.tasks, 'Task', taskValidationSchema);
  }

  async findPendingTasks(assignedTo: string): Promise<Task[]> {
    return this.findAll({
      filters: { equals: { assignedTo, status: 'pending' } },
      sort: { field: 'dueDate', order: 'asc' }
    });
  }
}

export class ActivityLogRepository extends BaseRepository<ActivityLog> {
  constructor() {
    // Audit log has no schema for flexible details
    super(db.activity_logs, 'ActivityLog');
  }

  async getRecentLogs(limit = 50): Promise<ActivityLog[]> {
    return this.findAll({
      sort: { field: 'createdAt', order: 'desc' },
      page: 1,
      pageSize: limit
    });
  }
}

export class SettingRepository extends BaseRepository<Setting> {
  constructor() {
    super(db.settings, 'Setting', settingValidationSchema);
  }

  async getValue(key: string, defaultValue = ''): Promise<string> {
    const results = await this.findAll({
      filters: { equals: { key } }
    });
    return results.length > 0 ? results[0].value : defaultValue;
  }

  async setValue(key: string, value: string, userId = 'system'): Promise<void> {
    const results = await this.findAll({
      filters: { equals: { key } }
    });
    if (results.length > 0) {
      await this.update(results[0].id, { value }, userId);
    } else {
      await this.insert({ id: key, key, value }, userId);
    }
  }
}

export class SyncQueueRepository extends BaseRepository<SyncQueueItem> {
  constructor() {
    super(db.syncQueue, 'SyncQueueItem', syncQueueValidationSchema);
  }

  async getPendingQueue(): Promise<SyncQueueItem[]> {
    return this.findAll({
      filters: { equals: { syncStatus: 'pending' } },
      sort: { field: 'createdAt', order: 'asc' }
    });
  }

  async getFailedQueue(): Promise<SyncQueueItem[]> {
    return this.findAll({
      filters: { equals: { syncStatus: 'failed' } },
      sort: { field: 'createdAt', order: 'asc' }
    });
  }
}

export class BackupHistoryRepository extends BaseRepository<BackupHistory> {
  constructor() {
    super(db.backup_history, 'BackupHistory', backupHistoryValidationSchema);
  }

  async getLatestBackup(): Promise<BackupHistory | null> {
    const results = await this.findAll({
      filters: { equals: { status: 'success' } },
      sort: { field: 'backupDate', order: 'desc' },
      page: 1,
      pageSize: 1
    });
    return results.length > 0 ? results[0] : null;
  }
}

export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor() {
    super(db.audit_logs, 'AuditLog', auditLogValidationSchema);
  }

  async getLogsByLevel(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'): Promise<AuditLog[]> {
    return this.findAll({
      filters: { equals: { level } },
      sort: { field: 'timestamp', order: 'desc' }
    });
  }
}

// ==========================================
// CENTRAL EXPORTED REPOSITORY INSTANCES
// ==========================================

export const userRepository = new UserRepository();
export const customerRepository = new CustomerRepository();
export const visitRepository = new VisitRepository();
export const paymentRepository = new PaymentRepository();
export const promiseToPayRepository = new PromiseToPayRepository();
export const attachmentRepository = new AttachmentRepository();
export const noteRepository = new NoteRepository();
export const taskRepository = new TaskRepository();
export const activityLogRepository = new ActivityLogRepository();
export const settingRepository = new SettingRepository();
export const syncQueueRepository = new SyncQueueRepository();
export const backupHistoryRepository = new BackupHistoryRepository();
export const auditLogRepository = new AuditLogRepository();
