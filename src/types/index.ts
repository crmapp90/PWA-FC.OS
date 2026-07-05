/**
 * FC.OS - Types & Models
 * Permanent Domain Core Types for Field Collection Operating System
 */

// --- BASE REPOSITORY RESULT WRAPPERS ---

export interface Failure {
  code: string;
  message: string;
  details?: unknown;
}

export type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: Failure };

// --- GENERAL SYNC DEFINITIONS ---

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

// --- BASE ENTITY STANDARD ---
export interface BaseEntity {
  id: string; // Unified unique identifier
  uuid: string; // Globally unique identifier for cloud syncing
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string; // ISO 8601 Timestamp
  deletedAt: string | null; // ISO 8601 Timestamp when soft-deleted
  isDeleted: boolean; // Soft delete flag
  version: number; // For optimistic locking / conflict resolution
  syncStatus: SyncStatus; // Synchronization state
  createdBy: string; // User ID / System
  updatedBy: string; // User ID / System
}

// --- DOMAIN ENTITIES ---

export interface User extends BaseEntity {
  username: string;
  email: string;
  fullName: string;
  role: 'admin' | 'supervisor' | 'collector';
  branch: string;
  region: string;
  lastLoginAt: string;
}

// To maintain backward compatibility with Sprint 1 code:
export interface Collector {
  id: string;
  username: string;
  fullName: string;
  region: string;
  branch: string;
  targetAmount: number;
  dailyTargetAmount?: number;
  collectedAmount: number;
  lastLoginAt: string;
}

export interface Customer extends BaseEntity {
  name: string;
  address: string;
  phoneNumber: string;
  latitude?: number;
  longitude?: number;
  outstandingBalance: number;
  minPaymentDue: number;
  daysOverdue: number;
  bucket: '30' | '60' | '90' | '90+';
  status: 'PENDING' | 'VISITED' | 'PAID' | 'PROMISED';
  lastVisitDate?: string;
  notes?: string;
  
  // Sprint 4 Customer Portfolio fields
  contractNumber?: string;
  alternativePhone?: string;
  area?: string;
  branch?: string;
  priorityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  consecutiveMissedVisits?: number;   // BR-06: counter tidak ketemu berturut
  needsContactUpdate?: boolean;       // BR-06: flag wajib update kontak setelah 3x tidak ketemu
  installmentAmount?: number;
  dueDate?: string;
  lastPaymentDate?: string;
  lastContactDate?: string;
  assignedCollectorId?: string;
}

export interface Visit extends BaseEntity {
  customerId: string;
  collectorId: string;
  visitDate: string;
  status: 'CONTACT' | 'NO_CONTACT' | 'BUSINESS_CLOSED' | 'ADDRESS_NOT_FOUND';
  notes: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  photoUrl?: string; // Stored locally as base64 or remote URL

  // Sprint 5 Field Visit Execution Engine fields
  startTime?: string;
  endTime?: string;
  duration?: number; // duration in seconds
  addressConfirmation?: 'CONFIRMED' | 'UNCONFIRMED' | 'NOT_FOUND';
  visitResult?: 'CUSTOMER_MET' | 'CUSTOMER_NOT_HOME' | 'ADDRESS_UNKNOWN' | 'MOVED' | 'WRONG_ADDRESS' | 'PROMISE_TO_PAY' | 'PAID' | 'PARTIAL_PAYMENT' | 'REFUSED' | 'CANNOT_CONTACT' | 'OTHER';
  visitStatus?: 'ASSIGNED' | 'READY' | 'STARTED' | 'COMPLETED' | 'SAVED_OFFLINE';
  customerCondition?: string;
  collectorNotes?: string;
  nextAction?: 'REVISIT' | 'CALL' | 'REMINDER' | 'ESCALATION' | 'LEGAL_REVIEW' | 'CLOSE_CASE' | 'WAIT';
  followUpDate?: string;
  attachmentCount?: number;
  photoCount?: number;
  voiceCount?: number;
  signatureStatus?: 'SIGNED' | 'UNSIGNED';
  offlineStatus?: 'OFFLINE' | 'ONLINE';
  
  // Support fields for attachments/signatures
  photoUrls?: string[];
  voiceUrl?: string;
  signatureBase64?: string;
}

export interface Payment extends BaseEntity {
  customerId: string;
  collectorId: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'QRIS' | 'OTHER';
  receiptNumber: string;
  signatureBase64?: string; // Proof of payment
  photoUrl?: string; // Proof of cash handover
  paymentDate: string;

  // Sprint 7 fields
  visitId?: string;
  commitmentId?: string;
  paymentTime?: string;
  remainingOutstanding?: number;
  installmentNumber?: number;
  referenceNumber?: string;
  evidenceCount?: number;
  collectorNotes?: string;
  customerNotes?: string;
  status?: 'Draft' | 'Recorded' | 'Verified' | 'Cancelled' | 'Pending Sync';
}

export interface PromiseToPay extends BaseEntity {
  customerId: string;
  collectorId: string;
  amount: number; // Promised Amount (same as promisedAmount for backward compatibility)
  promiseDate: string; // Due date of PTP (same as dueDate for backward compatibility)
  notes: string; // Main notes field (same as collectorNotes for backward compatibility)

  // Rich Commitment Fields
  visitId?: string; // Associated visit
  commitmentDate: string; // ISO timestamp when created
  dueDate: string; // ISO date string (YYYY-MM-DD)
  promisedAmount: number;
  expectedPaymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  status: 'Draft' | 'Active' | 'Due Today' | 'Overdue' | 'Completed' | 'Broken' | 'Cancelled';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reminderDate?: string; // Date to trigger reminder (YYYY-MM-DD)
  reminderTime?: string; // Time of day (HH:MM)
  followUpDate?: string; // Selected follow-up activity date (YYYY-MM-DD)
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  reason?: string; // Reason for PTP
  collectorNotes?: string;
  customerNotes?: string;
}

// --- NEW SPRINT 2 SCHEMAS ---

export interface Attachment extends BaseEntity {
  entityType: 'visit' | 'payment' | 'customer';
  entityId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrlOrBase64: string;
}

export interface Note extends BaseEntity {
  entityType: 'customer' | 'visit' | 'payment';
  entityId: string;
  content: string;
}

export interface Task extends BaseEntity {
  title: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'cancelled';
  assignedTo: string; // User ID / Collector ID
}

export interface ActivityLog extends BaseEntity {
  action: string; // e.g. 'LOGIN', 'VISIT_CREATED', 'PAYMENT_RECEIVED'
  entityType: string;
  entityId: string;
  details: string;
}

export interface Setting extends BaseEntity {
  key: string;
  value: string;
}

export interface SyncQueueItem extends BaseEntity {
  entityType: 'customer' | 'visit' | 'payment' | 'promise_to_pay';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface BackupHistory extends BaseEntity {
  backupDate: string;
  fileName: string;
  fileSize: number;
  checksum: string;
  status: 'success' | 'failed';
  recordCount: number;
}

export interface AuditLog extends BaseEntity {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  tag: string;
  message: string;
  timestamp: string;
  details?: string;
  error?: string;
}

// Backward compatibility helper
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export interface LogEntry {
  id: string;
  level: LogLevel;
  tag: string;
  context: string; // for compatibility with LogsScreen
  message: string;
  timestamp: string;
  details?: string;
  error?: string;
  uuid?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  isDeleted?: boolean;
  version?: number;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed';
  createdBy?: string;
  updatedBy?: string;
}
