import { LogLevel, LogEntry } from '../types';
import { db } from './database';

/**
 * FC.OS Centralized Logging Service
 * Prevents direct console.log usage and maintains audit logs in IndexedDB for debugging support.
 */
class LoggerService {
  private isDevelopment = (import.meta as any).env?.DEV;

  /**
   * Recursively scrubs and redacts sensitive customer, payment, and connection details
   * to ensure zero logs contamination with personally identifiable information (PII) or financial details.
   */
  private scrubSensitiveData(data: unknown): any {
    if (data === undefined || data === null) return data;
    
    // Mask string patterns
    if (typeof data === 'string') {
      let scrubbed = data;
      // Mask base64 strings (signatures, photos)
      scrubbed = scrubbed.replace(/data:image\/[a-zA-Z]*;base64,[^"'\s]*/g, '[REDACTED_BASE64_BUFFER]');
      // Mask email addresses
      scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
      // Mask standard phone numbers (Indonesian e.g. 0812... or +62...)
      scrubbed = scrubbed.replace(/(\+62|08)[0-9]{8,11}/g, '[REDACTED_PHONE]');
      return scrubbed;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.scrubSensitiveData(item));
    }

    if (typeof data === 'object') {
      try {
        const copy = JSON.parse(JSON.stringify(data)); // deep clone
        const sensitiveKeys = [
          'phoneNumber', 'alternativePhone', 'phone', 'address', 'signatureBase64', 
          'outstandingBalance', 'minPaymentDue', 'installmentAmount', 'email', 'password', 'token'
        ];
        
        const recurse = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                if (typeof obj[key] === 'number') {
                  obj[key] = -999; // safe masked number representing redacted balance
                } else {
                  obj[key] = '[REDACTED_SENSITIVE_FIELD]';
                }
              } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                recurse(obj[key]);
              } else if (typeof obj[key] === 'string') {
                obj[key] = this.scrubSensitiveData(obj[key]);
              }
            }
          }
        };
        recurse(copy);
        return copy;
      } catch {
        return '[REDACTED_UNPARSABLE_OBJECT]';
      }
    }
    
    return data;
  }

  private async writeLog(level: LogLevel, tag: string, message: string, details?: unknown) {
    const timestamp = new Date().toISOString();
    
    // Run security-scrubbing filters over message and details
    const scrubbedMessage = String(this.scrubSensitiveData(message));
    const scrubbedDetails = this.scrubSensitiveData(details);
    const detailsStr = scrubbedDetails ? (typeof scrubbedDetails === 'object' ? JSON.stringify(scrubbedDetails, null, 2) : String(scrubbedDetails)) : undefined;

    const id = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const uuid = Math.random().toString(36).substring(2) + timestamp;

    const entry: LogEntry = {
      id,
      uuid,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      isDeleted: false,
      version: 1,
      syncStatus: 'pending',
      createdBy: 'system',
      updatedBy: 'system',
      level,
      tag,
      context: tag,
      message: scrubbedMessage,
      timestamp,
      details: detailsStr,
    };

    // 1. Output to console with styled badges in development mode
    if (this.isDevelopment) {
      const styles = {
        DEBUG: 'background: #4b5563; color: #f3f4f6; padding: 1px 4px; border-radius: 2px;',
        INFO: 'background: #2563eb; color: #ffffff; padding: 1px 4px; border-radius: 2px;',
        WARN: 'background: #d97706; color: #ffffff; padding: 1px 4px; border-radius: 2px;',
        ERROR: 'background: #dc2626; color: #ffffff; padding: 1px 4px; border-radius: 2px;',
      };
      
      console.log(
        `%c${level}%c [${tag}] ${scrubbedMessage}`,
        styles[level],
        'color: inherit;',
        scrubbedDetails !== undefined ? scrubbedDetails : ''
      );
    }

    // 2. Persist to Dexie DB as an audit log (async, non-blocking)
    try {
      if (db && db.logs) {
        await db.logs.add(entry);
      }
    } catch (e) {
      // Avoid recursive loop if logging itself fails
      console.error('Failed to persist log entry to database:', e);
    }
  }

  public debug(tag: string, message: string, details?: unknown) {
    this.writeLog('DEBUG', tag, message, details);
  }

  public info(tag: string, message: string, details?: unknown) {
    this.writeLog('INFO', tag, message, details);
  }

  public warn(tag: string, message: string, details?: unknown) {
    this.writeLog('WARN', tag, message, details);
  }

  public error(tag: string, message: string, details?: unknown) {
    this.writeLog('ERROR', tag, message, details);
  }

  /**
   * Retrieves all persisted audit logs sorted by newest first
   */
  public async getLogs(limit = 100): Promise<LogEntry[]> {
    if (!db || !db.logs) return [];
    return db.logs.orderBy('timestamp').reverse().limit(limit).toArray();
  }

  /**
   * Clears old logs to prevent database bloating
   */
  public async clearLogs(): Promise<void> {
    if (!db || !db.logs) return;
    await db.logs.clear();
    this.info('Logger', 'Audit logs cleared manually');
  }
}

export const logger = new LoggerService();
export default logger;
