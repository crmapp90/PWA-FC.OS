/**
 * FC.OS Shared Domain Types
 * Core type primitives and structures utilized by Use Cases and Entities.
 */

export type ID = string;
export type UUID = string;
export type Money = number;
export type Percentage = number;
export type PhoneNumber = string;

export interface Coordinate {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface DateRange {
  startDate: string; // ISO 8601 string
  endDate: string; // ISO 8601 string
}

export interface Address {
  street: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface AttachmentInfo {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrlOrBase64: string;
}
