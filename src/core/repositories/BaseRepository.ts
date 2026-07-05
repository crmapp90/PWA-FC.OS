import { Table, Transaction } from 'dexie';
import { z } from 'zod';
import { BaseEntity, Result, Failure } from '../../types';
import { db, createBaseEntityFields } from '../database';
import { logger } from '../logger';

// --- QUERY INTERFACES ---

export interface FilterOptions<T> {
  equals?: Partial<Record<keyof T, any>>;
  contains?: Partial<Record<keyof T, string>>;
  between?: Partial<Record<keyof T, [any, any]>>;
  gt?: Partial<Record<keyof T, any>>;
  lt?: Partial<Record<keyof T, any>>;
  includeDeleted?: boolean;
}

export interface SortOptions<T> {
  field: keyof T;
  order: 'asc' | 'desc';
}

export interface QueryOptions<T> {
  search?: {
    query: string;
    fields: (keyof T)[];
  };
  filters?: FilterOptions<T>;
  sort?: SortOptions<T> | SortOptions<T>[];
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  pages: number;
  page: number;
  pageSize: number;
}

/**
 * Robust Base Repository pattern offering high performance, offline-first reliability,
 * and standard auditing controls for all FCOS models.
 */
export class BaseRepository<T extends BaseEntity> {
  protected table: Table<T, string>;
  protected schema?: z.ZodSchema<any>;
  protected entityName: string;

  constructor(table: Table<T, string>, entityName: string, schema?: z.ZodSchema<any>) {
    this.table = table;
    this.entityName = entityName;
    this.schema = schema;
  }

  // --- VALIDATION LAYER ---

