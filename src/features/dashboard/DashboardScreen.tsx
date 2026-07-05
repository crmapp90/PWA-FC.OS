import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  MapPin, 
  CheckSquare, 
  Wallet, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  History, 
  ArrowRight, 
  Search, 
  Plus, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  BrainCircuit, 
  CheckCircle2, 
  AlertCircle, 
  Flame, 
  ShieldAlert, 
  FileText,
  DollarSign
} from 'lucide-react';
import { useStore } from '../../core/store';
import { logger } from '../../core/logger';
import { useLocalization } from '../../core/localization';
import { formatCurrency } from '../../shared/utils/formatters';
import { 
  IntelligenceService, 
  RecommendationResult, 
  OperationalAlert 
} from '../../core/services/IntelligenceService';
import { motion, AnimatePresence } from 'motion/react';

// Types for aggregated dashboard data
interface DashboardData {
  collectorName: string;
  currentDate: string;
  isOnline: boolean;
  pendingSyncCount: number;
  greeting: string;
  metrics: {
    customersAssigned: number;
    visitsScheduled: number;
    visitsCompleted: number;
    commitmentsDue: number;
    paymentsRecorded: number;
    outstandingAmount: number;
    recoveryAmount: number;
    recoveryPercentage: number;
    collectedAmount: number;
  };
  commitments: {
    dueToday: number;
    overdue: number;
    completedToday: number;
    brokenCommitments: number;
  };
  visits: {
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  recovery: {
    dailyTarget: number;
    collectedToday: number;
    remainingTarget: number;
    recoveryPercentage: number;
  };
  alertsSummary: {
    criticalCustomers: number;
    brokenCommitments: number;
    overdueVisits: number;
    pendingFollowUp: number;
    pendingSync: number;
  };
  priorityQueue: RecommendationResult[];
  alertsList: OperationalAlert[];
  recentActivities: {
    id: string;
    type: 'VISIT' | 'COMMITMENT' | 'PAYMENT' | 'CUSTOMER_UPDATE';
    title: string;
    description: string;
    timestamp: string;
    customerName: string;
  }[];
  executionTimeMs: number;
}

export const DashboardScreen: React.FC = () => {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { 
    activeCollector, 
    isSyncing, 
    syncProgress, 
    pendingSyncCount,
    refreshPendingSyncCount,
    triggerSync,
    isOnline
  } = useStore();

  // Local States
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Load consolidated dashboard data
  const loadDashboardData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorState(null);
    try {
      // Refresh sync queues count first to be accurate
      await refreshPendingSyncCount();
      const collectorId = activeCollector?.id || '';
      
      const dashboardPayload = await IntelligenceService.getDashboardData(collectorId);
      setData(dashboardPayload);
    } catch (err: any) {
      logger.error('DashboardScreen', 'Failed to compile dashboard intelligence data', err);
      setErrorState(err?.message || 'Gagal memproses data operasional luring.');
    } finally {
      setIsLoading(false);
      setIsManualRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [activeCollector, isOnline]);

  // Handle manual dashboard pull-to-refresh
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await loadDashboardData(true);
  };

  // Sync handler with dashboard state refresh
  const handleSyncClick = async () => {
    if (pendingSyncCount === 0) return;
    try {
      const success = await triggerSync();
      if (success) {
        await loadDashboardData(true);
      }
    } catch (e) {
      logger.error('DashboardScreen', 'Sync operation error from dashboard quick trigger', e);
    }
  };

