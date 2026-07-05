import React, { useEffect, lazy, Suspense } from 'react';
import { createHashRouter, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { useConnectivity } from '../shared/hooks/useConnectivity';
import { AppBar, BottomNavigation } from '../shared/components/BaseComponents';
import { LoginScreen } from '../features/authentication/LoginScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { CustomersScreen } from '../features/customer/CustomersScreen';
import { ShieldAlert, Loader2 } from 'lucide-react';

// Helper to safely load lazy components and auto-reload on chunk load failures (common after new deployments)
const safeLazy = <T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) => {
  return lazy(() =>
    importFn().catch((error) => {
      const lastReload = sessionStorage.getItem('chunk_load_failed_time');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('chunk_load_failed_time', String(now));
        console.error('Failed to load chunk, forcing page reload to get latest version...', error);
        window.location.reload();
      }
      throw error;
    })
  );
};

// Dynamic lazy-loading split chunks for secondary operational views (reduces initial JS payload by >50%)
const SyncScreen = safeLazy(() => import('../features/sync/SyncScreen').then(m => ({ default: m.SyncScreen })));
const SettingsScreen = safeLazy(() => import('../features/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const LogsScreen = safeLazy(() => import('../features/settings/LogsScreen').then(m => ({ default: m.LogsScreen })));
const VisitsScreen = safeLazy(() => import('../features/visit/VisitsScreen').then(m => ({ default: m.VisitsScreen })));
const CommitmentsScreen = safeLazy(() => import('../features/customer/CommitmentsScreen').then(m => ({ default: m.CommitmentsScreen })));
const PaymentsScreen = safeLazy(() => import('../features/customer/PaymentsScreen').then(m => ({ default: m.PaymentsScreen })));
const IntelligenceScreen = safeLazy(() => import('../features/intelligence/IntelligenceScreen').then(m => ({ default: m.IntelligenceScreen })));
const ReportsScreen = safeLazy(() => import('../features/reports/ReportsScreen').then(m => ({ default: m.ReportsScreen })));

/**
 * Route Guards
 */
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAuthLoading } = useStore();
  const location = useLocation();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-500 mt-4">Memvalidasi sesi keamanan...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useStore();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
};

/**
 * Custom 404 Unknown Route Screen
 */
export const UnknownRoutePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 animate-pulse">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">Halaman Tidak Ditemukan (404)</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
        Rute yang Anda akses tidak terdaftar dalam protokol keamanan jaringan FC.OS atau sedang dalam tahap pengembangan.
      </p>
      <a 
        href="#/dashboard"
        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-md transition-all active:scale-95"
      >
        Kembali ke Dasbor Aman
      </a>
    </div>
  );
};

/**
 * Main Protected Layout Shell
 */
const AppLayout: React.FC = () => {
  const { activeCollector, activeTab, setActiveTab } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Sync state activeTab with path url changes
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) setActiveTab('dashboard');
    else if (path.startsWith('/customers')) setActiveTab('customers');
    else if (path.startsWith('/visits')) setActiveTab('visits');
    else if (path.startsWith('/commitments')) setActiveTab('commitments');
    else if (path.startsWith('/payments')) setActiveTab('payments');
    else if (path.startsWith('/reports')) setActiveTab('reports');
    else if (path.startsWith('/sync')) setActiveTab('sync');
    else if (path.startsWith('/settings')) setActiveTab('settings');
    else if (path.startsWith('/logs')) setActiveTab('logs');
    else if (path.startsWith('/intel')) setActiveTab('intel');
  }, [location, setActiveTab]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    navigate(`/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col pb-20 select-none transition-colors duration-200">
      <AppBar 
        title="FC.OS" 
        subtitle={activeCollector ? `${activeCollector.fullName} • ${activeCollector.branch}` : 'Kolektor Lapangan'}
      />

      <main className="flex-1 p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-12 min-h-[50vh] space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-500" />
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat modul rute aman...</p>
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>

      <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

/**
 * Routes Configuration Map
 */
export const routesConfig = [
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginScreen />
      </PublicRoute>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/dashboard',
        element: <DashboardScreen />,
      },
      {
        path: '/customers',
        element: <CustomersScreen />,
      },
      {
        path: '/visits',
        element: <VisitsScreen />,
      },
      {
        path: '/commitments',
        element: <CommitmentsScreen />,
      },
      {
        path: '/payments',
        element: <PaymentsScreen />,
      },
      {
        path: '/reports',
        element: <ReportsScreen />,
      },
      {
        path: '/sync',
        element: <SyncScreen />,
      },
      {
        path: '/settings',
        element: <SettingsScreen />,
      },
      {
        path: '/intel',
        element: <IntelligenceScreen />,
      },
      {
        path: '/logs',
        element: <LogsScreen />,
      }
    ]
  },
  {
    path: '*',
    element: <UnknownRoutePage />,
  }
];

export const router = createHashRouter(routesConfig);

export default router;
