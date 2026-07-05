/**
 * FC.OS Domain Constants, DTOs, and Mappers
 * Defines data transfer interfaces and conversion logic.
 */

import { BaseEntity, Customer, Visit, Payment } from '../types';
import { SyncStatus, CustomerStatus, VisitStatus } from './enums';

// ==========================================
// SYSTEM DOMAIN CONSTANTS
// ==========================================

export const DomainConstants = {
  VERSION: '1.0.0',
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  DEFAULT_SYNC_RETRY_LIMIT: 5,
  INDONESIAN_LOCALE: 'id-ID',
  INDONESIAN_CURRENCY: 'IDR',
  DEFAULT_COORDINATE_PRECISION: 5,
};

// ==========================================
// DATA TRANSFER OBJECTS (DTOs)
// ==========================================

export interface CreateCustomerDTO {
  id: string;
  name: string;
  address: string;
  phoneNumber: string;
  outstandingBalance: number;
  minPaymentDue: number;
  daysOverdue: number;
  bucket: '30' | '60' | '90' | '90+';
  status: CustomerStatus;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface UpdateCustomerDTO {
  name?: string;
  address?: string;
  phoneNumber?: string;
  outstandingBalance?: number;
  minPaymentDue?: number;
  daysOverdue?: number;
  bucket?: '30' | '60' | '90' | '90+';
  status?: CustomerStatus;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface CreateVisitDTO {
  customerId: string;
  collectorId: string;
  status: VisitStatus;
  notes: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  photoUrl?: string;
}

export interface CreatePaymentDTO {
  customerId: string;
  collectorId: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  receiptNumber: string;
  signatureBase64: string;
  photoUrl?: string;
}

// ==========================================
// MAPPER UTILITIES
// ==========================================

export class CustomerMapper {
  /**
   * Transforms a DB Customer Entity to a plain lightweight object
   */
  public static toDTO(entity: Customer): CreateCustomerDTO {
    return {
      id: entity.id,
      name: entity.name,
      address: entity.address,
      phoneNumber: entity.phoneNumber,
      outstandingBalance: entity.outstandingBalance,
      minPaymentDue: entity.minPaymentDue,
      daysOverdue: entity.daysOverdue,
      bucket: entity.bucket,
      status: entity.status as unknown as CustomerStatus,
      latitude: entity.latitude,
      longitude: entity.longitude,
      notes: entity.notes
    };
  }

  /**
   * Builds a complete DB Customer entity from a CreateCustomerDTO
   */
  public static toEntity(dto: CreateCustomerDTO, userId = 'system'): Customer {
    const now = new Date().toISOString();
    return {
      id: dto.id,
      uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      isDeleted: false,
      version: 1,
      syncStatus: SyncStatus.PENDING as unknown as 'pending',
      createdBy: userId,
      updatedBy: userId,
      name: dto.name,
      address: dto.address,
      phoneNumber: dto.phoneNumber,
      outstandingBalance: dto.outstandingBalance,
      minPaymentDue: dto.minPaymentDue,
      daysOverdue: dto.daysOverdue,
      bucket: dto.bucket,
      status: dto.status as unknown as 'PENDING' | 'VISITED' | 'PAID' | 'PROMISED',
      latitude: dto.latitude,
      longitude: dto.longitude,
      notes: dto.notes
    };
  }
}

export class VisitMapper {
  public static toEntity(dto: CreateVisitDTO, id: string, userId = 'system'): Visit {
    const now = new Date().toISOString();
    return {
      id,
      uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      isDeleted: false,
      version: 1,
      syncStatus: SyncStatus.PENDING as unknown as 'pending',
      createdBy: userId,
      updatedBy: userId,
      customerId: dto.customerId,
      collectorId: dto.collectorId,
      visitDate: now,
      status: dto.status as unknown as 'CONTACT' | 'NO_CONTACT' | 'BUSINESS_CLOSED' | 'ADDRESS_NOT_FOUND',
      notes: dto.notes,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      photoUrl: dto.photoUrl
    };
  }
}

export class PaymentMapper {
  public static toEntity(dto: CreatePaymentDTO, id: string, userId = 'system'): Payment {
    const now = new Date().toISOString();
    return {
      id,
      uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      isDeleted: false,
      version: 1,
      syncStatus: SyncStatus.PENDING as unknown as 'pending',
      createdBy: userId,
      updatedBy: userId,
      customerId: dto.customerId,
      collectorId: dto.collectorId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      receiptNumber: dto.receiptNumber,
      signatureBase64: dto.signatureBase64,
      photoUrl: dto.photoUrl,
      paymentDate: now
    };
  }
}