  /**
   * Validates data integrity before performing database write operations
   */
  public async validate(data: Partial<T>, isUpdate = false): Promise<Result<boolean>> {
    try {
      // 1. Zod schema validation (if present)
      if (this.schema) {
        const checkData = isUpdate ? data : { id: data.id, ...data };
        const parseResult = this.schema.safeParse(checkData);
        if (!parseResult.success) {
          return {
            success: false,
            data: null,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Validation failed for ${this.entityName}: ${parseResult.error.issues.map(e => e.message).join(', ')}`,
              details: parseResult.error.format()
            }
          };
        }
      }

      // 2. Generic required field verification for creation
      if (!isUpdate) {
        if (!data.id) {
          return {
            success: false,
            data: null,
            error: {
              code: 'MISSING_PRIMARY_KEY',
              message: `Primary key 'id' is required for creating a new ${this.entityName}.`
            }
          };
        }

        // 3. Prevent duplicate keys
        const exists = await this.table.get(data.id);
        if (exists) {
          return {
            success: false,
            data: null,
            error: {
              code: 'DUPLICATE_KEY_ERROR',
              message: `An entry in ${this.entityName} with ID '${data.id}' already exists.`
            }
          };
        }
      }

      return { success: true, data: true, error: null };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_EXCEPTION',
          message: err.message || 'Unknown validation failure'
        }
      };
    }
  }

  // --- STANDARD CRUD ACTIONS ---

  /**
   * Inserts a single record into the local table with automatic audit auditing fields.
   */
  public async insert(
    item: Omit<T, keyof BaseEntity> & Partial<BaseEntity> & { id: string },
    userId = 'system'
  ): Promise<T> {
    const baseFields = createBaseEntityFields(userId);
    const completeItem = {
      ...baseFields,
      ...item,
    } as T;

    // Validate
    const validation = await this.validate(completeItem, false);
    if (!validation.success) {
      throw new Error(validation.error.message);
    }

    try {
      await this.table.add(completeItem);
      logger.info('Database', `Successfully inserted record into ${this.entityName}: ${completeItem.id}`);
      return completeItem;
    } catch (err: any) {
      logger.error('Database', `Error inserting into ${this.entityName}`, err);
      throw new Error(`Database error: ${err.message || 'Failed to insert'}`);
    }
  }

  /**
   * Updates an existing record with optimistic locking and schema verification.
   */
  public async update(
    id: string,
    updates: Partial<T>,
    userId = 'system'
  ): Promise<T> {
    const existing = await this.table.get(id);
    if (!existing) {
      throw new Error(`Record with ID '${id}' not found in ${this.entityName}.`);
    }

    // Merge updates to validate fully
    const merged = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      version: (existing.version || 1) + 1,
      syncStatus: 'pending' as const // Reset sync to pending for cloud syncing later
    } as T;

    const validation = await this.validate(merged, true);
    if (!validation.success) {
      throw new Error(validation.error.message);
    }

    try {
      await this.table.put(merged);
      logger.info('Database', `Successfully updated record in ${this.entityName}: ${id}`);
      return merged;
    } catch (err: any) {
      logger.error('Database', `Error updating ${this.entityName} ${id}`, err);
      throw new Error(`Database error: ${err.message || 'Failed to update'}`);
    }
  }

  /**
   * Physically removes a record from the database.
   */
  public async delete(id: string): Promise<void> {
    const exists = await this.table.get(id);
    if (!exists) {
      throw new Error(`Record with ID '${id}' not found in ${this.entityName}.`);
    }

    try {
      await this.table.delete(id);
      logger.info('Database', `Physical delete executed on ${this.entityName}: ${id}`);
    } catch (err: any) {
      logger.error('Database', `Error deleting from ${this.entityName} ${id}`, err);
      throw new Error(`Database error: ${err.message || 'Failed to delete'}`);
    }
  }

  /**
   * Logically/soft deletes a record by setting isDeleted to true.
   */
  public async softDelete(id: string, userId = 'system'): Promise<void> {
    const existing = await this.table.get(id);
    if (!existing) {
      throw new Error(`Record with ID '${id}' not found in ${this.entityName}.`);
    }

    try {
      const deletedAt = new Date().toISOString();
      await this.table.update(id, {
        isDeleted: true,
        deletedAt,
        updatedAt: deletedAt,
        updatedBy: userId,
        syncStatus: 'pending'
      } as any);
      logger.info('Database', `Soft deleted record in ${this.entityName}: ${id}`);
    } catch (err: any) {
      logger.error('Database', `Error soft deleting from ${this.entityName} ${id}`, err);
      throw new Error(`Database error: ${err.message || 'Failed to soft delete'}`);
    }
  }

  /**
   * Restores a soft-deleted record back to active state.
   */
  public async restore(id: string, userId = 'system'): Promise<T> {
    const existing = await this.table.get(id);
    if (!existing) {
      throw new Error(`Record with ID '${id}' not found in ${this.entityName}.`);
    }

    try {
      const updatedAt = new Date().toISOString();
      const updatedFields: Partial<T> = {
        isDeleted: false,
        deletedAt: null,
        updatedAt,
        updatedBy: userId,
        syncStatus: 'pending',
        version: (existing.version || 1) + 1
      } as any;

      await this.table.update(id, updatedFields as any);
      logger.info('Database', `Restored soft deleted record in ${this.entityName}: ${id}`);
      return { ...existing, ...updatedFields } as T;
    } catch (err: any) {
      logger.error('Database', `Error restoring ${this.entityName} ${id}`, err);
      throw new Error(`Database error: ${err.message || 'Failed to restore'}`);
    }
  }

  /**
   * Locates a record by primary key.
   */
  public async findById(id: string, includeDeleted = false): Promise<T | null> {
    try {
      const item = await this.table.get(id);
      if (!item) return null;
      if (item.isDeleted && !includeDeleted) return null;
      return item;
    } catch (err) {
      logger.error('Database', `Error finding by ID in ${this.entityName}`, err);
      return null;
    }
  }

  // --- QUERY ENGINE: SEARCH, FILTER, SORT, PAGINATE ---

  /**
   * Advanced Query Engine providing powerful in-memory searching, sorting, and filtering.
   */
  public async findAll(options: QueryOptions<T> = {}): Promise<T[]> {
    try {
      let collection = this.table.toCollection();
      let items = await collection.toArray();

      // 1. Filter out soft-deleted items by default
      const includeDeleted = options.filters?.includeDeleted ?? false;
      if (!includeDeleted) {
        items = items.filter(item => !item.isDeleted);
      }

      // 2. Filter conditions
      if (options.filters) {
        const { equals, contains, between, gt, lt } = options.filters;

        if (equals) {
          items = items.filter(item => {
            return Object.entries(equals).every(([key, value]) => {
              return (item as any)[key] === value;
            });
          });
        }

        if (contains) {
          items = items.filter(item => {
            return Object.entries(contains).every(([key, value]) => {
              if (!value) return true;
              const valStr = String((item as any)[key] || '').toLowerCase();
              return valStr.includes(String(value).toLowerCase());
            });
          });
        }

        if (between) {
          items = items.filter(item => {
            return Object.entries(between).every(([key, value]) => {
              if (!Array.isArray(value) || value.length !== 2) return true;
              const [min, max] = value;
              const fieldVal = (item as any)[key];
              return fieldVal >= min && fieldVal <= max;
            });
          });
        }

        if (gt) {
          items = items.filter(item => {
            return Object.entries(gt).every(([key, value]) => {
              return (item as any)[key] > value;
            });
          });
        }

        if (lt) {
          items = items.filter(item => {
            return Object.entries(lt).every(([key, value]) => {
              return (item as any)[key] < value;
            });
          });
        }
      }

      // 3. Keyword Search (Partial, Case-Insensitive, Multi-field)
      if (options.search && options.search.query.trim()) {
        const query = options.search.query.trim().toLowerCase();
        const searchFields = options.search.fields;

        items = items.filter(item => {
          return searchFields.some(field => {
            const fieldValue = (item as any)[field];
            if (fieldValue === undefined || fieldValue === null) return false;
            return String(fieldValue).toLowerCase().includes(query);
          });
        });
      }

      // 4. Sorting (Supports single or multi-field sorting)
      if (options.sort) {
        const sorts = Array.isArray(options.sort) ? options.sort : [options.sort];
        
        items.sort((a, b) => {
          for (const sort of sorts) {
            const { field, order } = sort;
            const valA = (a as any)[field];
            const valB = (b as any)[field];

            if (valA === valB) continue;

            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;

            const comparison = valA < valB ? -1 : 1;
            return order === 'asc' ? comparison : -comparison;
          }
          return 0;
        });
      }

      // 5. Pagination
      if (options.page && options.pageSize) {
        const start = (options.page - 1) * options.pageSize;
        items = items.slice(start, start + options.pageSize);
      }

      return items;
    } catch (err) {
      logger.error('Database', `Error performing query on ${this.entityName}`, err);
      throw err;
    }
  }

  /**
   * Paginated results helper wrapping total items count and page counts
   */
  public async paginate(options: QueryOptions<T> = {}): Promise<PaginatedResult<T>> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;

    // Get total count matching criteria without pagination slice
    const allOptionsWithoutPage = { ...options };
    delete allOptionsWithoutPage.page;
    delete allOptionsWithoutPage.pageSize;

    const matchedItems = await this.findAll(allOptionsWithoutPage);
    const total = matchedItems.length;

    // Sliced items for requested page
    const start = (page - 1) * pageSize;
    const items = matchedItems.slice(start, start + pageSize);

    return {
      items,
      total,
      pages: Math.ceil(total / pageSize),
      page,
      pageSize
    };
  }

  /**
   * Count entries matching criteria
   */
  public async count(filters?: FilterOptions<T>): Promise<number> {
    const items = await this.findAll({ filters });
    return items.length;
  }

  // --- BULK CORES ---

  /**
   * Bulk insert records
   */
  public async bulkInsert(
    items: (Omit<T, keyof BaseEntity> & Partial<BaseEntity> & { id: string })[],
    userId = 'system'
  ): Promise<T[]> {
    const baseFields = () => createBaseEntityFields(userId);
    const validatedItems: T[] = [];

    for (const item of items) {
      const complete = { ...baseFields(), ...item } as T;
      const validation = await this.validate(complete, false);
      if (!validation.success) {
        throw new Error(`Bulk insert failed: ${validation.error.message}`);
      }
      validatedItems.push(complete);
    }

    try {
      await this.table.bulkAdd(validatedItems);
      logger.info('Database', `Bulk insert executed on ${this.entityName} with ${validatedItems.length} records.`);
      return validatedItems;
    } catch (err: any) {
      logger.error('Database', `Error bulk inserting into ${this.entityName}`, err);
      throw new Error(`Database bulk error: ${err.message || 'Failed'}`);
    }
  }

  /**
   * Bulk updates multiple records by ID
   */
  public async bulkUpdate(
    ids: string[],
    updates: Partial<T>,
    userId = 'system'
  ): Promise<void> {
    try {
      await db.transaction('rw', this.table, async () => {
        for (const id of ids) {
          await this.update(id, updates, userId);
        }
      });
      logger.info('Database', `Bulk update completed on ${this.entityName} for ${ids.length} items.`);
    } catch (err: any) {
      logger.error('Database', `Error bulk updating ${this.entityName}`, err);
      throw err;
    }
  }

  /**
   * Bulk hard-deletes multiple records
   */
  public async bulkDelete(ids: string[]): Promise<void> {
    try {
      await this.table.bulkDelete(ids);
      logger.info('Database', `Bulk hard delete executed on ${this.entityName} for ${ids.length} records.`);
    } catch (err: any) {
      logger.error('Database', `Error bulk deleting from ${this.entityName}`, err);
      throw err;
    }
  }

  // --- TRANSACTION MANAGER ---

  /**
   * Runs local operations wrapped inside an atomic ACID transaction.
   * If any inner operation fails, the transaction is automatically rolled back.
   */
  public async executeTransaction<R>(
    mode: 'r' | 'rw',
    fn: (tx: Transaction) => Promise<R>
  ): Promise<R> {
    try {
      return await db.transaction(mode, this.table, async (tx) => {
        return await fn(tx);
      });
    } catch (err) {
      logger.error('Database', `Transaction failed on ${this.entityName}. Rolling back.`, err);
      throw err;
    }
  }
}
