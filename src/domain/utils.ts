/**
 * FC.OS Domain Utilities and Formatters
 * Pure domain functions for standardizing presentation outputs.
 */

import { Coordinate } from './types';

export class DomainFormatter {
  /**
   * Formats a numeric amount into Indonesian Rupiah (IDR).
   * Example: 12500000 -> "Rp 12.500.000"
   */
  public static currency(amount: number): string {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return 'Rp 0';
    }
    try {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (e) {
      return `Rp ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    }
  }

  /**
   * Formats a raw phone string into a standard readable layout.
   * Example: "+6281234567890" -> "+62 812-3456-7890" or "0812-3456-7890"
   */
  public static phone(phoneStr: string): string {
    if (!phoneStr) return '-';
    
    // Clean string from non-digits and preserve leading + if present
    const hasPlus = phoneStr.startsWith('+');
    const digits = phoneStr.replace(/\D/g, '');
    
    if (digits.length < 5) return phoneStr;

    if (hasPlus && digits.startsWith('62')) {
      // Format Indonesian international number
      const localPart = digits.slice(2);
      if (localPart.length === 9 || localPart.length === 10) {
        return `+62 ${localPart.slice(0, 3)}-${localPart.slice(3, 7)}-${localPart.slice(7)}`;
      } else if (localPart.length === 11 || localPart.length === 12) {
        return `+62 ${localPart.slice(0, 4)}-${localPart.slice(4, 8)}-${localPart.slice(8)}`;
      }
    } else if (digits.startsWith('0')) {
      // Format local number
      if (digits.length === 10 || digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
      } else if (digits.length === 12 || digits.length === 13) {
        return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
      }
    }

    return phoneStr;
  }

  /**
   * Formats an ISO Date string or Date object into Indonesian localized representation.
   */
  public static date(dateInput?: string | Date, layout: 'short' | 'long' | 'time' | 'full' = 'long'): string {
    if (!dateInput) return '-';
    
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      if (isNaN(date.getTime())) return '-';

      if (layout === 'time') {
        return new Intl.DateTimeFormat('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
      }

      if (layout === 'short') {
        return new Intl.DateTimeFormat('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(date);
      }

      if (layout === 'full') {
        return new Intl.DateTimeFormat('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
      }

      // Default to long
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch (e) {
      return String(dateInput);
    }
  }

  /**
   * Formats lat/lng coordinate pairs elegantly.
   * Example: { latitude: -6.2734, longitude: 106.8214 } -> "Lat: -6.27340, Lng: 106.82140"
   */
  public static coordinate(coord: Coordinate, decimals = 5): string {
    if (!coord) return '-';
    const { latitude, longitude } = coord;
    if (latitude === undefined || longitude === undefined) return '-';
    return `Lat: ${latitude.toFixed(decimals)}, Lng: ${longitude.toFixed(decimals)}`;
  }
}
