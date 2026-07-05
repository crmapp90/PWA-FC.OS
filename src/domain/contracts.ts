/**
 * FC.OS Domain Contracts
 * Architectural contracts that specify standards for repositories and use cases.
 */

import { Result } from './result';
import { PaginatedResponse, QueryRequest } from './query';

/**
 * Base Repository Contract defining expected lifecycle behaviors.
 * All future concrete repositories will satisfy this interface.
 */
export interface IRepository<T> {
  findById(id: string, includeDeleted?: boolean): Promise<T | null>;
  findAll(query?: QueryRequest): Promise<T[]>;
  paginate(query?: QueryRequest): Promise<PaginatedResponse<T>>;
  insert(item: T, userId?: string): Promise<T>;
  update(id: string, updates: Partial<T>, userId?: string): Promise<T>;
  delete(id: string): Promise<void>;
  softDelete(id: string, userId?: string): Promise<void>;
  restore(id: string, userId?: string): Promise<T>;
  count(filters?: any): Promise<number>;
  validate(data: Partial<T>, isUpdate?: boolean): Promise<Result<boolean>>;
}

/**
 * UseCase Contract
 * Uniform interface for application layer services (Interactors / Use Cases).
 */
export interface IUseCase<TRequest, TResponse> {
  execute(request: TRequest, userId?: string): Promise<TResponse>;
}
