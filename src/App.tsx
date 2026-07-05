import React, { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Loader2
} from 'lucide-react';
import { useStore } from './core/store';
import { seedDatabaseIfEmpty } from './core/database';
import { logger } from './core/logger';
import { getSupabase, isSupabaseConfigured } from './core/supabase';
import { useConnectivity } from './shared/hooks/useConnectivity';
import { router } from './core/router';
import { NotificationService } from './core/services/NotificationService';

// ==========================================
// ERROR BOUNDARY FOR APP LEVEL RECOVERY
// ==========================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center select-none">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 p-6 sm:p-8 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <h1 className="text-lg font-bold">App Error Boundary</h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              FC.OS mendeteksi kesalahan sistem yang tidak tertangani. Seluruh database lokal offline Anda tetap terlindungi dan aman.
            </p>
            <div className="p-3.5 bg-red-50 dark:bg-red-950/20 rounded-xl text-xs font-mono text-red-700 dark:text-red-400 overflow-x-auto max-h-40 break-all leading-normal">
              {this.state.error?.message || 'Unknown Exception'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all active:scale-98"
            >
              Nyalakan Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==========================================
// CORE APP ENTRY POINT
// ==========================================

export default function App() {
  const isOnline = useConnectivity();
  const { 
    theme,
    setOnlineStatus,
    initializeAuth,
    refreshPendingSyncCount,
    activeCollector,
  } = useStore();

  // Start notification scheduler when collector is authenticated
  useEffect(() => {
    if (activeCollector?.id) {
      NotificationService.requestPermission().then(granted => {
        if (granted) NotificationService.startScheduler(activeCollector.id);
      });
    } else {
      NotificationService.stopScheduler();
    }
    return () => { /* scheduler cleans itself on logout */ };
  }, [activeCollector?.id]);

  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState(0);
  const [initStage, setInitStage] = useState('Memulai sistem...');

  // Sync network connection with store
  useEffect(() => {
    setOnlineStatus(isOnline);
  }, [isOnline, setOnlineStatus]);

  // Handle CSS theme classes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // SPRINT 1 STARTUP CONSTITUTIONAL INITIALIZATION FLOW
  useEffect(() => {
    async function bootSequence() {
      try {
        logger.info('System', 'FC.OS boot sequence started...');

        // Step 1: Initialize App & modules
        setInitStage('Memuat modul dasar aplikasi...');
        setInitProgress(15);
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Step 2: Load Environment & verify configuration
        setInitStage('Memuat konfigurasi lingkungan (Environment)...');
        setInitProgress(35);
        const hasSupa = isSupabaseConfigured();
        logger.info('System', `Environment configurations checked. Supabase configured: ${hasSupa}`);
        await new Promise((resolve) => setTimeout(resolve, 350));

        // Step 3: Initialize Database (Dexie IndexedDB Seeding)
        setInitStage('Menginisialisasi basis data lokal (IndexedDB)...');
        setInitProgress(60);
        await seedDatabaseIfEmpty();
        await new Promise((resolve) => setTimeout(resolve, 350));

        // Step 4: Initialize Supabase (or fallback to local sandbox)
        if (hasSupa) {
          setInitStage('Menghubungkan layanan awan (Supabase Cloud)...');
          try {
            getSupabase();
          } catch (e) {
            logger.warn('System', 'Failed lazy init of Supabase client in boot');
          }
        } else {
          setInitStage('Menyiapkan sandboks penyimpanan offline...');
        }
        setInitProgress(80);
        await new Promise((resolve) => setTimeout(resolve, 350));

        // Step 5: Restore Session
        setInitStage('Memulihkan sesi login keamanan...');
        setInitProgress(95);
        await initializeAuth();
        await refreshPendingSyncCount();
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Step 6: Route Decision & Application Ready
        setInitStage('Mengarahkan rute operasional...');
        setInitProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 200));

        logger.info('System', 'System ready. Handing off to layout router.');
        setIsInitializing(false);
      } catch (err) {
        logger.error('System', 'Fatal failure during boot sequence', err);
        setInitStage('Gagal melakukan booting sistem. Sila hubungi IT cabang.');
      }
    }

    bootSequence();
  }, [initializeAuth, refreshPendingSyncCount]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6 select-none text-white font-sans">
        <div></div>
        
        {/* Splash Main Branding */}
        <div className="max-w-md w-full mx-auto space-y-8 text-center">
          <div className="mx-auto w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-500/10 border border-blue-500/20 animate-pulse">
            <ShieldCheck className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">FC.OS</h1>
            <p className="text-xs font-bold text-blue-400 tracking-widest uppercase">
              Field Collection Operating System
            </p>
          </div>
        </div>

        {/* Loading Progress Frame */}
        <div className="max-w-xs w-full mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="truncate max-w-[200px]">{initStage}</span>
          </div>

          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-800/50">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${initProgress}%` }}
            ></div>
          </div>

          <div className="text-center text-[10px] text-slate-500 font-mono tracking-wider">
            SISTEM MEMUAT • {initProgress}%
          </div>
        </div>

        {/* Footer info */}
        <footer className="text-center font-mono text-[9px] text-slate-600 tracking-wide">
          SECURE SECTOR FOUNDATION • SPRINT 1 COMPLETE
        </footer>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
