/**
 * FC.OS Reusable Domain Validators
 * Provides core validator functions returning Result wrappers for easy business logic validation.
 */

import { Result, ResultUtil } from './result';
import { Coordinate } from './types';

export class DomainValidator {
  /**
   * Validates that a value is present and not empty
   */
  public static required(value: any, fieldName = 'Field'): Result<boolean> {
    if (value === undefined || value === null) {
      return ResultUtil.validationError(`${fieldName} is required.`);
    }
    if (typeof value === 'string' && value.trim() === '') {
      return ResultUtil.validationError(`${fieldName} cannot be empty.`);
    }
    return ResultUtil.success(true);
  }

  /**
   * Validates standard email address format
   */
  public static email(value: string, fieldName = 'Email'): Result<boolean> {
    const presenceCheck = this.required(value, fieldName);
    if (!presenceCheck.success) return presenceCheck;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return ResultUtil.validationError(`${fieldName} format is invalid.`);
    }
    return ResultUtil.success(true);
  }

  /**
   * Validates standard phone number format (at least 5 digits, allows characters +, -, space, brackets)
   */
  public static phone(value: string, fieldName = 'Phone number'): Result<boolean> {
    const presenceCheck = this.required(value, fieldName);
    if (!presenceCheck.success) return presenceCheck;

    const cleanVal = value.replace(/[\s\-()]/g, '');
    const phoneRegex = /^\+?[0-9]{5,15}$/;
    if (!phoneRegex.test(cleanVal)) {
      return ResultUtil.validationError(`${fieldName} must contain between 5 and 15 digits.`);
    }
    return ResultUtil.success(true);
  }

  /**
   * Validates monetary values (numbers, must be non-negative)
   */
  public static money(value: number, fieldName = 'Money amount'): Result<boolean> {
    if (value === undefined || value === null || isNaN(value)) {
      return ResultUtil.validationError(`${fieldName} is invalid.`);
    }
    if (value < 0) {
      return ResultUtil.validationError(`${fieldName} cannot be negative.`);
    }
    return ResultUtil.success(true);
  }

  /**
   * Validates coordinate points (latitude between -90 and 90, longitude between -180 and 180)
   */
  public static coordinate(value: Coordinate, fieldName = 'Coordinate'): Result<boolean> {
    if (!value) {
      return ResultUtil.validationError(`${fieldName} is required.`);
    }
    const { latitude, longitude } = value;
    if (latitude === undefined || latitude === null || isNaN(latitude)) {
      return ResultUtil.validationError(`${fieldName} latitude is invalid.`);
    }
    if (longitude === undefined || longitude === null || isNaN(longitude)) {
      return ResultUtil.validationError(`${fieldName} longitude is invalid.`);
    }
    if (latitude < -90 || latitude > 90) {
      return ResultUtil.validationError(`${fieldName} latitude must be between -90 and 90.`);
    }
    if (longitude < -180 || longitude > 180) {
      return ResultUtil.validationError(`${fieldName} longitude must be between -180 and 180.`);
    }
    return ResultUtil.success(true);
  }

  /**
   * Validates simple text length constraints
   */
  public static text(value: string, minLength = 0, maxLength = 1000, fieldName = 'Text'): Result<boolean> {
    const presenceCheck = this.required(value, fieldName);
    if (!presenceCheck.success) return presenceCheck;

    if (value.length < minLength) {
      return ResultUtil.validationError(`${fieldName} must be at least ${minLength} characters long.`);
    }
    if (value.length > maxLength) {
      return ResultUtil.validationError(`${fieldName} cannot exceed ${maxLength} characters.`);
    }
    return ResultUtil.success(true);
  }
}
