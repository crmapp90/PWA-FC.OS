import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  TrendingUp, 
  Users, 
  MapPin, 
  CheckSquare, 
  CircleDollarSign, 
  Calendar, 
  Search, 
  SlidersHorizontal, 
  Download, 
  Printer, 
  Camera, 
  Clock, 
  Database, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw,
  Plus,
  Trash2,
  Bookmark,
  Activity,
  History,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Info
} from 'lucide-react';
import { useStore } from '../../core/store';
import { db } from '../../core/database';
import { logger } from '../../core/logger';
import { AnalyticsEngine } from '../../core/services/AnalyticsEngine';
import { ExportService } from '../../core/services/ExportService';
import { formatCurrency } from '../../shared/utils/formatters';
import { 
  OperationalReportData, 
  ReportFilter, 
  ReportSnapshot,
  ScheduledReportTask 
} from '../../types/reports';
import { ReusableCard, LoadingWidget, ErrorWidget } from '../../shared/components/BaseComponents';
import { motion, AnimatePresence } from 'motion/react';

export const ReportsScreen: React.FC = () => {
  const { activeCollector, isOnline } = useStore();

  // 1. FILTER STATES
  const todayStr = new Date().toISOString().substring(0, 10);
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const [dateStart, setDateStart] = useState<string>(thirtyDaysAgoStr);
  const [dateEnd, setDateEnd] = useState<string>(todayStr);
  const [collectorId, setCollectorId] = useState<string>('ALL');
  const [area, setArea] = useState<string>('ALL');
  const [risk, setRisk] = useState<string>('ALL');
  const [priority, setPriority] = useState<string>('ALL');
  const [customerStatus, setCustomerStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'highest_recovery' | 'lowest_recovery' | 'highest_productivity' | 'newest' | 'oldest' | 'alphabetical'>('highest_recovery');

  // Filter lists fetched dynamically
  const [collectorsList, setCollectorsList] = useState<{ id: string; fullName: string }[]>([]);
  const [areasList, setAreasList] = useState<string[]>([]);

  // 2. MAIN REPORT DATA STATE
  const [reportData, setReportData] = useState<OperationalReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string | null>(null);

  // 3. UI TAB STATES
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trends' | 'portfolio' | 'collectors' | 'system' | 'snapshots'>('dashboard');

  // 4. SNAPSHOTS AND SCHEDULER STATES
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [snapTitle, setSnapTitle] = useState<string>('');
  const [snapDesc, setSnapDesc] = useState<string>('');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);
  const [snapshotSuccessMsg, setSnapshotSuccessMsg] = useState<string | null>(null);

  // Scheduled Reports
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledReportTask[]>([]);
  const [newSchType, setNewSchType] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [newSchRecipients, setNewSchRecipients] = useState<string>('');

  // 5. STRESS BENCHMARK STATES
  const [benchSize, setBenchSize] = useState<number>(10000);
  const [benchResult, setBenchResult] = useState<any | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);

  // Load dynamic lists
  useEffect(() => {
    async function loadFilters() {
      try {
        const [customers, dbCollectors] = await Promise.all([
          db.customers.toArray(),
          db.collectors.toArray()
        ]);

        // Unique areas
        const uniqueAreas = Array.from(new Set(customers.map(c => c.area).filter(Boolean))) as string[];
        setAreasList(uniqueAreas.sort());

        // Unique collectors
        const collectorsMap = new Map<string, string>();
        dbCollectors.forEach(c => collectorsMap.set(c.id, c.fullName));
        
        const colList = Array.from(collectorsMap.entries()).map(([id, name]) => ({
          id,
          fullName: name
        }));
        setCollectorsList(colList);
      } catch (err) {
        logger.error('ReportsScreen', 'Failed to load report filter items', err);
      }
    }
    loadFilters();
  }, []);

  // Primary Generator Trigger
  const triggerGenerateReport = async (silent = false) => {
    if (!silent) setIsLoadingReport(true);
    setReportError(null);
    try {
      const filters: ReportFilter = {
        dateRange: { start: dateStart, end: dateEnd },
        collectorId,
        area,
        risk,
        priority,
        customerStatus,
        searchQuery,
        sortBy
      };

      const result = await AnalyticsEngine.generateReport(filters);
      setReportData(result);
    } catch (err: any) {
      logger.error('ReportsScreen', 'Error compiling analytics report', err);
      setReportError(err?.message || 'Gagal menghitung matriks laporan operasional.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Load report on first mount and filter changes
  useEffect(() => {
    triggerGenerateReport();
    loadSnapshots();
    loadScheduledTasks();
  }, [collectorId, area, risk, priority, customerStatus, sortBy]);

  const loadSnapshots = async () => {
    const list = await AnalyticsEngine.getSnapshots();
    setSnapshots(list);
  };

  const loadScheduledTasks = async () => {
    const list = await AnalyticsEngine.getScheduledReports();
    setScheduledTasks(list);
  };

  // Handle Save Snapshot
  const handleSaveSnapshotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportData) return;
    if (!snapTitle.trim()) {
      alert('Judul snapshot laporan wajib diisi!');
      return;
    }

    setIsSavingSnapshot(true);
    try {
      const result = await AnalyticsEngine.saveSnapshot(
        snapTitle,
        snapDesc || 'Disimpan secara offline.',
        'CUSTOM',
        reportData
      );

      if (result.success) {
        setSnapshotSuccessMsg('Snapshot laporan berhasil disimpan di memori luring!');
        setSnapTitle('');
        setSnapDesc('');
        loadSnapshots();
        setTimeout(() => setSnapshotSuccessMsg(null), 4000);
      } else {
        alert(result.error?.message || 'Gagal menyimpan snapshot.');
      }
    } catch (err) {
      logger.error('ReportsScreen', 'Snapshot save failed', err);
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  // Handle Delete Snapshot
  const handleDeleteSnapshot = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus snapshot laporan ini?')) {
      const res = await AnalyticsEngine.deleteSnapshot(id);
      if (res.success) {
        loadSnapshots();
      }
    }
  };

  // Handle Create Scheduler Foundation
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const cronMap = {
      DAILY: '0 8 * * *',
      WEEKLY: '0 8 * * 1',
      MONTHLY: '0 8 1 * *'
    };

    const task: any = {
      title: `Kirim Laporan ${newSchType} ke ${newSchRecipients || 'Supervisor'}`,
      reportType: newSchType,
      recipients: [newSchRecipients || 'spv@fcos.co.id'],
      cronExpression: cronMap[newSchType],
      isActive: true,
      nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const res = await AnalyticsEngine.saveScheduledReport(task);
    if (res.success) {
      setNewSchRecipients('');
      loadScheduledTasks();
    }
  };

  // Handle Load Snapshot back into View
  const handleLoadSnapshotBack = (snap: ReportSnapshot) => {
    // Convert snapshot structure back into ReportData for rendering
    const remappedData: OperationalReportData = {
      reportId: snap.id,
      reportName: `Membuka Snapshot: ${snap.title}`,
      generatedAt: snap.generatedTime,
      filters: snap.filters,
      kpis: snap.kpis,
      trends: snap.chartsMetadata.trends,
      portfolio: {
        portfolioSize: snap.kpis.customersAssigned,
        outstandingBalance: snap.summary.totalRecovery / (snap.kpis.recoveryPercentage ? snap.kpis.recoveryPercentage/100 : 0.1),
        customerStatusDistribution: snap.chartsMetadata.portfolio.statusKeys.reduce((acc, key, i) => {
          acc[key] = snap.chartsMetadata.portfolio.statusValues[i];
          return acc;
        }, {} as Record<string, number>),
        priorityDistribution: snap.chartsMetadata.portfolio.priorityKeys.reduce((acc, key, i) => {
          acc[key] = snap.chartsMetadata.portfolio.priorityValues[i];
          return acc;
        }, {} as Record<string, number>),
        riskDistribution: snap.chartsMetadata.portfolio.riskKeys.reduce((acc, key, i) => {
          acc[key] = snap.chartsMetadata.portfolio.riskValues[i];
          return acc;
        }, {} as Record<string, number>),
        dpdDistribution: { '30': 0, '60': 0, '90': 0, '90+': 0 },
        recoveryDistribution: {}
      },
      areaAnalysis: snap.chartsMetadata.areas.map(a => ({
        areaName: a.name,
        visitsCount: a.visits,
        recoveryAmount: a.recovery,
        outstandingAmount: 0,
        priorityLevel: 'HIGH',
        commitmentSuccessRate: 0
      })),
      collectorAnalysis: [],
      activitySummary: { totalActivities: 0, byType: {}, recent: [] },
      syncSummary: { pendingSyncCount: 0, syncedCount: 0, failedCount: 0, totalSyncItems: 0 },
      auditSummary: { totalLogs: 0, errorsCount: 0, warningsCount: 0, infoCount: 0 }
    };

    setReportData(remappedData);
    setActiveTab('dashboard');
    alert(`Snapshot "${snap.title}" berhasil dimuat kembali ke dasbor laporan!`);
  };

  // Handle Stress Test Benchmark execution
  const runStressBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchResult(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 400)); // allow rendering thread to spin
      const res = await AnalyticsEngine.benchmarkEngine(benchSize);
      setBenchResult(res);
    } catch (err) {
      logger.error('ReportsScreen', 'Benchmark failed', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // SVG Helper calculation fields
  const maxTrendValue = useMemo(() => {
    if (!reportData || reportData.trends.length === 0) return 100;
    return Math.max(...reportData.trends.map(t => Math.max(t.recovery, t.visits * 1000000, 100)));
  }, [reportData]);

  return (
    <div className="space-y-6 pb-20 select-none animate-fade-in">
      
      {/* HEADER WIDGET */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold uppercase text-[10px] tracking-wider">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Operational Analytics Engine v2.0</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-50 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" /> Operational Reports
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Analisis metrik KPI, tren penagihan, kualifikasi portofolio luring 100%.
          </p>
        </div>

        {/* Dynamic export actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => reportData && ExportService.printReport(reportData)}
            disabled={!reportData}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="Print / Save PDF"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak
          </button>
          
          <button 
            onClick={() => reportData && ExportService.exportToExcel(reportData)}
            disabled={!reportData}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="Export Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Excel
          </button>

          <button 
            onClick={() => triggerGenerateReport()}
            className="p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/30 transition-colors"
            title="Refresh database report"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingReport ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SEARCH & FILTERS CONTROLS */}
      <ReusableCard className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" /> Filter & Parameter Laporan
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">Offline Compiled</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Date Range Start */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Mulai Tanggal</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input 
                type="date" 
                value={dateStart} 
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Date Range End */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Hingga Tanggal</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input 
                type="date" 
                value={dateEnd} 
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Collector selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Kolektor Lapangan</label>
            <select 
              value={collectorId} 
              onChange={(e) => setCollectorId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="ALL">Semua Kolektor (ALL)</option>
              {collectorsList.map(c => (
                <option key={c.id} value={c.id}>{c.fullName} ({c.id})</option>
              ))}
            </select>
          </div>

          {/* Area Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Wilayah Penugasan (Area)</label>
            <select 
              value={area} 
              onChange={(e) => setArea(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="ALL">Semua Wilayah (ALL)</option>
              {areasList.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Risk Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Kategori Risiko (DPD Bucket)</label>
            <select 
              value={risk} 
              onChange={(e) => setRisk(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="ALL">Semua Risiko (ALL)</option>
              <option value="30">Bucket 30 (Overdue &lt; 30)</option>
              <option value="60">Bucket 60 (Overdue &lt; 60)</option>
              <option value="90">Bucket 90 (Overdue &lt; 90)</option>
              <option value="90+">Bucket 90+ (Critical Risk)</option>
            </select>
          </div>

          {/* Priority selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500">Tingkat Prioritas</label>
            <select 
              value={priority} 
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
            >
              <option value="ALL">Semua Prioritas (ALL)</option>
              <option value="LOW">LOW (Rendah)</option>
              <option value="MEDIUM">MEDIUM (Sedang)</option>
              <option value="HIGH">HIGH (Tinggi)</option>
              <option value="CRITICAL">CRITICAL (Mendesak)</option>
            </select>
          </div>
        </div>

        {/* Quick Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari berdasarkan nama nasabah, nomor kontrak, atau wilayah..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs outline-none focus:border-blue-500"
            />
          </div>

          <button 
            onClick={() => triggerGenerateReport()}
            className="bg-blue-650 hover:bg-blue-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Saring Laporan
          </button>
        </div>
      </ReusableCard>

      {/* SECTIONS NAVIGATION BAR */}
      <div className="flex items-center overflow-x-auto gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 scrollbar-none">
        {[
          { id: 'dashboard', label: 'Dasbor KPI', icon: <Sparkles className="w-4 h-4" /> },
          { id: 'trends', label: 'Analisis Tren', icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'portfolio', label: 'Kategori & Wilayah', icon: <MapPin className="w-4 h-4" /> },
          { id: 'collectors', label: 'Kinerja Kolektor', icon: <Users className="w-4 h-4" /> },
          { id: 'system', label: 'Integritas Sistem', icon: <Database className="w-4 h-4" /> },
          { id: 'snapshots', label: 'Snapshots & Cadangan', icon: <Bookmark className="w-4 h-4" /> }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl font-extrabold text-xs tracking-wide transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-white hover:bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* MAIN DATA RENDERING */}
      <AnimatePresence mode="wait">
        {isLoadingReport ? (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="py-12"
          >
            <LoadingWidget message="Menghitung algoritma KPI & menganalisis transaksi luring..." />
          </motion.div>
        ) : reportError ? (
          <ErrorWidget 
            title="Kegagalan Analytics Engine" 
            message={reportError} 
            onRetry={() => triggerGenerateReport()} 
          />
        ) : !reportData ? (
          <div className="text-center py-12 text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-2xl">
            Tidak ada laporan operasional yang terkompilasi.
          </div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* 1. DASBOR KPI TAB */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                
                {/* Score and Core Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Collection Productivity Score Badge */}
                  <div className="md:col-span-1 bg-gradient-to-br from-blue-900 to-indigo-950 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-blue-300 font-extrabold uppercase tracking-widest">Enterprise Standard</span>
                      <h3 className="text-sm font-bold">Skor Produktivitas</h3>
                    </div>
                    
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black">{reportData.kpis.collectionProductivityScore}</span>
                      <span className="text-lg text-blue-300 font-bold">/ 100</span>
                    </div>

                    <div className="space-y-2">
                      <div className="w-full bg-blue-950/60 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${reportData.kpis.collectionProductivityScore}%` }}
                        ></div>
                      </div>
                      <p className="text-[10px] text-blue-200 leading-normal font-medium">
                        Kombinasi rasio kontak (30%), keberhasilan komitmen (30%), dan persentase pemulihan target regional (40%).
                      </p>
                    </div>
                  </div>

                  {/* Recovery Metrics */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <CircleDollarSign className="w-5 h-5 text-emerald-500" />
                      <span className="text-[10px] font-black uppercase">Dana Dipulihkan</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-2xl font-black text-slate-900 dark:text-slate-50">
                        {formatCurrency(reportData.kpis.recoveryAmount)}
                      </span>
                      <span className="block text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Target tercapai: {reportData.kpis.recoveryPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Jumlah pengurangan saldo outstanding bersih dari total slip setoran yang dicatat luring.
                    </p>
                  </div>

                  {/* Visit Metrics */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <Users className="w-5 h-5 text-blue-500" />
                      <span className="text-[10px] font-black uppercase">Efektivitas Kunjungan</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-2xl font-black text-slate-900 dark:text-slate-50">
                        {reportData.kpis.customersVisited} <span className="text-sm font-normal text-slate-400">/ {reportData.kpis.customersAssigned}</span>
                      </span>
                      <span className="block text-xs font-bold text-blue-600">
                        Rasio Keberhasilan Kontak: {reportData.kpis.visitSuccessRate.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Nasabah dikunjungi setidaknya satu kali dengan pencatatan hasil kesepakatan penagihan.
                    </p>
                  </div>
                </div>

                {/* Additional KPI Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-1">
                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Durasi Rata-rata</span>
                    <span className="block text-base font-black text-slate-800 dark:text-slate-100">
                      {Math.round(reportData.kpis.averageVisitDuration / 60)} Menit
                    </span>
                    <span className="block text-[10px] text-slate-400">Per kunjungan selesai</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-1">
                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Janji Bayar Dibuat</span>
                    <span className="block text-base font-black text-slate-800 dark:text-slate-100">
                      {reportData.kpis.ptpCreated} Komitmen
                    </span>
                    <span className="block text-[10px] text-slate-400">Terdaftar di server lokal</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-1">
                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Janji Sukses (PTP)</span>
                    <span className="block text-base font-black text-emerald-600">
                      {reportData.kpis.ptpFulfilled} / {reportData.kpis.ptpCreated}
                    </span>
                    <span className="block text-[10px] text-slate-400">Rasio Sukses: {reportData.kpis.commitmentSuccessRate.toFixed(1)}%</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-1">
                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Setoran Masuk</span>
                    <span className="block text-base font-black text-slate-800 dark:text-slate-100">
                      {reportData.kpis.paymentsRecorded} Slip
                    </span>
                    <span className="block text-[10px] text-slate-400">Koleksi dana tunai / VA</span>
                  </div>
                </div>

                {/* Performance Summary Text Notes */}
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300">Ringkasan Evaluasi Kinerja Penagihan</h4>
                    <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed font-medium">
                      Petugas kolektor menunjukkan skor produktivitas sebesar <strong className="text-blue-900">{reportData.kpis.collectionProductivityScore}%</strong> dengan total perolehan dana sebesar <strong className="text-blue-900">{formatCurrency(reportData.kpis.recoveryAmount)}</strong> dari {reportData.kpis.paymentsRecorded} transaksi. Keberhasilan kontak di lapangan berada pada tingkat <strong className="text-blue-900">{reportData.kpis.visitSuccessRate.toFixed(1)}%</strong> dengan rata-rata durasi penanganan {Math.round(reportData.kpis.averageVisitDuration / 60)} menit per debitur.
                    </p>
                  </div>
                </div>

                {/* Quick snapshot form */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-blue-600" /> Simpan Hasil Laporan ke Snapshot Lokal
                  </h3>

                  <form onSubmit={handleSaveSnapshotSubmit} className="space-y-4">
                    {snapshotSuccessMsg && (
                      <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl">
                        {snapshotSuccessMsg}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500">Judul Snapshot (Contoh: Evaluasi Mingguan Juli)</label>
                        <input 
                          type="text" 
                          placeholder="Masukkan judul snapshot..."
                          value={snapTitle}
                          onChange={(e) => setSnapTitle(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500">Catatan / Deskripsi Snapshot</label>
                        <input 
                          type="text" 
                          placeholder="Masukkan catatan rincian evaluasi..."
                          value={snapDesc}
                          onChange={(e) => setSnapDesc(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSavingSnapshot}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {isSavingSnapshot ? 'Menyimpan...' : 'Ambil & Simpan Snapshot Laporan'}
                    </button>
                  </form>
                </ReusableCard>
              </div>
            )}

            {/* 2. ANALISIS TREN TAB */}
            {activeTab === 'trends' && (
              <div className="space-y-6">
                {/* Custom SVG Line Chart - Recovery Trend */}
                <ReusableCard className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-500" /> Tren Pemulihan Dana (Recovery Trend IDR)
                    </h3>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                      Total: {formatCurrency(reportData.kpis.recoveryAmount)}
                    </span>
                  </div>

                  {reportData.trends.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-semibold text-xs">
                      Data tren tidak mencukupi untuk rentang tanggal terpilih.
                    </div>
                  ) : (
                    <div className="w-full">
                      {/* Interactive Responsive SVG Line Chart */}
                      <svg viewBox="0 0 600 240" className="w-full h-auto overflow-visible select-none">
                        {/* Grid lines */}
                        <line x1="40" y1="20" x2="580" y2="20" stroke="#e2e8f0" strokeDasharray="3,3" />
                        <line x1="40" y1="70" x2="580" y2="70" stroke="#e2e8f0" strokeDasharray="3,3" />
                        <line x1="40" y1="120" x2="580" y2="120" stroke="#e2e8f0" strokeDasharray="3,3" />
                        <line x1="40" y1="170" x2="580" y2="170" stroke="#e2e8f0" strokeDasharray="3,3" />
                        <line x1="40" y1="210" x2="580" y2="210" stroke="#cbd5e1" strokeWidth="1.5" />

                        {/* Chart Line Mapping */}
                        {(() => {
                          const points = reportData.trends;
                          const count = points.length;
                          const widthPerPoint = count > 1 ? (540 / (count - 1)) : 540;
                          const maxVal = Math.max(...points.map(p => p.recovery), 100000);

                          const dPath = points.map((p, i) => {
                            const x = 40 + i * widthPerPoint;
                            const y = 210 - (p.recovery / maxVal) * 180;
                            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ');

                          const dArea = `${dPath} L ${40 + (count - 1) * widthPerPoint} 210 L 40 210 Z`;

                          return (
                            <>
                              {/* Filled Area Gradient */}
                              <defs>
                                <linearGradient id="recoveryGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={dArea} fill="url(#recoveryGrad)" />
                              
                              {/* Glowing Line */}
                              <path d={dPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                              {/* Target points dots */}
                              {points.map((p, i) => {
                                const x = 40 + i * widthPerPoint;
                                const y = 210 - (p.recovery / maxVal) * 180;
                                return (
                                  <g key={i} className="group cursor-pointer">
                                    <circle cx={x} cy={y} r="4" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
                                    <circle cx={x} cy={y} r="8" fill="#10b981" fillOpacity="0" className="hover:fill-opacity-15 transition-all" />
                                    <text x={x} y={y - 10} textAnchor="middle" className="text-[9px] font-bold fill-emerald-600 hidden group-hover:block bg-white dark:fill-slate-100">
                                      Rp {(p.recovery / 1000000).toFixed(1)}jt
                                    </text>
                                    <text x={x} y="226" textAnchor="middle" className="text-[8px] font-bold fill-slate-400 dark:fill-slate-500">
                                      {p.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}
                </ReusableCard>

                {/* Custom SVG Line Chart - Visits and PTPs Trends */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-blue-500" /> Tren Frekuensi Kunjungan & Komitmen Janji Bayar
                  </h3>

                  <div className="w-full">
                    <svg viewBox="0 0 600 240" className="w-full h-auto overflow-visible select-none">
                      <line x1="40" y1="20" x2="580" y2="20" stroke="#e2e8f0" strokeDasharray="3,3" />
                      <line x1="40" y1="120" x2="580" y2="120" stroke="#e2e8f0" strokeDasharray="3,3" />
                      <line x1="40" y1="210" x2="580" y2="210" stroke="#cbd5e1" strokeWidth="1.5" />

                      {(() => {
                        const points = reportData.trends;
                        const count = points.length;
                        const widthPerPoint = count > 1 ? (540 / (count - 1)) : 540;
                        const maxVal = Math.max(...points.map(p => Math.max(p.visits, p.commitments)), 5);

                        // Visits path (Blue)
                        const visitsPath = points.map((p, i) => {
                          const x = 40 + i * widthPerPoint;
                          const y = 210 - (p.visits / maxVal) * 180;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).join(' ');

                        // PTPs path (Amber)
                        const ptpsPath = points.map((p, i) => {
                          const x = 40 + i * widthPerPoint;
                          const y = 210 - (p.commitments / maxVal) * 180;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).join(' ');

                        return (
                          <>
                            {/* Blue Line (Visits) */}
                            <path d={visitsPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            
                            {/* Amber Line (Commitments) */}
                            <path d={ptpsPath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />

                            {/* Node points */}
                            {points.map((p, i) => {
                              const x = 40 + i * widthPerPoint;
                              const yV = 210 - (p.visits / maxVal) * 180;
                              const yP = 210 - (p.commitments / maxVal) * 180;

                              return (
                                <g key={i}>
                                  <circle cx={x} cy={yV} r="3" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" />
                                  <circle cx={x} cy={yP} r="3" fill="#ffffff" stroke="#f59e0b" strokeWidth="1.5" />
                                  <text x={x} y="226" textAnchor="middle" className="text-[8px] font-bold fill-slate-400 dark:fill-slate-500">
                                    {p.label}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    {/* Chart Legends */}
                    <div className="flex justify-center items-center gap-6 pt-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="w-3.5 h-1 bg-blue-600 rounded-full"></span>
                        <span>Frekuensi Kunjungan (Visits)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="w-3.5 h-1 bg-amber-500 rounded-full border-dashed border-t"></span>
                        <span>Kesepakatan Komitmen (Janji Bayar)</span>
                      </div>
                    </div>
                  </div>
                </ReusableCard>
              </div>
            )}

            {/* 3. CATEGORY & PORTFOLIO ANALYSIS TAB */}
            {activeTab === 'portfolio' && (
              <div className="space-y-6">
                
                {/* Area Performance Table */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" /> Distribusi & Produktivitas Berdasarkan Wilayah
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400">
                          <th className="py-3 px-3">Nama Wilayah</th>
                          <th className="py-3 px-3 text-right">Kunjungan</th>
                          <th className="py-3 px-3 text-right">Outstanding Terkelola</th>
                          <th className="py-3 px-3 text-right">Dana Dipulihkan</th>
                          <th className="py-3 px-3 text-right">Rasio Komitmen</th>
                          <th className="py-3 px-3">Risiko</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {reportData.areaAnalysis.map((item, index) => (
                          <tr key={item.areaName} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <td className="py-3.5 px-3 font-bold text-slate-800 dark:text-slate-100">
                              {item.areaName}
                            </td>
                            <td className="py-3.5 px-3 text-right font-semibold text-slate-600 dark:text-slate-300">
                              {item.visitsCount}
                            </td>
                            <td className="py-3.5 px-3 text-right font-bold text-slate-700 dark:text-slate-200">
                              {formatCurrency(item.outstandingAmount)}
                            </td>
                            <td className="py-3.5 px-3 text-right font-extrabold text-emerald-600">
                              {formatCurrency(item.recoveryAmount)}
                            </td>
                            <td className="py-3.5 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                              {item.commitmentSuccessRate.toFixed(1)}%
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                                {item.priorityLevel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ReusableCard>

                {/* Portfolio Status and Risk distribution charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Status distribution circular SVG arcs */}
                  <ReusableCard className="space-y-4">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                      Distribusi Status Debitur Kelolaan
                    </h3>
                    <div className="flex items-center justify-around gap-4">
                      {/* Pie chart representing STATUS */}
                      <svg viewBox="0 0 100 100" className="w-24 h-24 overflow-visible">
                        {(() => {
                          const dist = reportData.portfolio.customerStatusDistribution;
                          const total = (Object.values(dist) as number[]).reduce((a, b) => a + b, 0) || 1;
                          
                          let accumulatedAngle = 0;
                          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
                          const slices = Object.entries(dist).map(([key, val], i) => {
                            const percentage = (val as number) / total;
                            const angle = percentage * 360;
                            const startAngle = accumulatedAngle;
                            const endAngle = accumulatedAngle + angle;
                            accumulatedAngle += angle;

                            // Calculate coordinates
                            const x1 = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
                            const y1 = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
                            const x2 = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);
                            const y2 = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);

                            const largeArcFlag = angle > 180 ? 1 : 0;
                            const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                            return (
                              <path key={key} d={pathData} fill={colors[i % colors.length]} stroke="#ffffff" strokeWidth="1" />
                            );
                          });

                          return slices;
                        })()}
                      </svg>

                      {/* Legends */}
                      <div className="space-y-2.5 text-xs font-bold">
                        {Object.entries(reportData.portfolio.customerStatusDistribution).map(([key, val], i) => {
                          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }}></span>
                              <span className="text-slate-600 dark:text-slate-300">{key}: {val as number} Nasabah</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </ReusableCard>

                  {/* Priority distribution */}
                  <ReusableCard className="space-y-4">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                      Distribusi Prioritas Portofolio
                    </h3>
                    <div className="space-y-3 pt-2">
                      {Object.entries(reportData.portfolio.priorityDistribution).map(([key, val]) => {
                        const maxVal = Math.max(...(Object.values(reportData.portfolio.priorityDistribution) as number[]), 1);
                        const widthPct = ((val as number) / maxVal) * 100;
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-700 dark:text-slate-300">{key}</span>
                              <span className="text-slate-400">{val} Debitur</span>
                            </div>
                            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                                style={{ width: `${widthPct}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ReusableCard>
                </div>
              </div>
            )}

            {/* 4. FIELD COLLECTORS PERFORMANCE TAB */}
            {activeTab === 'collectors' && (
              <div className="space-y-6">
                
                {/* Collector performance analysis ranking */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-600" /> Peringkat Evaluasi Produktivitas Kolektor Lapangan
                  </h3>

                  {reportData.collectorAnalysis.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-semibold text-xs">
                      Tidak ada kolektor aktif terdeteksi dalam parameter filter terpilih.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {reportData.collectorAnalysis.map((col, index) => (
                        <div 
                          key={col.collectorId}
                          className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                        >
                          <div className="flex items-center gap-3">
                            {/* Rank Indicator */}
                            <div className="w-8 h-8 bg-blue-600 text-white font-extrabold rounded-full flex items-center justify-center text-xs shrink-0 shadow-sm">
                              #{index + 1}
                            </div>
                            <div className="space-y-0.5">
                              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{col.collectorName}</h4>
                              <p className="text-[10px] text-slate-400">ID: {col.collectorId} • Rerata {col.dailyProductivity} kunjungan / hari</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
                            <div className="space-y-0.5">
                              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Kunjungan</span>
                              <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">{col.visitCount} Kali</span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Koleksi Dana</span>
                              <span className="block text-xs font-extrabold text-emerald-600">{formatCurrency(col.recoveryAmount)}</span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Skor Kinerja</span>
                              <span className="block text-xs font-extrabold text-blue-600 dark:text-blue-400">{col.productivityScore} / 100</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ReusableCard>
              </div>
            )}

            {/* 5. SYSTEM INTEGRITY TAB */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                
                {/* Audit log warning breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Logs integrity */}
                  <ReusableCard className="space-y-4">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <History className="w-4 h-4 text-slate-400" /> Log Audit Keamanan Lapangan
                    </h3>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-1">
                        <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Pesan INFO</span>
                        <span className="block text-xl font-black text-slate-800 dark:text-slate-100">{reportData.auditSummary.infoCount}</span>
                      </div>
                      <div className="bg-red-50 text-red-800 border border-red-100 p-4 rounded-xl space-y-1">
                        <span className="block text-[9px] font-extrabold text-red-400 uppercase tracking-wider">Gagal/Peringatan</span>
                        <span className="block text-xl font-black text-red-600">
                          {reportData.auditSummary.errorsCount + reportData.auditSummary.warningsCount}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Metrik audit ditarik luring dari database lokal perangkat untuk menjamin kepatuhan aktivitas fisik kolektor.
                    </p>
                  </ReusableCard>

                  {/* Sync Status Summary */}
                  <ReusableCard className="space-y-4">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-blue-600" /> Status Sinkronisasi Antrean Cloud
                    </h3>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                        <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Tertunda</span>
                        <span className="block text-base font-black text-rose-600">{reportData.syncSummary.pendingSyncCount}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                        <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Terkirim</span>
                        <span className="block text-base font-black text-slate-800 dark:text-slate-200">{reportData.syncSummary.syncedCount}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl">
                        <span className="block text-[9px] font-extrabold text-slate-400 uppercase">Gagal</span>
                        <span className="block text-base font-black text-slate-800 dark:text-slate-200">{reportData.syncSummary.failedCount}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Menjamin integritas data luring sebelum transmisi aman ke pusat data.
                    </p>
                  </ReusableCard>
                </div>

                {/* Simulated Scheduler Settings */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" /> Penjadwal Pengiriman Otomatis (Report Scheduler Foundation)
                  </h3>

                  <form onSubmit={handleCreateSchedule} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500">Frekuensi Laporan</label>
                        <select 
                          value={newSchType} 
                          onChange={(e) => setNewSchType(e.target.value as any)}
                          className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                        >
                          <option value="DAILY">Daily Collection Report (Setiap Hari - 08.00 WIB)</option>
                          <option value="WEEKLY">Weekly Performance Report (Senin - 08.00 WIB)</option>
                          <option value="MONTHLY">Monthly Portfolio Report (Awal Bulan - 08.00 WIB)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500">Email Supervisor Penerima Laporan</label>
                        <input 
                          type="email" 
                          placeholder="spv@fcos.co.id"
                          value={newSchRecipients}
                          onChange={(e) => setNewSchRecipients(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      Aktifkan Penjadwalan Laporan
                    </button>
                  </form>

                  {/* Active schedulers list */}
                  {scheduledTasks.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Jadwal Pengiriman Aktif luring:</h4>
                      <div className="space-y-2">
                        {scheduledTasks.map(t => (
                          <div key={t.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs font-bold">
                            <div>
                              <span className="block text-slate-800 dark:text-slate-200">{t.title}</span>
                              <span className="block text-[10px] text-slate-400">Penerima: {t.recipients.join(', ')} • Cron: {t.cronExpression}</span>
                            </div>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[9px] uppercase tracking-wide">
                              Aktif (Active)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ReusableCard>
              </div>
            )}

            {/* 6. SNAPSHOTS TAB */}
            {activeTab === 'snapshots' && (
              <div className="space-y-6">
                
                {/* List of saved snapshots */}
                <ReusableCard className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                    Snapshot Laporan yang Tersimpan Luring
                  </h3>

                  {snapshots.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-2xl">
                      Belum ada snapshot laporan yang tersimpan dalam perangkat lokal ini.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {snapshots.map(snap => (
                        <div 
                          key={snap.id}
                          className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{snap.title}</h4>
                            <p className="text-xs text-slate-500 font-medium">{snap.description}</p>
                            <p className="text-[10px] text-slate-400">
                              Disimpan: {new Date(snap.generatedTime).toLocaleString('id-ID')} | {snap.summary.notes}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleLoadSnapshotBack(snap)}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-2 rounded-lg cursor-pointer"
                            >
                              Buka
                            </button>
                            <button 
                              onClick={() => handleDeleteSnapshot(snap.id)}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ReusableCard>

                {/* Performance benchmark stress test */}
                <ReusableCard className="space-y-4">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-slate-400" /> Stress Benchmark Laporan (Skala Besar)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Uji performa kompilasi algoritma reports engine di memori lokal terhadap ribuan data nasabah simulasi.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1 w-full">
                      <select 
                        value={benchSize} 
                        onChange={(e) => setBenchSize(Number(e.target.value))}
                        className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      >
                        <option value={10000}>Simulasi 10,000 Nasabah (Target &lt; 1 Detik)</option>
                        <option value={50000}>Simulasi 50,000 Nasabah (Target &lt; 2 Detik)</option>
                        <option value={100000}>Simulasi 100,000 Nasabah (Beban Maksimal Enterprise)</option>
                      </select>
                    </div>

                    <button 
                      onClick={runStressBenchmark}
                      disabled={isBenchmarking}
                      className="w-full sm:w-auto bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-black text-xs px-6 py-3 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {isBenchmarking ? 'Menjalankan Stress Test...' : 'Jalankan Stress Test'}
                    </button>
                  </div>

                  {benchResult && (
                    <div className="p-4 bg-slate-900 text-slate-50 font-mono text-xs rounded-xl space-y-3">
                      <div className="flex justify-between border-b border-slate-800 pb-1.5">
                        <span>Status Pengujian:</span>
                        <span className="text-emerald-400 font-bold">PASS (Kinerja Stabil)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 leading-loose">
                        <div>Kompilasi Report:</div>
                        <div className="text-right text-yellow-400">{benchResult.generationTimeMs} ms</div>
                        
                        <div>Dataset Nasabah:</div>
                        <div className="text-right">{benchResult.customersCount.toLocaleString()}</div>

                        <div>Dataset Kunjungan:</div>
                        <div className="text-right">{benchResult.visitsCount.toLocaleString()}</div>

                        <div>Dataset Pembayaran:</div>
                        <div className="text-right">{benchResult.paymentsCount.toLocaleString()}</div>

                        <div>Alokasi RAM:</div>
                        <div className="text-right">{benchResult.memoryAllocatedMb} MB</div>

                        <div>Throughput Kecepatan:</div>
                        <div className="text-right text-emerald-400">{benchResult.throughputKps.toLocaleString()} records/sec</div>
                      </div>
                    </div>
                  )}
                </ReusableCard>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReportsScreen;
