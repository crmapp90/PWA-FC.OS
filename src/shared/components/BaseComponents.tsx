import React, { ReactNode } from 'react';
import { 
  Search, 
  Loader2, 
  AlertTriangle, 
  Inbox, 
  ChevronRight, 
  Wifi, 
  WifiOff, 
  User, 
  Home, 
  Users, 
  RefreshCw, 
  Settings,
  FileText,
  MapPin,
  Handshake,
  CircleDollarSign
} from 'lucide-react';
import { THEME } from '../../core/theme';

// ==========================================
// 1. BUTTON COMPONENTS
// ==========================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  isLoading?: boolean;
  icon?: ReactNode;
}

export const PrimaryButton: React.FC<ButtonProps> = ({ 
  children, 
  isLoading, 
  icon, 
  className = '', 
  ...props 
}) => {
  return (
    <button
      {...props}
      disabled={isLoading || props.disabled}
      className={`
        ${THEME.spacing.touchTarget}
        ${THEME.colors.primary.bg}
        ${THEME.colors.primary.text}
        ${THEME.colors.primary.hover}
        ${THEME.colors.primary.active}
        disabled:opacity-50 disabled:pointer-events-none
        w-full shadow-sm text-center font-bold text-base tracking-wide
        flex items-center justify-center gap-2 active:scale-98
        ${className}
      `}
    >
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {children}
    </button>
  );
};

export const SecondaryButton: React.FC<ButtonProps> = ({ 
  children, 
  isLoading, 
  icon, 
  className = '', 
  ...props 
}) => {
  return (
    <button
      {...props}
      disabled={isLoading || props.disabled}
      className={`
        ${THEME.spacing.touchTarget}
        ${THEME.colors.secondary.bg}
        ${THEME.colors.secondary.text}
        ${THEME.colors.secondary.hover}
        disabled:opacity-50 disabled:pointer-events-none
        w-full font-bold text-base border border-slate-200 dark:border-slate-700
        flex items-center justify-center gap-2 active:scale-98
        ${className}
      `}
    >
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {children}
    </button>
  );
};

// ==========================================
// 2. FORM FIELDS
// ==========================================

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
}

export const TextField: React.FC<InputFieldProps> = ({ 
  label, 
  error, 
  icon, 
  className = '', 
  ...props 
}) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-4 text-slate-400">
            {icon}
          </div>
        )}
        <input
          {...props}
          className={`
            w-full ${THEME.radius.button} border text-base outline-none transition-all
            ${icon ? 'pl-11' : 'pl-4'} pr-4 min-h-[48px]
            ${error 
              ? 'border-red-500 bg-red-50/50 focus:border-red-500 focus:ring-1 focus:ring-red-500' 
              : 'border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-slate-900'}
            ${className}
          `}
        />
      </div>
      {error && (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  );
};

export const SearchField: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ 
  className = '', 
  ...props 
}) => {
  return (
    <div className="relative flex items-center w-full">
      <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none" />
      <input
        {...props}
        className={`
          w-full ${THEME.radius.button} border border-slate-300 dark:border-slate-700
          bg-white dark:bg-slate-900 pl-11 pr-4 min-h-[48px] text-base outline-none
          focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all
          ${className}
        `}
      />
    </div>
  );
};

