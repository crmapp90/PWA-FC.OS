/**
 * FC.OS Reusable Query, Search, Filter, Sort, and Pagination Models
 * Standardizes API/Repository query parameter formats.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  total: number;
  pages: number;
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface SearchParams {
  query: string;
  fields: string[];
}

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'contains' | 'between' | 'gt' | 'lt';
  value: any;
}

export interface SortParam {
  field: string;
  order: 'asc' | 'desc';
}

export interface QueryRequest {
  search?: SearchParams;
  filters?: FilterCondition[];
  sort?: SortParam[];
  pagination?: PaginationParams;
}
