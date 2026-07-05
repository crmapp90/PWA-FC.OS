/**
 * FC.OS Design System Core Theme Settings
 * Tailored for high legibility, robust outdoor contrast, and generous target zones (min 44px)
 * for Field Collectors working under direct sunlight.
 */

export const THEME = {
  colors: {
    // High-contrast, sunlight-readable color palette
    background: 'bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50',
    card: 'bg-white border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800',
    primary: {
      brand: '#2563eb', // Rich Cobalt Blue
      hover: 'hover:bg-blue-700',
      active: 'active:bg-blue-800',
      text: 'text-white',
      bg: 'bg-blue-600',
    },
    secondary: {
      brand: '#475569', // Slate Gray
      hover: 'hover:bg-slate-700',
      text: 'text-slate-900 dark:text-slate-100',
      bg: 'bg-slate-100 dark:bg-slate-800',
    },
    accent: {
      warning: {
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-200 dark:border-amber-800/50',
        text: 'text-amber-700 dark:text-amber-400',
      },
      danger: {
        bg: 'bg-red-50 dark:bg-red-950/20',
        border: 'border-red-200 dark:border-red-800/50',
        text: 'text-red-700 dark:text-red-400',
      },
      success: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        text: 'text-emerald-700 dark:text-emerald-400',
      },
      info: {
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        border: 'border-blue-200 dark:border-blue-800/50',
        text: 'text-blue-700 dark:text-blue-400',
      },
    },
    // Status color bindings
    status: {
      PENDING: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
      VISITED: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
      PAID: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300',
      PROMISED: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
    }
  },
  typography: {
    // Screen titles, data fields, and microcopy sizes
    title: 'text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50',
    sectionHeader: 'text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100',
    body: 'text-sm text-slate-600 dark:text-slate-300 leading-relaxed',
    meta: 'font-mono text-xs text-slate-500 dark:text-slate-400',
    amount: 'font-mono text-xl font-bold text-slate-900 dark:text-slate-50',
  },
  spacing: {
    screenPadding: 'p-4 sm:p-6',
    gap: 'space-y-4',
    itemGap: 'space-y-2',
    // Minimum interactive touch target as requested (at least 44px height/width)
    touchTarget: 'min-h-[48px] px-4 py-3 flex items-center justify-center rounded-lg font-medium transition-all duration-150',
    iconTarget: 'w-11 h-11 flex items-center justify-center rounded-lg',
  },
  radius: {
    card: 'rounded-xl',
    button: 'rounded-lg',
    badge: 'rounded-full',
  },
};

export default THEME;