// ==========================================
// 3. CARDS & WRAPPERS
// ==========================================

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const ReusableCard: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        ${THEME.colors.card} 
        ${THEME.radius.card} 
        p-4 sm:p-5
        ${onClick ? 'cursor-pointer active:scale-[0.99] transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''} 
        ${className}
      `}
    >
      {children}
    </div>
  );
};

// ==========================================
// 4. ALERTS, EMPTY & SKELETON STATES
// ==========================================

export const LoadingWidget: React.FC<{ message?: string }> = ({ message = 'Memuat data...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
};

export const EmptyWidget: React.FC<{ title?: string; description?: string }> = ({ 
  title = 'Tidak Ada Data', 
  description = 'Data tidak ditemukan dalam penyimpanan lokal.' 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center gap-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
        <Inbox className="w-8 h-8" />
      </div>
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="text-xs text-slate-500 max-w-xs">{description}</p>
    </div>
  );
};

export const ErrorWidget: React.FC<{ title?: string; message: string; onRetry?: () => void }> = ({ 
  title = 'Kegagalan Sistem', 
  message, 
  onRetry 
}) => {
  return (
    <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 text-red-800 dark:text-red-300 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="font-bold text-sm">{title}</span>
          <span className="text-xs leading-relaxed">{message}</span>
        </div>
      </div>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="self-end text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors active:scale-95"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
};

export const SkeletonLoader: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="w-full flex flex-col gap-4 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-5 bg-slate-100 dark:bg-slate-800 rounded-xl space-y-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-1/3"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-3/4"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-1/2"></div>
        </div>
      ))}
    </div>
  );
};

export const ProgressIndicator: React.FC<{ value: number; max?: number }> = ({ value, max = 1 }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full space-y-1">
      <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
        <div 
          className="h-full bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

// ==========================================
// 5. APPLICATION BARS & NAVIGATORS
// ==========================================

export const OfflineBanner: React.FC = () => {
  const isOnline = navigator.onLine;
  if (isOnline) return null;

  return (
    <div className="bg-amber-600 text-white text-center py-1.5 px-4 text-xs font-bold tracking-wide flex items-center justify-center gap-2 animate-slide-down">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>Sistem Berjalan dalam Mode Offline (Data Aman di HP)</span>
    </div>
  );
};

interface AppBarProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}

export const AppBar: React.FC<AppBarProps> = ({ title, subtitle, trailing }) => {
  const isOnline = navigator.onLine;
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <OfflineBanner />
      <div className="px-4 py-3 flex items-center justify-between min-h-[56px]">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0" title={isOnline ? 'Online' : 'Offline'}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-emerald-400 font-bold' : 'bg-amber-400 font-bold'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-50 tracking-tight leading-none">
              {title}
            </h1>
            {subtitle && (
              <span className="text-[10px] text-slate-500 font-medium tracking-wide mt-1">
                {subtitle}
              </span>
            )}
          </div>
        </div>
        {trailing && <div className="flex items-center gap-2">{trailing}</div>}
      </div>
    </header>
  );
};

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const BottomNavigation: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tabs = [
    { id: 'dashboard', label: 'Dasbor', icon: <Home className="w-5 h-5" /> },
    { id: 'customers', label: 'Debitur', icon: <Users className="w-5 h-5" /> },
    { id: 'visits', label: 'Kunjungan', icon: <MapPin className="w-5 h-5" /> },
    { id: 'commitments', label: 'Janji', icon: <Handshake className="w-5 h-5" /> },
    { id: 'payments', label: 'Bayar', icon: <CircleDollarSign className="w-5 h-5" /> },
    { id: 'reports', label: 'Laporan', icon: <FileText className="w-5 h-5" /> },
    { id: 'sync', label: 'Sinkron', icon: <RefreshCw className="w-5 h-5 animate-none" /> },
    { id: 'settings', label: 'Sistem', icon: <Settings className="w-5 h-5" /> },
  ];

  React.useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [activeTab]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 dark:bg-slate-900 dark:border-slate-800 pb-safe shadow-lg">
      <div 
        ref={containerRef}
        className="flex items-stretch h-[64px] overflow-x-auto scrollbar-none snap-x snap-mandatory px-2 gap-1 scroll-smooth"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              data-active={isActive ? "true" : "false"}
              className={`
                flex-shrink-0 flex-1 flex flex-col items-center justify-center gap-1 transition-all rounded-xl my-1 px-1.5 snap-center
                ${isActive 
                  ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium'}
              `}
              style={{ minWidth: '64px' }}
            >
              <div className={`transition-transform duration-100 ${isActive ? 'scale-110 text-blue-600 dark:text-blue-400' : ''}`}>
                {tab.icon}
              </div>
              <span className="text-[9px] tracking-tight leading-none truncate max-w-[58px]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

// ==========================================
// 6. CONFIRMATION DIALOG
// ==========================================

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Setuju',
  cancelLabel = 'Batal',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onCancel}></div>
      
      {/* Container */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-scale-up">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>
        
        <div className="flex gap-3 pt-2">
          <SecondaryButton onClick={onCancel} className="flex-1">
            {cancelLabel}
          </SecondaryButton>
          <PrimaryButton onClick={onConfirm} className="flex-1 bg-blue-600 text-white">
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