  // Helper styles for Risk Level badges
  const getRiskBadgeStyles = (level: RecommendationResult['riskLevel']) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-100 dark:border-red-900/40';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-100 dark:border-amber-900/40';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-100 dark:border-blue-900/40';
      default:
        return 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400 border-slate-100 dark:border-slate-800';
    }
  };

  // Helper styles for Recommended Actions
  const getActionBadgeStyles = (action: RecommendationResult['recommendedAction']) => {
    switch (action) {
      case 'ESCALATION':
        return 'bg-rose-600 text-white';
      case 'VISIT':
        return 'bg-blue-600 text-white';
      case 'PHONE_CALL':
        return 'bg-cyan-600 text-white';
      case 'REMINDER':
        return 'bg-indigo-600 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  // Format activity relative or short times
  const formatActivityTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  // Render Skeleton / Loading State
  if (isLoading && !isManualRefreshing) {
    return (
      <div className="space-y-6 py-6 animate-pulse select-none">
        <div className="h-16 bg-slate-200 dark:bg-slate-900 rounded-2xl w-3/4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-20 bg-slate-200 dark:bg-slate-900 rounded-2xl"></div>
          ))}
        </div>
        <div className="h-44 bg-slate-200 dark:bg-slate-900 rounded-2xl"></div>
        <div className="h-60 bg-slate-200 dark:bg-slate-900 rounded-2xl"></div>
      </div>
    );
  }

  // Render Error / Recovery State
  if (errorState || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-900 shadow-sm max-w-md mx-auto select-none my-12">
        <div className="w-14 h-14 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-600 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 mb-1.5">Kesalahan Memuat Dasbor</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {errorState || 'Sistem mengalami kegagalan saat menyusun data kalkulasi penagihan.'}
        </p>
        <button 
          onClick={() => loadDashboardData()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Coba Muat Ulang Database
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 select-none animate-fade-in">
      
      {/* 1. HEADER WIDGET */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">{data.greeting}</span>
          <h1 id="dashboard-collector-title" className="text-xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            {data.collectorName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {data.currentDate}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Offline / Online Status */}
          <div className={`px-2.5 py-1.5 rounded-full border text-[10px] font-bold flex items-center gap-1.5 ${
            isOnline 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40' 
              : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40'
          }`}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Sistem Online' : 'Mode Offline'}
          </div>

          {/* Sync Pending Status */}
          <button
            onClick={handleSyncClick}
            disabled={isSyncing || data.pendingSyncCount === 0}
            className={`px-2.5 py-1.5 rounded-full border text-[10px] font-bold flex items-center gap-1.5 transition-all ${
              data.pendingSyncCount > 0
                ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40 cursor-pointer hover:bg-red-100'
                : 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-800 opacity-80 cursor-default'
            }`}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-red-600" />
                <span>Mensinkronkan... {syncProgress}%</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 text-red-600" />
                <span>
                  {data.pendingSyncCount > 0 ? `${data.pendingSyncCount} Tertunda Sync` : 'Sinkron Sempurna'}
                </span>
              </>
            )}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors"
            title="Muat ulang data komando"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. TODAY SUMMARY WIDGET */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
          Ringkasan Operasional Hari Ini
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Customers Assigned */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-bold uppercase">Nasabah</span>
            </div>
            <div className="space-y-0.5">
              <span className="block text-xl font-black text-slate-900 dark:text-slate-50">
                {data.metrics.customersAssigned}
              </span>
              <span className="block text-[10px] text-slate-500">Nasabah ditugaskan</span>
            </div>
          </div>

          {/* Visits Scheduled & Completed */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase">Kunjungan</span>
            </div>
            <div className="space-y-0.5">
              <span className="block text-xl font-black text-slate-900 dark:text-slate-50">
                {data.metrics.visitsCompleted} <span className="text-xs font-normal text-slate-400">/ {data.metrics.visitsScheduled}</span>
              </span>
              <span className="block text-[10px] text-slate-500">Tercapai hari ini</span>
            </div>
          </div>

          {/* Commitments Due */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-bold uppercase">Janji Bayar</span>
            </div>
            <div className="space-y-0.5">
              <span className="block text-xl font-black text-slate-900 dark:text-slate-50">
                {data.metrics.commitmentsDue}
              </span>
              <span className="block text-[10px] text-slate-500">Jatuh tempo hari ini</span>
            </div>
          </div>

          {/* Payments Recorded */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <Wallet className="w-4 h-4 text-purple-500" />
              <span className="text-[10px] font-bold uppercase">Setoran</span>
            </div>
            <div className="space-y-0.5">
              <span className="block text-xl font-black text-slate-900 dark:text-slate-50">
                {data.metrics.paymentsRecorded}
              </span>
              <span className="block text-[10px] text-slate-500">Pembayaran dicatat</span>
            </div>
          </div>
        </div>

        {/* Supplementary Summary Values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-[10px] text-slate-400 font-extrabold uppercase">Total Outstanding Kelolaan</span>
              <span className="block text-sm font-black text-slate-900 dark:text-slate-50">{formatCurrency(data.metrics.outstandingAmount)}</span>
            </div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">100% Luring</span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-[10px] text-slate-400 font-extrabold uppercase">Pemulihan Bulanan</span>
              <span className="block text-sm font-black text-emerald-600">{formatCurrency(data.metrics.collectedAmount || 0)}</span>
            </div>
            <span className="text-xs font-bold text-slate-500">Target: {data.metrics.recoveryPercentage}%</span>
          </div>
        </div>
      </div>

      {/* 3. PRIORITY QUEUE (INTELLIGENCE DISPATCH) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-blue-600 animate-pulse" /> Antrean Prioritas Hari Ini
          </h3>
          <button 
            onClick={() => navigate('/intel')}
            className="text-xs font-extrabold text-blue-600 hover:underline flex items-center gap-0.5"
          >
            Buka Engine <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* BR-07: Target warning banner */}
        {(data as any).targetWarningActive && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-amber-800 dark:text-amber-400 text-sm uppercase tracking-wide">⚠️ Peringatan Target 14.00</div>
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Realisasi baru {data.recovery.recoveryPercentage}% dari target harian ({formatCurrency(data.recovery.dailyTarget)}). 
                Kunjungi account bernilai besar sekarang!
              </div>
            </div>
          </div>
        )}

        {data.priorityQueue.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 text-center text-slate-400 dark:text-slate-500 text-xs font-semibold">
            Semua nasabah berada dalam kondisi aman. Tidak ada prioritas tinggi tersisa.
          </div>
        ) : (
          <div className="space-y-3">
            {data.priorityQueue.map((item, index) => (
              <div 
                key={item.customerId} 
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm hover:border-blue-200 dark:hover:border-slate-700 transition-all space-y-3 relative overflow-hidden"
              >
                {/* Ranking tag */}
                <div className="absolute right-0 top-0 bg-blue-500 text-white font-black text-[9px] px-2 py-0.5 rounded-bl-lg">
                  PRIO #{index + 1}
                </div>

                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 block">{item.contractNumber}</span>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-50">{item.customerName}</h4>
                  </div>

                  <div className="text-right pr-6">
                    <span className="block text-xs font-black text-blue-600">{item.priorityScore.toFixed(0)} Pts</span>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase">Skor Prioritas</span>
                  </div>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${getRiskBadgeStyles(item.riskLevel)}`}>
                    RISIKO {item.riskLevel}
                  </span>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded text-white ${getActionBadgeStyles(item.recommendedAction)}`}>
                    {item.recommendedAction}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Tunggakan: Rp {item.outstandingBalance.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {item.daysOverdue} DPD
                  </span>
                </div>

                {/* Reason Explanation card */}
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-900">
                  <strong className="text-[10px] text-blue-500 block uppercase font-black tracking-wide mb-0.5">Alasan Rekomendasi</strong>
                  {item.recommendationReason}
                </p>

                {/* Action button */}
                <div className="flex justify-end gap-2 pt-1 border-t border-slate-50 dark:border-slate-800">
                  <button 
                    onClick={() => {
                      // Navigate to customers list and trigger search for this customer ID to open detail
                      navigate(`/customers?search=${item.customerId}`);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Mulai Kunjungan Lapangan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. TODAY'S COMMITMENTS WIDGET */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-amber-500" /> Komitmen & Janji Bayar Hari Ini
          </h3>
          <button 
            onClick={() => navigate('/commitments')}
            className="text-xs font-extrabold text-blue-600 hover:underline"
          >
            Lihat Semua PTP
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-900">
            <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Hari Ini</span>
            <span className="text-lg font-black text-slate-900 dark:text-slate-50">{data.commitments.dueToday}</span>
          </div>

          <div className="p-3 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
            <span className="block text-[9px] text-emerald-600 font-extrabold uppercase">Terealisasi</span>
            <span className="text-lg font-black">{data.commitments.completedToday}</span>
          </div>

          <div className="p-3 bg-red-50 text-red-900 dark:bg-red-950/20 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/40">
            <span className="block text-[9px] text-red-600 font-extrabold uppercase">Meleset (Broken)</span>
            <span className="text-lg font-black">{data.commitments.brokenCommitments}</span>
          </div>

          <div className="p-3 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-900/40">
            <span className="block text-[9px] text-amber-600 font-extrabold uppercase">Overdue</span>
            <span className="text-lg font-black">{data.commitments.overdue}</span>
          </div>
        </div>

        <button 
          onClick={() => navigate('/commitments')}
          className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold py-3 rounded-xl border border-slate-200 dark:border-slate-700 transition-all shadow-xs"
        >
          Kelola Portofolio Janji Bayar (PTP)
        </button>
      </div>

      {/* 5. TODAY'S VISITS STATUS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-500" /> Status Kunjungan Lapangan
          </h3>
          <button 
            onClick={() => navigate('/visits')}
            className="text-xs font-extrabold text-blue-600 hover:underline"
          >
            Buka Riwayat
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5 text-center">
          <div className="space-y-1">
            <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Direncanakan</span>
            <span className="block text-base font-black text-slate-900 dark:text-slate-50">{data.visits.scheduled}</span>
          </div>
          <div className="space-y-1">
            <span className="block text-[9px] text-blue-500 font-extrabold uppercase">Berjalan</span>
            <span className="block text-base font-black text-blue-600">{data.visits.inProgress}</span>
          </div>
          <div className="space-y-1">
            <span className="block text-[9px] text-emerald-500 font-extrabold uppercase">Selesai</span>
            <span className="block text-base font-black text-emerald-600">{data.visits.completed}</span>
          </div>
          <div className="space-y-1">
            <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Batal</span>
            <span className="block text-base font-black text-slate-400">{data.visits.cancelled}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => navigate('/customers')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 text-xs font-bold py-3 rounded-xl border border-slate-200 dark:border-slate-700 transition-all shadow-xs"
          >
            Lihat Peta Lokasi
          </button>
          <button 
            onClick={() => navigate('/visits')}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors shadow-sm"
          >
            Aktifkan Pelacak GPS
          </button>
        </div>
      </div>

      {/* 6. OPERATIONAL ALERTS PANEL */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-500" /> Sinyal & Peringatan Operasional
        </h3>

        {/* Counter breakdown bar */}
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-bold">
          <div className="p-2 bg-red-50 text-red-600 dark:bg-red-950/20 rounded-lg">
            <span className="block text-[8px] font-extrabold uppercase opacity-70">Kritis</span>
            <span>{data.alertsSummary.criticalCustomers}</span>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 dark:bg-amber-950/20 rounded-lg">
            <span className="block text-[8px] font-extrabold uppercase opacity-70">Janji Patah</span>
            <span>{data.alertsSummary.brokenCommitments}</span>
          </div>
          <div className="p-2 bg-slate-50 text-slate-600 dark:bg-slate-800 rounded-lg">
            <span className="block text-[8px] font-extrabold uppercase opacity-70">Overdue</span>
            <span>{data.alertsSummary.overdueVisits}</span>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/20 rounded-lg">
            <span className="block text-[8px] font-extrabold uppercase opacity-70">Follow Up</span>
            <span>{data.alertsSummary.pendingFollowUp}</span>
          </div>
          <div className="p-2 bg-slate-50 text-slate-500 dark:bg-slate-800 rounded-lg">
            <span className="block text-[8px] font-extrabold uppercase opacity-70">Sync</span>
            <span>{data.alertsSummary.pendingSync}</span>
          </div>
        </div>

        {/* Alert list notifications */}
        <div className="space-y-2">
          {data.alertsList.length === 0 ? (
            <div className="text-center py-2 text-slate-400 text-xs">
              Tidak ada sinyal bahaya hari ini. Semua parameter operasional aman.
            </div>
          ) : (
            data.alertsList.slice(0, 3).map((alert) => (
              <div 
                key={alert.id}
                className={`p-3 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-red-50 border-red-100 text-red-800 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400'
                    : alert.severity === 'WARNING'
                    ? 'bg-amber-50 border-amber-100 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400'
                    : 'bg-blue-50 border-blue-100 text-blue-850 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-400'
                }`}
              >
                {alert.severity === 'CRITICAL' ? (
                  <Flame className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <span className="font-extrabold block">{alert.message}</span>
                  <span className="block text-[11px] opacity-90">{alert.details}</span>
                  {alert.customerName && (
                    <span className="text-[10px] font-bold underline block mt-1 cursor-pointer" onClick={() => navigate(`/customers?search=${alert.customerId}`)}>
                      Nasabah: {alert.customerName}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 7. RECOVERY PROGRESS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-emerald-500" /> Target Pemulihan Harian (Recovery)
        </h3>

        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <div className="space-y-0.5">
              <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Telah Terkumpul Hari Ini</span>
              <span className="block text-lg font-black text-emerald-600">{formatCurrency(data.recovery.collectedToday)}</span>
            </div>
            <div className="text-right space-y-0.5">
              <span className="block text-[9px] text-slate-400 font-extrabold uppercase">Sisa Target Hari Ini</span>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {formatCurrency(data.recovery.remainingTarget)} <span className="text-[10px] text-slate-400 font-normal">dari {formatCurrency(data.recovery.dailyTarget)}</span>
              </span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3.5 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${data.recovery.recoveryPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] font-black text-slate-400">
              <span>0% Mulai</span>
              <span className="text-emerald-600">{data.recovery.recoveryPercentage}% Tercapai</span>
              <span>100% Target Harian</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. RECENT ACTIVITIES FEED */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <History className="w-4 h-4 text-purple-500" /> Catatan Aktivitas Terbaru
        </h3>

        <div className="relative border-l border-slate-100 dark:border-slate-800 pl-4 ml-2 space-y-5 py-2">
          {data.recentActivities.map((act) => (
            <div key={act.id} className="relative space-y-1 text-xs">
              {/* Chronological dot indicator */}
              <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                act.type === 'PAYMENT' 
                  ? 'bg-emerald-500' 
                  : act.type === 'COMMITMENT' 
                  ? 'bg-amber-500' 
                  : act.type === 'VISIT' 
                  ? 'bg-blue-500' 
                  : 'bg-slate-400'
              }`}></span>

              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-mono">{formatActivityTime(act.timestamp)}</span>
                <span className="text-[10px] font-bold text-slate-500 max-w-[150px] truncate">{act.customerName}</span>
              </div>

              <div className="space-y-0.5">
                <span className="block font-extrabold text-slate-800 dark:text-slate-200">{act.title}</span>
                <span className="block text-slate-500 dark:text-slate-400 leading-relaxed">{act.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 9. QUICK ACTIONS ROUTING */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Aksi Cepat Lapangan
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Start Visit Route */}
          <button 
            onClick={() => navigate('/customers')}
            className="p-4 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 text-blue-800 dark:text-blue-400 rounded-xl border border-blue-100/60 dark:border-blue-900/30 text-center space-y-2 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer"
          >
            <MapPin className="w-6 h-6 text-blue-600 shrink-0" />
            <span className="block text-xs font-black">Mulai Kunjungan</span>
            <span className="block text-[9px] opacity-75 leading-tight">Buka daftar navigasi peta</span>
          </button>

          {/* Search Customer Route */}
          <button 
            onClick={() => navigate('/customers')}
            className="p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-300 rounded-xl border border-slate-100 dark:border-slate-800 text-center space-y-2 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer"
          >
            <Search className="w-6 h-6 text-slate-600 shrink-0" />
            <span className="block text-xs font-black">Cari Nasabah</span>
            <span className="block text-[9px] opacity-75 leading-tight">Temukan debitur portofolio</span>
          </button>

          {/* Record Payment Route */}
          <button 
            onClick={() => navigate('/payments')}
            className="p-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-850 dark:text-emerald-400 rounded-xl border border-emerald-100/60 dark:border-emerald-900/30 text-center space-y-2 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer"
          >
            <Wallet className="w-6 h-6 text-emerald-600 shrink-0" />
            <span className="block text-xs font-black">Rekam Setoran</span>
            <span className="block text-[9px] opacity-75 leading-tight">Buat tanda terima kuitansi</span>
          </button>

          {/* Create Commitment Route */}
          <button 
            onClick={() => navigate('/commitments')}
            className="p-4 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-amber-850 dark:text-amber-400 rounded-xl border border-amber-100/60 dark:border-amber-900/30 text-center space-y-2 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer"
          >
            <CheckSquare className="w-6 h-6 text-amber-600 shrink-0" />
            <span className="block text-xs font-black">Buat Janji Bayar</span>
            <span className="block text-[9px] opacity-75 leading-tight">Set jadwal PTP baru</span>
          </button>
        </div>

        {/* Sync Status Button inside Quick Actions */}
        <div className="pt-2">
          <button 
            onClick={() => navigate('/sync')}
            className="w-full bg-slate-900 dark:bg-slate-950 text-white hover:bg-slate-950 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <BrainCircuit className="w-4 h-4 text-blue-400" /> Buka Pusat Sinkronisasi & Riwayat
          </button>
        </div>
      </div>

    </div>
  );
};

export default DashboardScreen;
