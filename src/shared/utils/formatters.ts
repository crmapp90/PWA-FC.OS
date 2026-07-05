/**
 * FC.OS Formatters
 * Specialized utilities for Indonesian Rupiah (IDR) and localized date layouts
 * optimized for outdoor Field Collection environments.
 */

/**
 * Formats a numeric amount to Indonesian Rupiah (IDR) currency format.
 * Example: 12500000 -> 'Rp 12.500.000'
 */
export function formatCurrency(amount: number): string {
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
    // Graceful fallback
    return `Rp ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  }
}

/**
 * Formats an ISO Date string into localized long format in Indonesian.
 * Example: '2026-06-30T04:22:21-07:00' -> '30 Juni 2026'
 */
export function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '-';
  
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Formats an ISO Date string into short format.
 * Example: '2026-06-30' -> '30/06/2026'
 */
export function formatShortDate(dateStr?: string | Date): string {
  if (!dateStr) return '-';
  
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Formats an ISO Date string into short time format.
 * Example: '2026-06-30T04:22:21' -> '04:22'
 */
export function formatTime(dateStr?: string | Date): string {
  if (!dateStr) return '-';
  
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch (e) {
    return '-';
  }
}

/**
 * Formats progress value as a percentage.
 * Example: 0.37 -> '37%'
 */
export function formatPercentage(value: number): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0%';
  }
  return `${Math.round(value * 100)}%`;
}
