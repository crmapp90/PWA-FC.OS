/**
 * FC.OS Domain Enums
 * Permanent domain-specific enums for standard data properties.
 */

export enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum VisitStatus {
  CONTACT = 'CONTACT',
  NO_CONTACT = 'NO_CONTACT',
  BUSINESS_CLOSED = 'BUSINESS_CLOSED',
  ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED'
}

export enum SyncStatus {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed'
}

export enum CustomerStatus {
  PENDING = 'PENDING',
  VISITED = 'VISITED',
  PAID = 'PAID',
  PROMISED = 'PROMISED'
}

export enum PriorityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DISMISSED = 'DISMISSED'
}

export enum ConnectionStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE'
}
