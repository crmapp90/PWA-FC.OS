/**
 * FC.OS Domain Errors
 * Structured domain-specific error classes.
 */

export class DomainError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'DOMAIN_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class RepositoryError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'REPOSITORY_ERROR', details);
  }
}

export class AuthenticationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', details);
  }
}

export class DatabaseError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', details);
  }
}

export class OfflineError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'OFFLINE_ERROR', details);
  }
}

export class SyncError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'SYNC_ERROR', details);
  }
}

export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'BUSINESS_RULE_ERROR', details);
  }
}
