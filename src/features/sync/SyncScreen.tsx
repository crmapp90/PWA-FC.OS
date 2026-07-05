import React, { useEffect, useState, useRef } from 'react';
import { 
  RefreshCw, 
  Database, 
  ShieldAlert, 
  Download, 
  Upload, 
  Settings2, 
  History, 
  Check, 
  AlertTriangle, 
  X, 
  Wifi, 
  WifiOff, 
  Server, 
  Wrench, 
  Trash2, 
  Activity,
  FileText,
  Clock,
  CheckCircle2,
  Lock,
  ChevronRight,
  Sparkles,
  HelpCircle,
  FolderSync
} from 'lucide-react';
import { db } from '../../core/database';
import { logger } from '../../core/logger';
import { useStore } from '../../core/store';
import { useLocalization } from '../../core/localization';
import { ReusableCard, ProgressIndicator, ConfirmationDialog } from '../../shared/components/BaseComponents';
import { 
  DataProtectionService, 
  IntegrityReport, 
  BackupMetadata 
} from '../../core/services/DataProtectionService';
import { 
  SyncEngineService, 
  SyncEngineStats, 
  ConflictStrategy 
} from '../../core/services/SyncEngineService';
import { SyncQueueItem, BackupHistory } from '../../types';

export const SyncScreen: React.FC = () => {
  const { t } = useLocalization();
  const { 
    isSyncing: storeIsSyncing, 
    syncProgress: storeSyncProgress,
    pendingSyncCount: storePendingCount,
    refreshPendingSyncCount
  } = useStore();

  // Active Screen Tab
  const [activeSubTab, setActiveSubTab] = useState<'monitor' | 'queue' | 'backup' | 'integrity'>('monitor');

  // Network State Simulator
  const [simulateOnline, setSimulateOnline] = useState<boolean>(true);

  // Sync Engine Local State
  const [engineStats, setEngineStats] = useState<SyncEngineStats | null>(null);
  const [localPendingCount, setLocalPendingCount] = useState<number>(0);
  const [localFailedCount, setLocalFailedCount] = useState<number>(0);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('LAST_WRITE_WINS');
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncDuration, setSyncDuration] = useState<number>(0);

  // Backup Local State
  const [backupType, setBackupType] = useState<'full' | 'incremental'>('full');
  const [compressBackup, setCompressBackup] = useState<boolean>(true);
  const [encryptBackup, setEncryptBackup] = useState<boolean>(false);
  const [restoreType, setRestoreType] = useState<'full' | 'partial'>('full');
  const [selectedTables, setSelectedTables] = useState<string[]>([
    'settings', 'customers', 'visits', 'payments', 'promise_to_pay'
  ]);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [backupFileString, setBackupFileString] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [importValidationResult, setImportValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    metadata?: BackupMetadata;
  } | null>(null);

  // Drag & Drop
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Integrity & Diagnostics Local State
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [isScanningIntegrity, setIsScanningIntegrity] = useState<boolean>(false);
  const [repairResults, setRepairResults] = useState<{ success: boolean; issuesFixed: number } | null>(null);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);

  // Stress-Test Benchmarking
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    recordCount: number;
    durationMs: number;
    throughput: number;
  } | null>(null);

  // Dialog Controls
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState<boolean>(false);
  const [isHardWipeConfirmOpen, setIsHardWipeConfirmOpen] = useState<boolean>(false);

  // Operational State Messages
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
  } | null>(null);

  // Load Initial Sync and Backup States
  const loadSystemStates = async () => {
    try {
      // Refresh pending store state
      await refreshPendingSyncCount();

      // Retrieve network simulator override
      const netOver = localStorage.getItem('fcos_mock_network_override');
      const isSimulatedOnline = netOver === null ? true : netOver === 'true';
      setSimulateOnline(isSimulatedOnline);
      SyncEngineService.setNetworkStatus(isSimulatedOnline);

      // Load Sync Engine Stats
      const stats = await SyncEngineService.getStats();
      setEngineStats(stats);

      // Count local queue items
      const pendingCount = await db.sync_queue.where('syncStatus').equals('pending').count();
      const failedCount = await db.sync_queue.where('syncStatus').equals('failed').count();
      setLocalPendingCount(pendingCount);
      setLocalFailedCount(failedCount);

      // Conflict strategy
      setConflictStrategy(SyncEngineService.getConflictStrategy());

      // Queue items
      const queue = await db.sync_queue.toArray();
      setQueueItems(queue);

      // Backup history
      const history = await db.backup_history.orderBy('backupDate').reverse().toArray();
      setBackupHistory(history);
    } catch (err) {
      console.error('Failed to load database states:', err);
    }
  };

  useEffect(() => {
    loadSystemStates();
  }, [storePendingCount]);

  // Handle Simulated Online/Offline Toggle
  const handleNetworkToggle = (online: boolean) => {
    setSimulateOnline(online);
    localStorage.setItem('fcos_mock_network_override', String(online));
    SyncEngineService.setNetworkStatus(online);
    loadSystemStates();
    
    showBanner(
      online ? 'success' : 'warning',
      online 
        ? 'Simulasi Koneksi diaktifkan: Sinkronisasi cloud siap berjalan.' 
        : 'Simulasi Offline diaktifkan: Seluruh transmisi cloud ditangguhkan dalam antrean.'
    );
  };

  // Utility to show notification alerts
  const showBanner = (type: 'success' | 'error' | 'warning' | 'info', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => setBannerMessage(null), 6000);
  };

  // Trigger Local Sync Simulation
  const handleTriggerSync = async () => {
    if (!simulateOnline) {
      showBanner('error', 'Gagal memulai sinkronisasi: Perangkat sedang offline (simulasi offline aktif).');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(5);
    const start = Date.now();

    try {
      const success = await SyncEngineService.executeSync((progress) => {
        setSyncProgress(progress);
      });

      if (success) {
        showBanner('success', 'Sinkronisasi selesai! Seluruh antrean mutasi berhasil terkirim ke Cloud server.');
      } else {
        showBanner('warning', 'Beberapa mutasi gagal ditransmisikan. Silakan tinjau daftar antrean kegagalan.');
      }
    } catch (err: any) {
      showBanner('error', `Interupsi Sync: ${err.message || 'Koneksi terputus.'}`);
    } finally {
      setIsSyncing(false);
      setSyncDuration(Date.now() - start);
      await loadSystemStates();
    }
  };

  // Change Conflict Resolution Strategy
  const handleConflictStrategyChange = (strategy: ConflictStrategy) => {
    setConflictStrategy(strategy);
    SyncEngineService.setConflictStrategy(strategy);
    showBanner('info', `Aturan resolusi konflik berhasil diubah ke: ${strategy}`);
  };

  // Retry failed sync queue item
  const handleRetryItem = async (id: string) => {
    try {
      await db.sync_queue.update(id, { syncStatus: 'pending', error: undefined, attempts: 0 });
      showBanner('success', `Item ${id} dikembalikan ke status tertunda (pending).`);
      await loadSystemStates();
    } catch (err) {
      showBanner('error', 'Gagal memperbarui status antrean.');
    }
  };

  // Force Client Wins for Conflict Items
  const handleForceClientWins = async (item: SyncQueueItem) => {
    try {
      const tableKey = item.entityType === 'visit' ? 'visits' 
                      : item.entityType === 'payment' ? 'payments' 
                      : item.entityType === 'customer' ? 'customers'
                      : 'promise_to_pay';
      const actualTable = tableKey === 'promise_to_pay' ? db.promise_to_pay : (db as any)[tableKey];
      
      const record = await actualTable.get(item.entityId);
      if (record) {
        record.syncStatus = 'synced';
        record.version = (record.version || 1) + 1;
        record.updatedAt = new Date().toISOString();
        await actualTable.put(record);
      }
      
      await db.sync_queue.delete(item.id);
      showBanner('success', 'Override Selesai: Menggunakan perubahan lokal perangkat (Client Wins).');
      await loadSystemStates();
    } catch (err: any) {
      showBanner('error', `Gagal memaksakan versi lokal: ${err.message}`);
    }
  };

  // Discard Local Change (Server Wins)
  const handleDiscardLocalChange = async (item: SyncQueueItem) => {
    try {
      const tableKey = item.entityType === 'visit' ? 'visits' 
                      : item.entityType === 'payment' ? 'payments' 
                      : item.entityType === 'customer' ? 'customers'
                      : 'promise_to_pay';
      const actualTable = tableKey === 'promise_to_pay' ? db.promise_to_pay : (db as any)[tableKey];
      
      // Simulate fetching latest record from server (represented by the payload but reverted)
      // Since server wins, we delete the pending local write OR revert to verified server state
      await actualTable.delete(item.entityId);
      await db.sync_queue.delete(item.id);
      
      showBanner('success', 'Override Selesai: Mengabaikan perubahan lokal perangkat (Server Wins).');
      await loadSystemStates();
    } catch (err: any) {
      showBanner('error', `Gagal mengabaikan perubahan lokal: ${err.message}`);
    }
  };

  // Cancel item from queue
  const handleCancelQueueItem = async (id: string) => {
    try {
      await db.sync_queue.delete(id);
      showBanner('info', `Item mutasi ${id} berhasil dihapus dari antrean sinkronisasi.`);
      await loadSystemStates();
    } catch (err) {
      showBanner('error', 'Gagal membatalkan item antrean.');
    }
  };

  // Generate Backup File
  const handleGenerateBackup = async () => {
    try {
      const backupString = await DataProtectionService.generateBackup({
        backupType,
        compressed: compressBackup,
        encrypted: encryptBackup,
        userId: 'budi_collector'
      });

      // Prompt file download
      const blob = new Blob([backupString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fcos_${backupType}_backup_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showBanner('success', `File cadangan (${backupType.toUpperCase()}) berhasil diunduh ke penyimpanan internal.`);
      await loadSystemStates();
    } catch (err: any) {
      showBanner('error', `Gagal mengekspor data: ${err.message}`);
    }
  };

  // File Upload Handlers (Drag & Drop + Input Click)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileImport(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileImport(file);
    }
  };

  const handleFileImport = async (file: File) => {
    setImportFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBackupFileString(content);

      // Validate on-the-fly
      const validation = DataProtectionService.validateAndParseBackup(content);
      setImportValidationResult({
        isValid: validation.isValid,
        error: validation.error,
        metadata: validation.payload?.metadata
      });

      if (validation.isValid) {
        showBanner('success', 'File cadangan valid! Siap dipulihkan ke database.');
      } else {
        showBanner('error', `File cadangan tidak valid: ${validation.error}`);
      }
    };
    reader.readAsText(file);
  };

  // Execute Restore Database
  const handleExecuteRestore = async () => {
    if (!backupFileString || !importValidationResult?.isValid) {
      showBanner('error', 'Silakan pilih file cadangan yang valid terlebih dahulu.');
      return;
    }

    try {
      const result = await DataProtectionService.restoreBackup({
        backupFileString,
        restoreType,
        selectedTables,
        userId: 'budi_collector'
      });

      if (result.success) {
        showBanner('success', `Restorasi berhasil! Memulihkan ${result.recordCount} entitas data.`);
        setIsRestoreConfirmOpen(false);
        setBackupFileString('');
        setImportFileName('');
        setImportValidationResult(null);
        await loadSystemStates();
      }
    } catch (err: any) {
      showBanner('error', `Gagal memulihkan database: ${err.message}`);
    }
  };

  const handleTableCheckboxChange = (tableName: string) => {
    if (selectedTables.includes(tableName)) {
      setSelectedTables(selectedTables.filter(t => t !== tableName));
    } else {
      setSelectedTables([...selectedTables, tableName]);
    }
  };

  // Integrity Scan Diagnostic
  const handleScanIntegrity = async () => {
    setIsScanningIntegrity(true);
    setRepairResults(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Visual spacing
      const report = await DataProtectionService.verifyDatabaseIntegrity();
      setIntegrityReport(report);
      
      if (report.isValid) {
        showBanner('success', 'Pemindaian Selesai: Integritas database 100% sehat. Tidak ditemukan kegagalan.');
      } else {
        showBanner('warning', `Ditemukan ${report.issues.length} ketidakkonsistenan data dalam database.`);
      }
    } catch (err: any) {
      showBanner('error', `Gagal memindai integritas: ${err.message}`);
    } finally {
      setIsScanningIntegrity(false);
    }
  };

  // Self Healing Repair Database
  const handleExecuteRepair = async () => {
    setIsRepairing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const result = await DataProtectionService.repairDatabase();
      setRepairResults(result);
      
      if (result.success) {
        showBanner('success', `Perbaikan mandiri selesai! Mengoreksi ${result.issuesFixed} anomali data.`);
        // Re-scan
        const report = await DataProtectionService.verifyDatabaseIntegrity();
        setIntegrityReport(report);
      } else {
        showBanner('error', 'Rutinitas perbaikan mandiri database mendeteksi anomali kritis.');
      }
    } catch (err: any) {
      showBanner('error', `Gagal memperbaiki database: ${err.message}`);
    } finally {
      setIsRepairing(false);
    }
  };

  // Performance Benchmarking (5000 Records calculation strain)
  const handleStressTestBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkResult(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      const startTime = performance.now();
      
      // Perform simulated hash lookup, validation, & joins on 5,000 mockup objects
      const items = Array.from({ length: 5000 }, (_, i) => ({
        id: `STRESS-PAY-${i}`,
        uuid: crypto.randomUUID ? crypto.randomUUID() : `MOCK-UUID-${i}-${Date.now()}`,
        customerId: `ACC-${Math.floor(100000 + Math.random() * 900000)}`,
        collectorId: 'COL-7729',
        amount: Math.floor(100000 + Math.random() * 10000000),
        paymentMethod: 'CASH',
        receiptNumber: `REC-${100000 + i}`,
        paymentDate: new Date().toISOString(),
        version: Math.floor(1 + Math.random() * 5),
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Map construction O(1)
      const lookupMap = new Map();
      items.forEach(item => lookupMap.set(item.id, item));

      // Hash checksum simulation on stress payload
      const str = JSON.stringify(items);
      const hash = DataProtectionService.calculateChecksum(str);

      // Perform validation and joins on map
      let validCount = 0;
      lookupMap.forEach((val) => {
        if (val.id && val.amount > 0 && val.uuid) {
          validCount++;
        }
      });

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const throughput = Math.round((items.length / (durationMs / 1000)));

      setBenchmarkResult({
        recordCount: items.length,
        durationMs: Math.round(durationMs * 100) / 100,
        throughput
      });

      showBanner('success', `Stress-test selesai! Mengolah 5,000 mutasi dalam ${Math.round(durationMs)}ms (${throughput.toLocaleString()} ops/detik).`);
    } catch (err: any) {
      showBanner('error', `Benchmark gagal: ${err.message}`);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Hard Wipe local Database
  const handleWipeDatabase = async () => {
    try {
      await db.customers.clear();
      await db.collectors.clear();
      await db.sync_queue.clear();
      await db.visits.clear();
      await db.payments.clear();
      await db.promise_to_pay.clear();
      await db.attachments.clear();
      await db.notes.clear();
      await db.tasks.clear();
      await db.activity_logs.clear();
      await db.settings.clear();
      await db.audit_logs.clear();
      await db.report_snapshots.clear();
      await db.scheduled_reports.clear();
      await db.backup_history.clear();

      localStorage.clear();
      setIsHardWipeConfirmOpen(false);
      showBanner('success', 'Seluruh database IndexedDB and sesi di HP berhasil dibersihkan total.');
      window.location.reload();
    } catch (err: any) {
      showBanner('error', `Gagal membersihkan database: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-1">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/50 text-blue-600 rounded-xl">
              <FolderSync className="w-5 h-5" id="sync-icon" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50" id="sync-title">
                Sinkronisasi & Proteksi Data
              </h2>
              <p className="text-xs text-slate-500" id="sync-subtitle">
                Modul Keandalan Operasional & Pemulihan Keadaan Darurat v1.2
              </p>
            </div>
          </div>
        </div>

        {/* CONNECTION TOGGLE */}
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 font-bold pl-2">Konektivitas:</span>
          <button
            id="toggle-online"
            onClick={() => handleNetworkToggle(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${simulateOnline ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Wifi className="w-3.5 h-3.5" /> Online
          </button>
          <button
            id="toggle-offline"
            onClick={() => handleNetworkToggle(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${!simulateOnline ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <WifiOff className="w-3.5 h-3.5" /> Offline
          </button>
        </div>
      </div>

      {/* OPERATIONS NOTIFICATION BANNER */}
      {bannerMessage && (
        <div 
          id="banner-alert"
          className={`p-3.5 rounded-xl border flex items-start gap-2.5 shadow-xs transition-all duration-300 ${
            bannerMessage.type === 'success' ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-300' :
            bannerMessage.type === 'warning' ? 'bg-amber-50/80 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-300' :
            bannerMessage.type === 'error' ? 'bg-rose-50 border-rose-250 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-300' :
            'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-300'
          }`}
        >
          {bannerMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
          {bannerMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
          {bannerMessage.type === 'error' && <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
          {bannerMessage.type === 'info' && <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />}
          
          <div className="text-xs font-semibold leading-relaxed grow">{bannerMessage.text}</div>
          <button onClick={() => setBannerMessage(null)} className="text-slate-400 hover:text-slate-650">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUB-TABS NAVIGATION CONTROLS */}
      <div className="flex border-b border-slate-100 dark:border-slate-800" id="sync-tabs-container">
        <button
          id="tab-monitor"
          onClick={() => setActiveSubTab('monitor')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'monitor' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <Activity className="w-4 h-4" />
          Monitor Transmisi
        </button>
        <button
          id="tab-queue"
          onClick={() => setActiveSubTab('queue')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'queue' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <Server className="w-4 h-4" />
          Antrean & Resolusi ({queueItems.length})
        </button>
        <button
          id="tab-backup"
          onClick={() => setActiveSubTab('backup')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'backup' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <Database className="w-4 h-4" />
          Proteksi & Cadangan
        </button>
        <button
          id="tab-integrity"
          onClick={() => setActiveSubTab('integrity')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeSubTab === 'integrity' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <ShieldAlert className="w-4 h-4" />
          Validasi Integritas
        </button>
      </div>

      {/* 1. MONITOR TRANSMISI TAB PANEL */}
      {activeSubTab === 'monitor' && (
        <div className="space-y-6" id="panel-monitor">
          {/* SINKRONISASI CARD WIDGET */}
          <ReusableCard className="p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Status Penyinkronan Awan</h3>
                <p className="text-[11px] text-slate-500">Kombinasi queue database lokal dengan server pusat perusahaan</p>
              </div>
              {simulateOnline ? (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
                  <Wifi className="w-3.5 h-3.5" /> Jaringan Aktif
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
                  <WifiOff className="w-3.5 h-3.5" /> Berjalan Luring (Offline)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Antrean Mutasi</span>
                <p className="text-lg font-extrabold text-slate-800 dark:text-slate-100 font-mono">
                  {localPendingCount} <span className="text-xs font-medium text-slate-500">tertunda</span>
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Transmisi Gagal</span>
                <p className="text-lg font-extrabold text-rose-600 dark:text-rose-400 font-mono">
                  {localFailedCount} <span className="text-xs font-medium text-slate-500">item</span>
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lama Transmisi Akhir</span>
                <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                  {syncDuration ? `${syncDuration} ms` : '-'}
                </p>
              </div>
            </div>

            {/* SINKRONISASI PROGRESS BAR */}
            {isSyncing && (
              <div className="space-y-1.5 p-3.5 bg-blue-50/55 dark:bg-blue-950/20 rounded-xl border border-blue-100/40 dark:border-blue-900/40">
                <div className="flex justify-between text-xs text-blue-600 font-bold">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Mengunggah data mutasi...
                  </span>
                  <span>{syncProgress}%</span>
                </div>
                <ProgressIndicator value={syncProgress} max={100} />
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                id="btn-trigger-sync"
                onClick={handleTriggerSync}
                disabled={isSyncing}
                className="grow bg-blue-600 hover:bg-blue-700 disabled:bg-slate-250 text-white text-xs font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Mentransmisikan Data...' : 'Mulai Sinkronisasi Sekarang'}
              </button>
            </div>
          </ReusableCard>

          {/* HISTORIK STATS & SCHEDULER MATRIX */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* STATISTIK SEJARAH SINKRONISASI */}
            <ReusableCard className="p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Metrik Transmisi Historis</h4>
              
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <span className="text-slate-500">Sinkronisasi Terakhir:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {engineStats?.lastSyncTime ? new Date(engineStats.lastSyncTime).toLocaleString('id-ID') : 'Belum pernah'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <span className="text-slate-500">Estimasi Sinkron Berikutnya:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {engineStats?.nextSyncTime ? new Date(engineStats.nextSyncTime).toLocaleTimeString('id-ID') : '60 detik dari sekarang'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <span className="text-slate-500">Total Mutasi Terproses:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {engineStats?.totalProcessed || 0} entitas
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <span className="text-slate-500">Transmisi Berhasil:</span>
                  <span className="font-bold text-emerald-600">
                    {engineStats?.totalSucceeded || 0} entitas
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Resolusi Konflik Terjadi:</span>
                  <span className="font-bold text-amber-600">
                    {engineStats?.totalConflicts || 0} kali
                  </span>
                </div>
              </div>
            </ReusableCard>

            {/* AUTOMATED BACKGROUND SCHEDULER CONFIG */}
            <ReusableCard className="p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Konfigurasi Pengjadwalan Otomatis</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                FC.OS secara konstan memeriksa antrean mutasi untuk didepositkan ke server awan ketika koneksi tersedia. Ubah frekuensi pemeriksaan otomatis di sini.
              </p>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Metode Sinkronisasi</span>
                    <p className="text-[10px] text-slate-500">Frekuensi pengunggahan otomatis di latar belakang</p>
                  </div>
                  <select 
                    id="select-scheduler-interval"
                    className="text-xs font-bold p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded"
                    defaultValue="60"
                  >
                    <option value="15">Setiap 15 Detik</option>
                    <option value="60">Setiap 60 Detik (Default)</option>
                    <option value="300">Setiap 5 Menit</option>
                    <option value="0">Manual Saja</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Kompresi Payload Transmisi</span>
                    <p className="text-[10px] text-slate-500">Kurangi konsumsi kuota data internet saat sync</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                </div>
              </div>
            </ReusableCard>
          </div>
        </div>
      )}

      {/* 2. ANTREAN & RESOLUSI TAB PANEL */}
      {activeSubTab === 'queue' && (
        <div className="space-y-6" id="panel-queue">
          {/* CONFLICT RESOLUTION SELECTOR */}
          <ReusableCard className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
              <Settings2 className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Strategi Resolusi Konflik</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tentukan bagaimana FC.OS menyelesaikan tabrakan data jika record yang sama telah dimodifikasi oleh supervisor di kantor pusat atau kolektor lain di server awan sebelum sinkronisasi HP ini selesai.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              {[
                { id: 'LAST_WRITE_WINS', title: 'Last Write Wins', desc: 'Versi lokal HP menimpa seluruh data server awan tanpa pengecualian.' },
                { id: 'NEWEST_VERSION', title: 'Newest Version', desc: 'Bandingkan riwayat pembaruan perangkat. Versi dengan revisi terbanyak menang.' },
                { id: 'BUSINESS_RULES', title: 'Business Rules', desc: 'Lindungi status krusial (misal: pembayaran terverifikasi tidak boleh ditimpa).' },
                { id: 'MANUAL', title: 'Manual Review', desc: 'Kunci transaksi bermasalah dalam status KONFLIK untuk persetujuan supervisor.' }
              ].map((item) => (
                <button
                  key={item.id}
                  id={`strategy-${item.id}`}
                  onClick={() => handleConflictStrategyChange(item.id as ConflictStrategy)}
                  className={`p-3 text-left border rounded-xl transition-all space-y-1.5 flex flex-col justify-between ${conflictStrategy === item.id ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20' : 'border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900/20 hover:bg-slate-50'}`}
                >
                  <span className={`text-xs font-extrabold ${conflictStrategy === item.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {item.title}
                  </span>
                  <p className="text-[10px] text-slate-500 leading-relaxed shrink-0">
                    {item.desc}
                  </p>
                </button>
              ))}
            </div>
          </ReusableCard>

          {/* QUEUE RECORDS LIST */}
          <ReusableCard className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Antrean Transmisi Lokal ({queueItems.length} mutasi)</h3>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                <span className="text-[11px] font-bold text-slate-500">Mengantre di memori lokal</span>
              </div>
            </div>

            {queueItems.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <Check className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Seluruh Data Tersinkron Sempurna!</p>
                <p className="text-[11px] text-slate-400">Tidak ada perubahan lokal yang tertunda atau mengalami kegagalan.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {queueItems.map((item) => (
                  <div 
                    key={item.id}
                    id={`queue-item-${item.id}`}
                    className={`p-3.5 border rounded-xl space-y-3 transition-all ${item.syncStatus === 'failed' ? 'border-rose-200 bg-rose-50/10 dark:border-rose-950/40' : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800/40'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                          {item.id}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' : item.action === 'UPDATE' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                          {item.action}
                        </span>
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                          {item.entityType.toUpperCase()} ({item.entityId})
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                        <span>Percobaan: <strong className="font-mono">{item.attempts}</strong>/5</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${item.syncStatus === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                          {item.syncStatus === 'failed' ? 'Gagal / Konflik' : 'Tertunda'}
                        </span>
                      </div>
                    </div>

                    {/* ERROR / CONFLICT DIAGNOSIS */}
                    {item.error && (
                      <div className="p-2.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-lg text-[11px] text-rose-700 dark:text-rose-400 leading-relaxed font-mono">
                        <strong>Error Diagnosis:</strong> {item.error}
                      </div>
                    )}

                    {/* INDIVIDUAL QUEUE ROW CONTROLS */}
                    <div className="flex justify-end items-center gap-2 border-t border-slate-100 dark:border-slate-850 pt-2.5">
                      {item.error?.includes('CONFLICT') && (
                        <>
                          <button
                            id={`override-${item.id}-client`}
                            onClick={() => handleForceClientWins(item)}
                            className="text-[10px] font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200"
                          >
                            Paksa Sisi Klien (Client Wins)
                          </button>
                          <button
                            id={`override-${item.id}-server`}
                            onClick={() => handleDiscardLocalChange(item)}
                            className="text-[10px] font-extrabold text-slate-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-350"
                          >
                            Batalkan Perubahan Lokal (Server Wins)
                          </button>
                        </>
                      )}
                      
                      <button
                        id={`retry-${item.id}`}
                        onClick={() => handleRetryItem(item.id)}
                        className="text-[10px] font-extrabold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg"
                      >
                        Paksa Antre Ulang
                      </button>
                      <button
                        id={`cancel-${item.id}`}
                        onClick={() => handleCancelQueueItem(item.id)}
                        className="text-[10px] font-extrabold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg"
                      >
                        Batalkan Transmisi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ReusableCard>
        </div>
      )}

      {/* 3. PROTEKSI & CADANGAN (BACKUP/RESTORE) TAB PANEL */}
      {activeSubTab === 'backup' && (
        <div className="space-y-6" id="panel-backup">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* EXPORT BACKUP PANEL */}
            <ReusableCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Download className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pencadangan Eksternal</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Ekspor seluruh konfigurasi operasional, catatan kolektor, mutasi pembayaran, and log audit ke dalam file JSON terenkripsi dan terkompresi.
              </p>

              <div className="space-y-3 pt-2">
                {/* BACKUP TYPE */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tipe Pencadangan:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="opt-backup-full"
                      onClick={() => setBackupType('full')}
                      className={`p-2.5 text-xs font-bold border rounded-lg text-center transition-all ${backupType === 'full' ? 'border-blue-600 bg-blue-50/20 text-blue-600 dark:text-blue-400' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      Penuh (Full Backup)
                    </button>
                    <button
                      id="opt-backup-inc"
                      onClick={() => setBackupType('incremental')}
                      className={`p-2.5 text-xs font-bold border rounded-lg text-center transition-all ${backupType === 'incremental' ? 'border-blue-600 bg-blue-50/20 text-blue-600 dark:text-blue-400' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      Inkremental (Hanya Revisi)
                    </button>
                  </div>
                </div>

                {/* PARAMETERS TOGGLE */}
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-850 pt-2">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Kompresi File Cadangan</span>
                      <p className="text-[10px] text-slate-400">Minimalkan kapasitas memori file</p>
                    </div>
                    <input
                      id="check-compress"
                      type="checkbox"
                      checked={compressBackup}
                      onChange={(e) => setCompressBackup(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer select-none border-t border-slate-50 dark:border-slate-850/40 pt-2">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Enkripsi Berkas Enterprise</span>
                      <p className="text-[10px] text-slate-400">Sandi pengaman rahasia FCOS untuk mencegah manipulasi data</p>
                    </div>
                    <input
                      id="check-encrypt"
                      type="checkbox"
                      checked={encryptBackup}
                      onChange={(e) => setEncryptBackup(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>
                </div>

                <button
                  id="btn-generate-backup"
                  onClick={handleGenerateBackup}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Unduh Berkas Cadangan (.json)
                </button>
              </div>
            </ReusableCard>

            {/* RESTORE BACKUP PANEL */}
            <ReusableCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Upload className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Restorasi Database</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Unggah file cadangan untuk memulihkan keadaan database lokal. Sistem otomatis membuat cadangan darurat sesaat sebelum pemulihan dijalankan.
              </p>

              {/* DRAG & DROP FILE UPLOAD AREA */}
              <div
                id="drop-zone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${isDragging ? 'border-blue-600 bg-blue-50/10' : importFileName ? 'border-emerald-500 bg-emerald-50/5' : 'border-slate-300 dark:border-slate-800 hover:bg-slate-50/50'}`}
              >
                <input
                  id="file-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".json"
                />
                
                {importFileName ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-850 dark:text-slate-100">{importFileName}</p>
                    <p className="text-[10px] text-slate-400">Berkas Cadangan Dimuat</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-slate-500">
                    <Upload className="w-6 h-6 mx-auto text-slate-400" />
                    <p className="text-xs font-bold">Seret & letakkan file cadangan di sini</p>
                    <p className="text-[10px] text-slate-400">Atau klik untuk menjelajahi penyimpanan HP</p>
                  </div>
                )}
              </div>

              {/* IMPORT VALIDATION DIAGNOSTIC VIEW */}
              {importValidationResult && (
                <div 
                  id="import-diagnostic"
                  className={`p-3 rounded-lg border text-xs leading-relaxed space-y-1.5 ${importValidationResult.isValid ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20' : 'bg-rose-50 border-rose-250 text-rose-900 dark:bg-rose-950/20'}`}
                >
                  <div className="font-extrabold flex items-center gap-1.5">
                    {importValidationResult.isValid ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
                    <span>{importValidationResult.isValid ? 'Validasi File Berhasil' : 'File Cadangan Cacat/Korup'}</span>
                  </div>
                  
                  {importValidationResult.isValid && importValidationResult.metadata ? (
                    <div className="space-y-1 text-[10px] font-mono leading-normal">
                      <div>• Jenis: {importValidationResult.metadata.backupType.toUpperCase()}</div>
                      <div>• Entitas Cadangan: {importValidationResult.metadata.recordCount} entitas</div>
                      <div>• Tanggal Cadangan: {new Date(importValidationResult.metadata.exportDate).toLocaleString('id-ID')}</div>
                      <div>• Hash: {importValidationResult.metadata.checksum}</div>
                    </div>
                  ) : (
                    <p className="text-[10px] font-mono">{importValidationResult.error}</p>
                  )}
                </div>
              )}

              {/* RESTORATION OPTIONS */}
              {importValidationResult?.isValid && (
                <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-850">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Metode Restorasi:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id="opt-restore-full"
                        onClick={() => setRestoreType('full')}
                        className={`p-2 text-xs font-bold border rounded-lg text-center transition-all ${restoreType === 'full' ? 'border-blue-600 bg-blue-50/20 text-blue-600' : 'border-slate-200'}`}
                      >
                        Timpa Total (Full Restore)
                      </button>
                      <button
                        id="opt-restore-part"
                        onClick={() => setRestoreType('partial')}
                        className={`p-2 text-xs font-bold border rounded-lg text-center transition-all ${restoreType === 'partial' ? 'border-blue-600 bg-blue-50/20 text-blue-600' : 'border-slate-200'}`}
                      >
                        Gabung Selektif (Partial)
                      </button>
                    </div>
                  </div>

                  {/* SELECTIVE TABLES SELECTOR FOR PARTIAL RESTORE */}
                  {restoreType === 'partial' && (
                    <div className="space-y-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Tabel yang digabungkan:</span>
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-800">
                        {[
                          { key: 'settings', label: 'Konfigurasi' },
                          { key: 'customers', label: 'Daftar Debitur' },
                          { key: 'visits', label: 'Laporan Kunjungan' },
                          { key: 'payments', label: 'Pembayaran' },
                          { key: 'promise_to_pay', label: 'Janji Bayar (PTP)' }
                        ].map(t => (
                          <label key={t.key} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTables.includes(t.key)}
                              onChange={() => handleTableCheckboxChange(t.key)}
                              className="w-3.5 h-3.5 rounded text-blue-600"
                            />
                            <span>{t.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    id="btn-execute-restore"
                    onClick={() => setIsRestoreConfirmOpen(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Wrench className="w-4 h-4" /> Mulai Pemulihan Sekarang
                  </button>
                </div>
              )}
            </ReusableCard>
          </div>

          {/* BACKUP HISTORY LOGS LIST */}
          <ReusableCard className="p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Riwayat Berkas Cadangan</h3>
              <History className="w-4 h-4 text-slate-400" />
            </div>

            {backupHistory.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 italic">Belum ada riwayat pencadangan data lokal.</p>
            ) : (
              <div className="overflow-x-auto text-xs leading-normal">
                <table className="w-full min-w-400">
                  <thead>
                    <tr className="text-slate-400 font-extrabold text-left border-b border-slate-100 dark:border-slate-850">
                      <th className="pb-2">ID CADANGAN</th>
                      <th className="pb-2">TANGGAL</th>
                      <th className="pb-2">NAMA BERKAS</th>
                      <th className="pb-2 text-right">KAPASITAS</th>
                      <th className="pb-2 text-right">ENTITAS</th>
                      <th className="pb-2 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[11px] text-slate-800 divide-y divide-slate-100 dark:divide-slate-850">
                    {backupHistory.map((bh) => (
                      <tr key={bh.id} className="hover:bg-slate-50/40">
                        <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">{bh.id}</td>
                        <td className="py-2.5">{new Date(bh.backupDate).toLocaleString('id-ID')}</td>
                        <td className="py-2.5 text-slate-500">{bh.fileName}</td>
                        <td className="py-2.5 text-right font-semibold">{(bh.fileSize / 1024).toFixed(2)} KB</td>
                        <td className="py-2.5 text-right font-bold">{bh.recordCount}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${bh.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {bh.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReusableCard>
        </div>
      )}

      {/* 4. VALIDASI INTEGRITAS TAB PANEL */}
      {activeSubTab === 'integrity' && (
        <div className="space-y-6" id="panel-integrity">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* INTEGRITY SCAN LAUNCHER */}
            <ReusableCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <ShieldAlert className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pemindaian Integritas Luring</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pindai IndexedDB untuk mendeteksi anomali skema, benturan UUID, record korup, and kunci asing (foreign key) yatim yang dapat merusak sinkronisasi cloud.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  id="btn-scan-integrity"
                  onClick={handleScanIntegrity}
                  disabled={isScanningIntegrity}
                  className="grow bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Activity className={`w-4 h-4 ${isScanningIntegrity ? 'animate-pulse' : ''}`} />
                  {isScanningIntegrity ? 'Memindai Database...' : 'Mulai Pindai Integritas'}
                </button>

                {integrityReport && !integrityReport.isValid && (
                  <button
                    id="btn-repair-db"
                    onClick={handleExecuteRepair}
                    disabled={isRepairing}
                    className="grow bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Wrench className={`w-4 h-4 ${isRepairing ? 'animate-spin' : ''}`} />
                    {isRepairing ? 'Memperbaiki...' : 'Jalankan Perbaikan Mandiri'}
                  </button>
                )}
              </div>

              {/* INTEGRITY STATS MATRIX */}
              {integrityReport && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl space-y-3 font-mono text-xs">
                  <div className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-b pb-1.5 flex justify-between">
                    <span>Hasil Ringkasan Pindai</span>
                    <span className={integrityReport.isValid ? 'text-emerald-600' : 'text-amber-600'}>
                      {integrityReport.isValid ? 'INTEGRAL' : 'ANOMALI TERDETEKSI'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Record:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{integrityReport.summary.totalRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Benturan UUID:</span>
                      <span className={`font-bold ${integrityReport.summary.duplicateUuids > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {integrityReport.summary.duplicateUuids}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Key Yatim (FK):</span>
                      <span className={`font-bold ${integrityReport.summary.orphanedKeys > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {integrityReport.summary.orphanedKeys}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Record Cacat:</span>
                      <span className={`font-bold ${integrityReport.summary.corrupted > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {integrityReport.summary.corrupted}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </ReusableCard>

            {/* HIGH WORKLOAD SIMULATOR */}
            <ReusableCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Activity className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Stress-Test Performa Mesin</h3>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Lakukan uji stres beban komputasi tinggi dengan memproses 5,000 lookup, audit, and hashing checksum data dalam sekejap untuk memverifikasi keandalan mesin di HP spek rendah.
              </p>

              <div className="pt-2">
                <button
                  id="btn-stress-test"
                  onClick={handleStressTestBenchmark}
                  disabled={isBenchmarking}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold py-3 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Activity className={`w-4 h-4 ${isBenchmarking ? 'animate-pulse' : ''}`} />
                  {isBenchmarking ? 'Menghitung Operasi Performa...' : 'Jalankan Stress Test (5k entitas)'}
                </button>
              </div>

              {/* BENCHMARK RESULT BLOCK */}
              {benchmarkResult && (
                <div id="benchmark-block" className="p-4 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/45 rounded-xl space-y-2.5 font-mono text-[11px] text-blue-800 dark:text-blue-300">
                  <div className="font-extrabold uppercase border-b pb-1">Hasil Tolok Ukur (Stress Benchmark)</div>
                  <div className="space-y-1">
                    <div>• Record Diproses: <strong className="font-bold text-slate-850 dark:text-slate-200">{benchmarkResult.recordCount.toLocaleString()} entitas</strong></div>
                    <div>• Lama Pemrosesan: <strong className="font-bold text-slate-850 dark:text-slate-200">{benchmarkResult.durationMs} milidetik</strong></div>
                    <div>• Throughput Kecepatan: <strong className="font-bold text-emerald-600">{benchmarkResult.throughput.toLocaleString()} ops/detik</strong></div>
                  </div>
                </div>
              )}
            </ReusableCard>
          </div>

          {/* DIAGNOSTICS DETAILED LIST */}
          {integrityReport && integrityReport.issues.length > 0 && (
            <ReusableCard className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-rose-100 pb-3">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-500">Rincian Anomali Database Terdeteksi</h3>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {integrityReport.issues.map((issue, idx) => (
                  <div 
                    key={idx}
                    className="p-3 bg-rose-50/40 border border-rose-100 rounded-lg font-mono text-[10px] text-rose-800 flex justify-between gap-4 items-start"
                  >
                    <div>
                      <div className="font-bold uppercase tracking-wide">[{issue.type}] Tabel: {issue.table} (ID: {issue.id})</div>
                      <p className="mt-1 leading-normal">{issue.message}</p>
                    </div>
                    <span className="shrink-0 bg-rose-100 text-rose-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">DIAGNOSED</span>
                  </div>
                ))}
              </div>
            </ReusableCard>
          )}
        </div>
      )}

      {/* DANGEROUS WIPE ZONE */}
      <ReusableCard className="p-5 border-red-200 dark:border-red-900/40 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-red-600">Pusat Darurat Keamanan Data</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Penyetelan keras (Hard Reset) membersihkan seluruh database IndexedDB lokal, token sesi keamanan, riwayat cadangan, and log di HP ini. Gunakan hanya jika perangkat mengalami kegagalan sistem total.
        </p>
        <button
          id="btn-hard-wipe"
          onClick={() => setIsHardWipeConfirmOpen(true)}
          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/40 text-rose-600 border border-rose-200 dark:border-rose-900/45 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" /> Reset Bersih Seluruh Aplikasi
        </button>
      </ReusableCard>

      {/* CONFIRMATION RESTORE DIALOG */}
      <ConfirmationDialog
        isOpen={isRestoreConfirmOpen}
        title="Konfirmasi Restorasi Database"
        message="Apakah Anda yakin ingin memulihkan database dari file ini? Sistem otomatis membuat cadangan keamanan (pre-restore safety backup) untuk memastikan pemulihan aman."
        confirmLabel="Ya, Pulihkan Sekarang"
        cancelLabel="Batal"
        onConfirm={handleExecuteRestore}
        onCancel={() => setIsRestoreConfirmOpen(false)}
      />

      {/* CONFIRMATION HARD RESET DIALOG */}
      <ConfirmationDialog
        isOpen={isHardWipeConfirmOpen}
        title="Konfirmasi Hard Reset Aplikasi"
        message="PERINGATAN: Tindakan ini menghapus total seluruh data luring lokal Anda. Seluruh perubahan yang belum terunggah ke Cloud server akan lenyap secara permanen. Lanjutkan?"
        confirmLabel="Hapus Permanen"
        cancelLabel="Batal"
        onConfirm={handleWipeDatabase}
        onCancel={() => setIsHardWipeConfirmOpen(false)}
      />
    </div>
  );
};

export default SyncScreen;
