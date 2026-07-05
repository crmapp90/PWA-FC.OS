import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Play, 
  HelpCircle, 
  Sliders, 
  AlertTriangle, 
  ClipboardList, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  User, 
  Search, 
  DollarSign, 
  Clock, 
  ShieldAlert, 
  Activity, 
  Info, 
  Flame, 
  TrendingUp, 
  RefreshCw,
  BookOpen
} from 'lucide-react';
import { useStore } from '../../core/store';
import { db } from '../../core/database';
import { logger } from '../../core/logger';
import { 
  IntelligenceService, 
  RecommendationResult, 
  OperationalAlert, 
  WorkQueue, 
  IntelligenceConfig,
  RuleDefinition
} from '../../core/services/IntelligenceService';
import { formatCurrency } from '../../shared/utils/formatters';
import { 
  PrimaryButton, 
  SecondaryButton, 
  TextField, 
  ReusableCard 
} from '../../shared/components/BaseComponents';

export const IntelligenceScreen: React.FC = () => {
  const { activeCollector } = useStore();

  // Screen Tabs
  const [activeScreenTab, setActiveScreenTab] = useState<'queue' | 'alerts' | 'rules' | 'performance' | 'docs'>('queue');
  
  // Work Queue Sub-tabs
  const [queueSubTab, setQueueSubTab] = useState<keyof WorkQueue>('todaysVisits');

  // Loading & State
  const [isLoading, setIsLoading] = useState(true);
  const [analysisResults, setAnalysisResults] = useState<{
    recommendations: RecommendationResult[];
    alerts: OperationalAlert[];
    workQueue: WorkQueue;
    executionTimeMs: number;
    datasetStats: { customers: number; visits: number; payments: number; ptps: number };
  } | null>(null);

  // Search & Filter within results
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>('ALL');
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>('ALL');

  // Decision explanation modal / expand state
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  // Configuration form state
  const [config, setConfig] = useState<IntelligenceConfig | null>(null);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Benchmark stats state
  const [benchmarkSize, setBenchmarkSize] = useState<number>(10000);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  // Initialize data
  useEffect(() => {
    loadAnalysisData();
    loadConfigData();
  }, [activeCollector]);

  const loadAnalysisData = async () => {
    setIsLoading(true);
    try {
      const results = await IntelligenceService.runDailyAnalysis(activeCollector?.id);
      setAnalysisResults(results);
    } catch (err) {
      logger.error('IntelligenceScreen', 'Failed to load analysis', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfigData = async () => {
    try {
      const cfg = await IntelligenceService.getConfig();
      setConfig(cfg);
    } catch (err) {
      logger.error('IntelligenceScreen', 'Failed to load config', err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setIsConfigSaving(true);
    try {
      await IntelligenceService.saveConfig(config);
      setConfigMessage('Konfigurasi aturan berhasil disimpan offline.');
      setTimeout(() => setConfigMessage(null), 4000);
      
      // Recalculate based on new weights
      await loadAnalysisData();
    } catch (err) {
      logger.error('IntelligenceScreen', 'Failed to save config', err);
      setConfigMessage('Gagal menyimpan konfigurasi.');
    } finally {
      setIsConfigSaving(false);
    }
  };

  const handleResetConfig = async () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan semua bobot aturan ke standar pabrik?')) {
      const defaultCfg = await IntelligenceService.resetConfig();
      setConfig(defaultCfg);
      setConfigMessage('Bobot aturan berhasil dikembalikan ke default.');
      setTimeout(() => setConfigMessage(null), 4000);
      await loadAnalysisData();
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    try {
      // Small sleep to allow spinner to show
      await new Promise(resolve => setTimeout(resolve, 300));
      const res = await IntelligenceService.benchmarkEngine(benchmarkSize);
      setBenchmarkResult(res);
    } catch (err) {
      logger.error('IntelligenceScreen', 'Failed to run benchmark', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const toggleRuleActive = (ruleId: string) => {
    if (!config) return;
    const updatedRules = config.rules.map(r => 
      r.id === ruleId ? { ...r, isActive: !r.isActive } : r
    );
    setConfig({ ...config, rules: updatedRules });
  };

  const updateConfigWeight = (field: keyof IntelligenceConfig['scoreWeights'], value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      scoreWeights: {
        ...config.scoreWeights,
        [field]: value
      }
    });
  };

  const updateAlertThreshold = (field: keyof IntelligenceConfig['alertThresholds'], value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      alertThresholds: {
        ...config.alertThresholds,
        [field]: value
      }
    });
  };

  // Filter recommendations based on active workqueue category, search query, and dropdowns
  const getFilteredQueue = (): RecommendationResult[] => {
    if (!analysisResults) return [];
    
    // 1. Get raw category list
    let list: RecommendationResult[] = [];
    switch (queueSubTab) {
      case 'todaysVisits': list = analysisResults.workQueue.todaysVisits; break;
      case 'urgentCustomers': list = analysisResults.workQueue.urgentCustomers; break;
      case 'brokenCommitments': list = analysisResults.workQueue.brokenCommitments; break;
      case 'highOutstanding': list = analysisResults.workQueue.highOutstanding; break;
      case 'overdueAccounts': list = analysisResults.workQueue.overdueAccounts; break;
      case 'needsFollowUp': list = analysisResults.workQueue.needsFollowUp; break;
      case 'recentlyPaid': list = analysisResults.workQueue.recentlyPaid; break;
    }

    // 2. Apply search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        r.customerName.toLowerCase().includes(q) || 
        r.contractNumber.toLowerCase().includes(q) ||
        r.customerId.toLowerCase().includes(q)
      );
    }

    // 3. Apply risk filter
    if (selectedRiskFilter !== 'ALL') {
      list = list.filter(r => r.riskLevel === selectedRiskFilter);
    }

    // 4. Apply action filter
    if (selectedActionFilter !== 'ALL') {
      list = list.filter(r => r.recommendedAction === selectedActionFilter);
    }

    return list;
  };

  const filteredQueueItems = getFilteredQueue();

  // Helper styles for Badges
  const getRiskBadgeStyle = (level: RecommendationResult['riskLevel']) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/30';
      case 'LOW': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30';
    }
  };

  const getActionBadgeStyle = (action: RecommendationResult['recommendedAction']) => {
    switch (action) {
      case 'VISIT': return 'bg-blue-600 text-white';
      case 'PHONE_CALL': return 'bg-violet-600 text-white';
      case 'REMINDER': return 'bg-sky-600 text-white';
      case 'ESCALATION': return 'bg-rose-700 text-white animate-pulse';
      case 'WAIT': return 'bg-slate-500 text-white';
      case 'CLOSE_CASE': return 'bg-emerald-600 text-white';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER HERO */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 relative overflow-hidden shadow-lg border border-slate-800">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-blue-400">
              <BrainCircuit className="w-8 h-8" />
              <span className="text-xs font-bold tracking-widest uppercase">FC.OS Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Collection Intelligence Engine</h1>
            <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
              Modul pengambil keputusan deterministik offline. Menganalisis riwayat kunjungan, pembayaran, janji bayar, dan portofolio nasabah secara cerdas untuk menghasilkan prioritas penagihan harian yang optimal.
            </p>
          </div>
          
          <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-3 border border-slate-700 self-start text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Kecepatan Mesin</span>
            <span className="font-mono text-lg font-bold text-blue-400">
              {isLoading ? '...' : `${analysisResults?.executionTimeMs || 0}ms`}
            </span>
            <span className="block text-[8px] text-slate-500">Offline Computation</span>
          </div>
        </div>

        {/* TOP LEVEL NAVIGATION TABS */}
        <div className="flex gap-1.5 border-t border-slate-800 mt-6 pt-4 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveScreenTab('queue')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeScreenTab === 'queue' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Antrean Kerja
          </button>
          <button
            onClick={() => setActiveScreenTab('alerts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 relative ${
              activeScreenTab === 'alerts' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Peringatan
            {analysisResults && analysisResults.alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center font-black animate-bounce">
                {analysisResults.alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveScreenTab('rules')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeScreenTab === 'rules' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sliders className="w-4 h-4" /> Aturan Bisnis
          </button>
          <button
            onClick={() => setActiveScreenTab('performance')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeScreenTab === 'performance' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" /> Uji Performa
          </button>
          <button
            onClick={() => setActiveScreenTab('docs')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              activeScreenTab === 'docs' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Dokumentasi
          </button>
        </div>
      </div>

      {/* LOADING SPINNER */}
      {isLoading && activeScreenTab === 'queue' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-500">Mengevaluasi keputusan koleksi secara luring...</p>
        </div>
      )}

      {/* ========================================================
          SCREEN TAB: WORK QUEUE (ANTREAN KERJA)
          ======================================================== */}
      {!isLoading && activeScreenTab === 'queue' && analysisResults && (
        <div className="space-y-6">
          {/* QUEUE SUB-NAV SELECTOR (HORIZONTAL PILLS) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-1.5 flex gap-1 overflow-x-auto scrollbar-none shadow-xs">
            {[
              { id: 'todaysVisits', label: 'Rencana Kunjungan', count: analysisResults.workQueue.todaysVisits.length },
              { id: 'urgentCustomers', label: 'Urgent', count: analysisResults.workQueue.urgentCustomers.length },
              { id: 'brokenCommitments', label: 'Janji Patah', count: analysisResults.workQueue.brokenCommitments.length },
              { id: 'highOutstanding', label: 'Sisa Besar', count: analysisResults.workQueue.highOutstanding.length },
              { id: 'overdueAccounts', label: 'Kolektabilitas Macet', count: analysisResults.workQueue.overdueAccounts.length },
              { id: 'needsFollowUp', label: 'Perlu Kontak', count: analysisResults.workQueue.needsFollowUp.length },
              { id: 'recentlyPaid', label: 'Baru Bayar', count: analysisResults.workQueue.recentlyPaid.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setQueueSubTab(tab.id as keyof WorkQueue);
                  setExpandedCustomerId(null);
                }}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                  queueSubTab === tab.id 
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-2xs' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded-full text-[9px] font-black">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* SEARCH & DRILL DOWN FILTERS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Cari nama, kontrak, atau ID nasabah..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-2xs focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Risk Category Filter */}
            <select
              value={selectedRiskFilter}
              onChange={(e) => setSelectedRiskFilter(e.target.value)}
              className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-2xs focus:outline-hidden focus:border-blue-500"
            >
              <option value="ALL">Semua Tingkat Risiko</option>
              <option value="CRITICAL">Risiko Kritis</option>
              <option value="HIGH">Risiko Tinggi</option>
              <option value="MEDIUM">Risiko Sedang</option>
              <option value="LOW">Risiko Rendah</option>
            </select>

            {/* Action recommendation Filter */}
            <select
              value={selectedActionFilter}
              onChange={(e) => setSelectedActionFilter(e.target.value)}
              className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-2xs focus:outline-hidden focus:border-blue-500"
            >
              <option value="ALL">Semua Rekomendasi Tindakan</option>
              <option value="VISIT">Kunjungan Langsung (Visit)</option>
              <option value="PHONE_CALL">Hubungi Telepon</option>
              <option value="REMINDER">Kirim Pengingat ringan</option>
              <option value="ESCALATION">Eskalasi Kasus</option>
              <option value="WAIT">Tunggu / Pantau</option>
            </select>
          </div>

          {/* CUSTOMER QUEUE LIST */}
          <div className="space-y-3">
            {filteredQueueItems.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-8 text-center space-y-2">
                <ClipboardList className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Antrean Kosong</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Tidak ada nasabah dalam daftar antrean kerja yang memenuhi filter pencarian Anda saat ini.
                </p>
              </div>
            ) : (
              filteredQueueItems.map(customer => {
                const isExpanded = expandedCustomerId === customer.customerId;
                return (
                  <div 
                    key={customer.customerId}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs transition-all"
                  >
                    {/* Item Main Block */}
                    <div 
                      onClick={() => setExpandedCustomerId(isExpanded ? null : customer.customerId)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all select-none"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-50">{customer.customerName}</span>
                          <span className="text-[10px] font-mono text-slate-400">#{customer.contractNumber}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${getRiskBadgeStyle(customer.riskLevel)}`}>
                            {customer.riskLevel}
                          </span>
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-slate-400" /> 
                            Outstanding: <strong className="text-slate-700 dark:text-slate-300">{formatCurrency(customer.outstandingBalance)}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            DPD: <strong className={customer.daysOverdue >= 90 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>{customer.daysOverdue} Hari</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 pt-3 sm:pt-0">
                        {/* Priority Score Gauge */}
                        <div className="text-right">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">Skor Prioritas</span>
                          <span className={`font-mono text-base font-black ${
                            customer.priorityScore >= 80 ? 'text-red-600' : customer.priorityScore >= 50 ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            {customer.priorityScore.toFixed(1)}
                          </span>
                        </div>

                        {/* Action Recommendation Pill */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-2xs ${getActionBadgeStyle(customer.recommendedAction)}`}>
                            {customer.recommendedAction}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {/* Decision Explanation Expand Block */}
                    {isExpanded && (
                      <div className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 p-5 space-y-4 animate-fade-in text-xs text-slate-600 dark:text-slate-400">
                        {/* Reason Heading */}
                        <div className="p-3 bg-blue-50/60 dark:bg-blue-950/10 border-l-4 border-blue-500 rounded-r-lg space-y-1">
                          <span className="font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider text-[9px]">Justifikasi Rekomendasi</span>
                          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-semibold">{customer.recommendationReason}</p>
                        </div>

                        {/* Analysis Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Left: Triggered Rules & Weighted Score */}
                          <div className="space-y-3">
                            <h5 className="font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                              <BrainCircuit className="w-4 h-4 text-blue-500" />
                              Aturan Prioritas yang Terpicu ({customer.triggeredRules.length})
                            </h5>
                            <div className="space-y-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                              {customer.triggeredRules.map((rule, idx) => (
                                <div key={idx} className="flex justify-between items-start gap-3 py-1 border-b border-slate-50 dark:border-slate-800 last:border-0 last:pb-0">
                                  <span className="leading-relaxed">{rule.description}</span>
                                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200 text-right whitespace-nowrap">
                                    +{rule.scoreContribution.toFixed(1)}
                                  </span>
                                </div>
                              ))}
                              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-slate-900 dark:text-slate-50 text-xs">
                                <span>Skor Prioritas Terhitung (Normalisasi)</span>
                                <span className="font-mono text-blue-600">{customer.priorityScore.toFixed(1)} / 100</span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Risk calculation & Activities history */}
                          <div className="space-y-3">
                            <h5 className="font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-orange-500" />
                              Metrik Risiko & Operasional
                            </h5>
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                              {/* Risk Score bar */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px]">
                                  <span>Skor Risiko Kerugian</span>
                                  <span className="font-bold font-mono">{customer.riskScore.toFixed(1)} / 100 ({customer.riskLevel})</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${
                                      customer.riskLevel === 'CRITICAL' ? 'bg-red-600' : customer.riskLevel === 'HIGH' ? 'bg-orange-500' : customer.riskLevel === 'MEDIUM' ? 'bg-yellow-400' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${customer.riskScore}%` }}
                                  ></div>
                                </div>
                              </div>

                              {/* Operational stats */}
                              <div className="grid grid-cols-2 gap-3 pt-1 text-[11px]">
                                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                                  <span className="block text-slate-400 font-bold uppercase text-[8px]">Kunjungan Terakhir</span>
                                  <strong className="text-slate-700 dark:text-slate-300">
                                    {customer.lastVisitDaysAgo !== null ? `${customer.lastVisitDaysAgo} hari lalu` : 'Belum pernah'}
                                  </strong>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                                  <span className="block text-slate-400 font-bold uppercase text-[8px]">Pembayaran Terakhir</span>
                                  <strong className="text-slate-700 dark:text-slate-300">
                                    {customer.lastPaymentDaysAgo !== null ? `${customer.lastPaymentDaysAgo} hari lalu` : 'Belum pernah'}
                                  </strong>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                                  <span className="block text-slate-400 font-bold uppercase text-[8px]">Janji Patah (Broken)</span>
                                  <strong className={customer.brokenCommitmentCount > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                                    {customer.brokenCommitmentCount} Kali
                                  </strong>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                                  <span className="block text-slate-400 font-bold uppercase text-[8px]">Action Plan</span>
                                  <strong className="text-blue-600">
                                    {customer.recommendedAction}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SCREEN TAB: OPERATIONAL ALERTS
          ======================================================== */}
      {!isLoading && activeScreenTab === 'alerts' && analysisResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Daftar Peringatan Operasional Aktif ({analysisResults.alerts.length})
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded-md font-semibold">
              Terakhir dihitung: Baru saja (Luring)
            </span>
          </div>

          {analysisResults.alerts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Semua Berjalan Lancar</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Tidak ada anomali atau peringatan kritis yang terdeteksi dari portofolio debitur Anda hari ini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analysisResults.alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`border rounded-xl p-4 flex gap-3 shadow-2xs transition-all ${
                    alert.severity === 'CRITICAL' 
                      ? 'bg-rose-50/50 border-rose-200 dark:bg-red-950/10 dark:border-red-900/40 text-rose-950 dark:text-red-200' 
                      : alert.severity === 'WARNING' 
                        ? 'bg-amber-50/50 border-amber-200 dark:bg-yellow-950/10 dark:border-yellow-900/30 text-amber-950 dark:text-yellow-200'
                        : 'bg-blue-50/50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-900/30 text-blue-950 dark:text-blue-200'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                    alert.severity === 'CRITICAL' ? 'text-rose-600' : alert.severity === 'WARNING' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                  
                  <div className="space-y-1 flex-1">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <h4 className="font-bold text-xs">{alert.message}</h4>
                      <span className="text-[9px] font-mono opacity-60">#{alert.type}</span>
                    </div>
                    <p className="text-xs opacity-80 leading-relaxed">{alert.details}</p>
                    
                    {alert.customerId && (
                      <div className="pt-2 flex items-center gap-1.5 text-[10px] font-bold">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Debitur: {alert.customerName} (ID: {alert.customerId})</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          SCREEN TAB: RULE CONFIGURATOR (BUSINESS RULE ENGINE)
          ======================================================== */}
      {!isLoading && activeScreenTab === 'rules' && config && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-600" /> Konfigurasi Bobot & Aturan Bisnis
            </h3>
            <SecondaryButton type="button" onClick={handleResetConfig} className="text-xs">
              Reset Default
            </SecondaryButton>
          </div>

          {configMessage && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 animate-fade-in flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              {configMessage}
            </div>
          )}

          {/* Bobot Prioritas Sliders */}
          <ReusableCard className="space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Bobot Skor Prioritas (Sistem Pembobotan)</h4>
              <p className="text-[11px] text-slate-500 mt-1">Bobot persen relative dari masing-masing kriteria (Total persen: 100%).</p>
            </div>

            <div className="space-y-4">
              {[
                { field: 'daysPastDue', label: 'Days Past Due (DPD)', desc: 'Skor berdasarkan tingkat keterlambatan harian debitur' },
                { field: 'outstandingBalance', label: 'Outstanding Balance (Saldo Sisa)', desc: 'Memprioritaskan nilai saldo tunggakan finansial besar' },
                { field: 'brokenCommitments', label: 'Broken Commitments (Janji Patah)', desc: 'Hukuman kenaikan prioritas jika nasabah ingkar janji' },
                { field: 'daysSinceLastVisit', label: 'Days Since Last Visit (Absensi Kunjungan)', desc: 'Urgentitas kunjungan bagi nasabah yang lama tidak dipantau' },
                { field: 'customerPriority', label: 'Customer Level (Kelas Portofolio)', desc: 'Menggunakan kelas prioritas awal bawaan data nasabah' },
                { field: 'recoveryHistory', label: 'Recovery History (Tren Pembayaran)', desc: 'Mengurangi prioritas untuk kooperatif/baru saja bayar' },
              ].map(item => {
                const val = config.scoreWeights[item.field as keyof IntelligenceConfig['scoreWeights']] || 0;
                return (
                  <div key={item.field} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                      <span className="font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md">{val}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="50" 
                      value={val}
                      onChange={(e) => updateConfigWeight(item.field as keyof IntelligenceConfig['scoreWeights'], parseInt(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </ReusableCard>

          {/* Alert Thresholds */}
          <ReusableCard className="space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Nilai Ambang Peringatan (Alert Thresholds)</h4>
              <p className="text-[11px] text-slate-500 mt-1">Konfigurasi batas aman operasional untuk mendeteksi anomali.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Batas Absen Kunjungan (Hari)</label>
                <input 
                  type="number" 
                  value={config.alertThresholds.noVisitDays}
                  onChange={(e) => updateAlertThreshold('noVisitDays', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-400 block">Peringatan jika tidak ada visit dalam X hari.</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Batas Saldo Outstanding Tinggi (Rp)</label>
                <input 
                  type="number" 
                  value={config.alertThresholds.outstandingHigh}
                  onChange={(e) => updateAlertThreshold('outstandingHigh', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-400 block">Peringatan saldo melampaui batas aman portofolio.</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Batas Toleransi Janji Patah Berulang (Kali)</label>
                <input 
                  type="number" 
                  value={config.alertThresholds.repeatedBrokenCount}
                  onChange={(e) => updateAlertThreshold('repeatedBrokenCount', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-400 block">Peringatan perilaku tidak kooperatif kronis.</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Batas Waktu Transaksi Tertahan (Jam)</label>
                <input 
                  type="number" 
                  value={config.alertThresholds.syncPendingHours}
                  onChange={(e) => updateAlertThreshold('syncPendingHours', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-400 block">Peringatan jika data lokal luring belum disinkronkan.</span>
              </div>
            </div>
          </ReusableCard>

          {/* Aturan Aktif Toggle */}
          <ReusableCard className="space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Rule Definition Registry</h4>
              <p className="text-[11px] text-slate-500 mt-1">Status aktivasi aturan logis spesifik dalam Collection Engine.</p>
            </div>

            <div className="space-y-3">
              {config.rules.map(rule => (
                <div key={rule.id} className="flex items-start justify-between gap-4 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{rule.name}</span>
                      <span className="text-[8px] font-mono px-1 bg-slate-200 dark:bg-slate-700 rounded-sm text-slate-500">
                        {rule.id} • v{rule.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{rule.description}</p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input 
                      type="checkbox" 
                      checked={rule.isActive} 
                      onChange={() => toggleRuleActive(rule.id)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </ReusableCard>

          {/* Submit action */}
          <div className="flex gap-3">
            <PrimaryButton 
              type="submit" 
              isLoading={isConfigSaving}
              className="flex-1 bg-blue-600 text-white font-bold"
            >
              Simpan & Terapkan Perubahan
            </PrimaryButton>
          </div>
        </form>
      )}

      {/* ========================================================
          SCREEN TAB: OFFLINE PERFORMANCE BENCHMARK
          ======================================================== */}
      {!isLoading && activeScreenTab === 'performance' && (
        <div className="space-y-6">
          <ReusableCard className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-5 h-5 text-blue-500" /> Offline Computation Stress Test
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Persyaratan non-fungsional FC.OS mewajibkan Collection Intelligence Engine untuk memproses dataset skala besar secara cepat langsung pada browser tanpa mengandalkan server awan (offline-first). Gunakan stress test di bawah ini untuk mensimulasikan perhitungan scoring dan penentuan risiko pada puluhan ribu nasabah.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 items-end pt-2 text-xs">
              <div className="space-y-1.5 flex-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Ukuran Dataset Simulasi (Jumlah Rekening Nasabah)</label>
                <select
                  value={benchmarkSize}
                  onChange={(e) => setBenchmarkSize(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:border-blue-500"
                >
                  <option value={5000}>5,000 Nasabah (Skala Cabang Kecil)</option>
                  <option value={10000}>10,000 Nasabah (Skala Cabang Utama)</option>
                  <option value={30000}>30,000 Nasabah (Skala Wilayah/Regional)</option>
                  <option value={50000}>50,000 Nasabah (Mandat Acceptance Criteria)</option>
                </select>
              </div>

              <PrimaryButton 
                onClick={handleRunBenchmark}
                isLoading={isBenchmarking}
                icon={<Play className="w-4 h-4" />}
                className="bg-blue-600 text-white font-bold h-10 px-6"
              >
                Jalankan Benchmark
              </PrimaryButton>
            </div>
          </ReusableCard>

          {/* Benchmark Results Display */}
          {benchmarkResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-scale-up">
              {/* Left Column stats */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4 shadow-md border border-slate-800 relative overflow-hidden">
                <div className="absolute right-0 bottom-0 translate-x-1/4 -translate-y-1/4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                
                <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider">Hasil Eksekusi Luring</h4>
                
                <div className="space-y-4 font-mono">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Jumlah Rekening Diproses</span>
                    <span className="text-2xl font-bold text-white">{benchmarkResult.customerCount.toLocaleString('id-ID')} Akun</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Waktu Pemrosesan Lokal</span>
                    <span className="text-2xl font-bold text-emerald-400">{benchmarkResult.calculationTimeMs} ms</span>
                    <span className="block text-[9px] text-slate-500">({(benchmarkResult.calculationTimeMs / 1000).toFixed(3)} detik)</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Kecepatan throughput</span>
                    <span className="text-lg font-bold text-white">{benchmarkResult.processedPerSecond.toLocaleString('id-ID')} nasabah / detik</span>
                  </div>
                </div>
              </div>

              {/* Right Column details */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Analisis Efisiensi & Kepatuhan</h4>
                
                <div className="space-y-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  <div className="flex items-center gap-3">
                    <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                      benchmarkResult.status === 'OPTIMAL' ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}></span>
                    <div>
                      <strong className="block text-slate-800 dark:text-slate-100">Evaluasi Algoritma: {benchmarkResult.status}</strong>
                      <span>Perhitungan linear O(N) dalam memori terverifikasi optimal & aman dari memory-leak.</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                    <span className="block font-bold text-slate-700 dark:text-slate-300">Estimasi Tambahan RAM browser</span>
                    <span className="font-mono text-sm text-slate-900 dark:text-slate-100">~ {benchmarkResult.memoryEstimateMb} MB</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">Kebutuhan memori minimalis, tidak membekukan user interface HP kolektor lapangan.</p>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-[10px] text-slate-400 italic">
                    * Catatan: Pengujian ini menghasilkan data nasabah acak (portofolio dummy) langsung dalam memori sandboxed guna memverifikasi kecepatan perhitungan formula matematis tanpa merusak data Dexie lokal Anda yang asli.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          SCREEN TAB: DOCUMENTATION & FORMULAS
          ======================================================== */}
      {!isLoading && activeScreenTab === 'docs' && (
        <div className="space-y-6">
          <ReusableCard className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <BookOpen className="w-5 h-5 text-blue-500" /> Arsitektur & Rumus Sistem Kecerdasan Koleksi (Rule Engine)
            </h3>
            
            <div className="space-y-6 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {/* Formula 1 */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">1. Rumus Skor Prioritas (Priority Score)</h4>
                <p>
                  Skor Prioritas dihitung menggunakan bobot persentase yang dikonfigurasi oleh supervisor pada tab "Aturan Bisnis". Setiap kontribusi kriteria dinormalisasi sebelum dikalikan dengan bobotnya.
                </p>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-center text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                  Skor Prioritas = ( ∑ (Bobot_Kriteria_i * Kontribusi_Normalized_i) / ∑ Bobot ) * 100
                </div>
                <div className="pl-4 border-l-2 border-slate-200 space-y-1">
                  <div>• <strong>DPD (Days Past Due)</strong>: Kontribusi = min(1.0, Hari Keterlambatan / 120)</div>
                  <div>• <strong>Outstanding Balance</strong>: Kontribusi = min(1.0, Saldo Outstanding / Batas_Ambang_Tinggi)</div>
                  <div>• <strong>Broken Commitment</strong>: Kontribusi = min(1.0, Jumlah Janji Patah / Batas_Ambang_Patah)</div>
                  <div>• <strong>Absen Visit</strong>: Kontribusi = min(1.0, Hari Sejak Kunjungan Terakhir / Batas_Absen_Hari)</div>
                  <div>• <strong>Level Prioritas</strong>: Low = 0.25, Medium = 0.50, High = 0.75, Critical = 1.0</div>
                  <div>• <strong>Riwayat Pembayaran</strong>: Pembayaran &lt; 7 hari lalu mengurangi prioritas sebesar -50% dari bobotnya; belum pernah membayar sama sekali menyumbangkan 100% dari bobot pemulihan.</div>
                </div>
              </div>

              {/* Formula 2 */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">2. Klasifikasi Tingkat Risiko (Risk Score)</h4>
                <p>
                  Risiko kerugian (Loss Risk Score) debitur dinilai berdasarkan dua pilar utama: tingkat keterlambatan penuaan (DPD Aging) dan keandalan janji bayar (PTP Reliability).
                </p>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-center text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                  Skor Risiko = (min(60, (DPD / Ambang_Macet) * 60) + min(40, (Broken_PTP_Count / Ambang_Patah) * 40))
                </div>
                <p className="mt-1">
                  <strong>Klasifikasi Kategori Risiko:</strong>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] font-bold">
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">RISIKO RENDAH (LOW)<br/>&lt; 30</div>
                  <div className="p-2.5 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg">RISIKO SEDANG (MEDIUM)<br/>30 - 59</div>
                  <div className="p-2.5 bg-orange-50 text-orange-800 border border-orange-200 rounded-lg">RISIKO TINGGI (HIGH)<br/>60 - 84</div>
                  <div className="p-2.5 bg-red-50 text-red-800 border border-red-200 rounded-lg">RISIKO KRITIS (CRITICAL)<br/>&gt;= 85</div>
                </div>
              </div>

              {/* Recommendation Flow */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">3. Alur Logika Rekomendasi Tindakan (Follow-up Engine)</h4>
                <p>
                  Sistem merekomendasikan tindakan operasional konkret berdasarkan kondisi penagihan aktual debitur:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>ESCALATION</strong>: Direkomendasikan jika DPD melampaui batas kritis eskalasi (&gt;= 180 hari) atau jika janji bayar patah berulang kali (&gt;= 3 kali).</li>
                  <li><strong>VISIT</strong>: Direkomendasikan jika DPD &gt; 90 hari, atau memiliki janji bayar patah terdekat yang belum ditindaklanjuti, atau belum pernah dikunjungi &gt; 30 hari.</li>
                  <li><strong>PHONE CALL</strong>: Keterlambatan tingkat menengah (31-90 hari DPD) diarahkan ke kontak panggilan telepon persuasif.</li>
                  <li><strong>REMINDER</strong>: Keterlambatan tingkat awal (1-30 hari DPD) menerima notifikasi WhatsApp/SMS pengingat tanggal bayar ramah.</li>
                  <li><strong>WAIT</strong>: Direkomendasikan jika nasabah baru saja melakukan pembayaran dalam 5 hari terakhir, atau akunnya tercatat lancar berstatus hijau.</li>
                </ul>
              </div>

              {/* No AI Rule */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 p-4 bg-blue-50/50 dark:bg-blue-950/10 border-l-4 border-blue-500 rounded-r-lg">
                <h4 className="font-bold text-slate-900 dark:text-blue-300 text-xs uppercase tracking-wider">Desain Bebas Cloud & Tanpa Kecerdasan Buatan (Offline Rule Engine)</h4>
                <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                  FC.OS Intelligence Engine sepenuhnya berjalan tanpa ketergantungan API cloud atau model jaringan saraf tiruan (Machine Learning). Hal ini menjamin:
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[10px]">
                  <div>• <strong>100% Offline Kepatuhan</strong>: Analisis tetap berjalan di pedalaman terpencil tanpa internet.</div>
                  <div>• <strong>Deterministik & Dapat Diadili</strong>: Mengapa rekomendasi "Visit" dipilih selalu jelas secara logika matematis yang transparan bagi supervisor.</div>
                </div>
              </div>
            </div>
          </ReusableCard>
        </div>
      )}
    </div>
  );
};

export default IntelligenceScreen;
