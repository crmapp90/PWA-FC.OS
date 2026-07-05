/**
 * FC.OS Result Object Pattern
 * Standard wrapper for operation outcomes to prevent throwing raw uncaught exceptions.
 */

export interface Failure {
  code: string;
  message: string;
  details?: unknown;
}

export type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: Failure };

export class ResultUtil {
  /**
   * Returns a successful result carrying data
   */
  public static success<T>(data: T): Result<T> {
    return {
      success: true,
      data,
      error: null
    };
  }

  /**
   * Returns a failed result carrying error info
   */
  public static failure<T>(code: string, message: string, details?: unknown): Result<T> {
    return {
      success: false,
      data: null,
      error: {
        code,
        message,
        details
      }
    };
  }

  /**
   * Helper for validation failures
   */
  public static validationError<T>(message: string, details?: unknown): Result<T> {
    return this.failure<T>('VALIDATION_ERROR', message, details);
  }

  /**
   * Helper for database errors
   */
  public static databaseError<T>(message: string, details?: unknown): Result<T> {
    return this.failure<T>('DATABASE_ERROR', message, details);
  }

  /**
   * Helper for unexpected system exceptions
   */
  public static unexpectedError<T>(message: string, details?: unknown): Result<T> {
    return this.failure<T>('UNEXPECTED_ERROR', message, details);
  }
}
