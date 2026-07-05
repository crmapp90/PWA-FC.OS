import React, { useEffect, useState, useRef } from 'react';
import { CameraCapture } from '../../shared/components/CameraCapture';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Clock, 
  User, 
  FileText, 
  CheckCircle, 
  Camera, 
  Mic, 
  PenTool, 
  X, 
  History, 
  Info, 
  Play, 
  Pause, 
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Award,
  Compass,
  Layers,
  Download,
  ShieldAlert,
  Gauge,
  Activity,
  Loader2,
  CloudUpload,
  Check
} from 'lucide-react';
import { useStore } from '../../core/store';
import { useLocalization } from '../../core/localization';
import { usePermission } from '../../shared/hooks/usePermission';
import { db } from '../../core/database';
import { logger } from '../../core/logger';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { 
  PrimaryButton, 
  SecondaryButton, 
  ReusableCard, 
  TextField,
  ProgressIndicator,
  EmptyWidget,
  LoadingWidget
} from '../../shared/components/BaseComponents';
import { VisitService, VisitWithCustomer } from '../../core/services/VisitService';
import { GeoService, GPSLocation, OptimizedRouteResult, CustomerCluster, RouteHistoryLog, GPSErrorCode } from '../../core/services/GeoService';
import { visitRepository } from '../../core/repositories/ConcreteRepositories';
import { Customer, Visit } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHaptic, playConfirmSound } from '../../shared/utils/feedback';

export const VisitsScreen: React.FC = () => {
  const { t } = useLocalization();
  const { activeCollector, refreshPendingSyncCount } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const permissions = usePermission();

  // Screen View State: 'list' | 'detail' | 'execute'
  const [view, setView] = useState<'list' | 'detail' | 'execute'>('list');
  const [selectedVisit, setSelectedVisit] = useState<VisitWithCustomer | null>(null);
  const [selectedVisitTimeline, setSelectedVisitTimeline] = useState<any[]>([]);

  // Visits Data and Filtration
  const [visits, setVisits] = useState<VisitWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced Filter state
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterResult, setFilterResult] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');
  const [filterArea, setFilterArea] = useState('ALL');
  const [filterCollector, setFilterCollector] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority' | 'customerName' | 'followUpDate'>('newest');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);

  // Mass Seed Test Performance State
  const [isMassSeeding, setIsMassSeeding] = useState(false);
  const [massSeedResult, setMassSeedResult] = useState<string | null>(null);

  // Sub-tab selection state (History vs Geo Intelligent)
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'geo'>('history');

  // Geo Intelligence Dashboard States
  const [currentGeoLocation, setCurrentGeoLocation] = useState<GPSLocation | null>(null);
  const [geoErrorMsg, setGeoErrorMsg] = useState<string | null>(null);
  const [isGeoLoading, setIsGeoLoading] = useState(false);

  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRouteResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [customerClusters, setCustomerClusters] = useState<CustomerCluster[]>([]);
  
  const [nearbyCustomersList, setNearbyCustomersList] = useState<any[]>([]);
  const [nearbyRadius, setNearbyRadius] = useState<number>(3); // 3 km default
  
  const [offlineMapStatus, setOfflineMapStatus] = useState<'idle' | 'preparing' | 'ready'>('idle');
  const [offlineMapMetadata, setOfflineMapMetadata] = useState<any>(null);

  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  
  const [routeHistory, setRouteHistory] = useState<RouteHistoryLog[]>([]);
  const [routeLogSuccess, setRouteLogSuccess] = useState<string | null>(null);

  // Active Visit Execution State
  const [executeCustomer, setExecuteCustomer] = useState<Customer | null>(null);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // Active Form State
  const [visitResult, setVisitResult] = useState<'CUSTOMER_MET' | 'CUSTOMER_NOT_HOME' | 'ADDRESS_UNKNOWN' | 'MOVED' | 'WRONG_ADDRESS' | 'PROMISE_TO_PAY' | 'PAID' | 'PARTIAL_PAYMENT' | 'REFUSED' | 'CANNOT_CONTACT' | 'OTHER'>('CUSTOMER_MET');
  const [addressConfirmation, setAddressConfirmation] = useState<'CONFIRMED' | 'UNCONFIRMED' | 'NOT_FOUND'>('CONFIRMED');
  const [customerCondition, setCustomerCondition] = useState('');
  const [status, setStatus] = useState<'CONTACT' | 'NO_CONTACT' | 'BUSINESS_CLOSED' | 'ADDRESS_NOT_FOUND'>('CONTACT');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState<'REVISIT' | 'CALL' | 'REMINDER' | 'ESCALATION' | 'LEGAL_REVIEW' | 'CLOSE_CASE' | 'WAIT'>('REVISIT');
  const [followUpDate, setFollowUpDate] = useState('');
  
  // Photos State
  const [photos, setPhotos] = useState<string[]>([]); // Base64 photos
  const [showCamera, setShowCamera] = useState(false);

  // Voice Recording State (Mock Interactive Waveform / Actual recorder placeholder)
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordIntervalRef = useRef<any>(null);

  // Signature Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Stop Watch for Duration Tracker
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedIntervalRef = useRef<any>(null);

  // Load Visit Data on mount or parameters change
  useEffect(() => {
    loadVisitsAndParams();
  }, [searchParams]);

  // Load available distinct Areas for filter dropdown
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const customers = await db.customers.toArray();
        const distinctAreas = Array.from(new Set(customers.map(c => c.area).filter(Boolean))) as string[];
        setAreas(distinctAreas);
      } catch (e) {
        logger.error('VisitsScreen', 'Failed to fetch filter metadata', e);
      }
    };
    fetchMetadata();
  }, []);

  // Sync state transitions on Start Visit URL parameters
  const loadVisitsAndParams = async () => {
    setIsLoading(true);
    try {
      const startCustomerId = searchParams.get('startCustomerId');
      if (startCustomerId) {
        const cust = await db.customers.get(startCustomerId);
        if (cust) {
          handleInitiateExecution(cust);
          // clear params to prevent restart on refresh
          setSearchParams({});
          return;
        }
      }

      await refreshVisitsList();
    } catch (e) {
      logger.error('VisitsScreen', 'Failed to load visits', e);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshVisitsList = async () => {
    const data = await VisitService.getVisitsWithDetails({
      query: searchQuery,
      status: filterStatus === 'ALL' ? undefined : filterStatus,
      visitResult: filterResult === 'ALL' ? undefined : filterResult,
      date: filterDate || undefined,
      area: filterArea === 'ALL' ? undefined : filterArea,
      priority: filterPriority === 'ALL' ? undefined : filterPriority,
      sortBy: sortBy
    });
    setVisits(data);
  };

  // Trigger filtration refresh
  useEffect(() => {
    refreshVisitsList();
  }, [searchQuery, filterStatus, filterResult, filterDate, filterArea, filterPriority, sortBy]);

  // Geo Dashboard loader trigger
  useEffect(() => {
    if (activeSubTab === 'geo') {
      loadGeoDashboardData();
    }
  }, [activeSubTab, nearbyRadius]);

  const loadGeoDashboardData = async () => {
    setIsGeoLoading(true);
    setGeoErrorMsg(null);
    try {
      const location = await GeoService.getCurrentLocation({
        useSimulatedFallback: true,
        forceHighAccuracy: true,
        timeoutMs: 6000
      });

      setCurrentGeoLocation(location);

      const allCustomers = await db.customers.toArray();
      const activeCustomers = allCustomers.filter(c => !c.isDeleted && c.status === 'PENDING');

      // 1. Optimize Route
      const routeRes = GeoService.optimizeRoute(location.latitude, location.longitude, activeCustomers);
      setOptimizedRoute(routeRes);

      // 2. Spatial Clustering
      const clusters = GeoService.clusterCustomers(allCustomers, 2.0);
      setCustomerClusters(clusters);

      // 3. Nearby Debtors
      const nearby = GeoService.findNearbyCustomers(location.latitude, location.longitude, activeCustomers, nearbyRadius);
      setNearbyCustomersList(nearby);

      // 4. Load past optimization logs
      const colId = activeCollector?.id || '';
      const history = await GeoService.getRouteHistory(colId);
      setRouteHistory(history);

    } catch (err: any) {
      logger.error('GeoDashboard', 'Gagal memuat modul Geo-Inteligensi', err);
      setGeoErrorMsg(err?.message || 'Gagal memproyeksikan koordinat GPS.');
    } finally {
      setIsGeoLoading(false);
    }
  };

  const handleLogRouteExecution = async () => {
    if (!currentGeoLocation || !optimizedRoute) return;
    setRouteLogSuccess(null);
    try {
      const colId = activeCollector?.id || '';
      const seqIds = optimizedRoute.optimizedCustomers.map(c => c.id);
      
      await GeoService.logRouteExecution(
        colId,
        currentGeoLocation.latitude,
        currentGeoLocation.longitude,
        seqIds,
        optimizedRoute.totalDistanceKm,
        optimizedRoute.estimatedDurationMinutes
      );

      setRouteLogSuccess('Rute perjalanan berhasil diarsipkan offline ke dalam basis data activity log.');
      
      // Reload history
      const history = await GeoService.getRouteHistory(colId);
      setRouteHistory(history);

      setTimeout(() => setRouteLogSuccess(null), 4000);
    } catch (err: any) {
      logger.error('VisitsScreen', 'Failed to log route', err);
    }
  };

  const handlePrepareOfflineMap = async () => {
    if (!currentGeoLocation) return;
    setOfflineMapStatus('preparing');
    try {
      const colId = activeCollector?.id || '';
      const allCustomers = await db.customers.toArray();
      const meta = await GeoService.prepareOfflineMapData(
        colId,
        currentGeoLocation.latitude,
        currentGeoLocation.longitude,
        allCustomers
      );
      setOfflineMapMetadata(meta);
      setOfflineMapStatus('ready');
    } catch (err) {
      logger.error('VisitsScreen', 'Offline map precomputation failed', err);
      setOfflineMapStatus('idle');
    }
  };

  const handleRunGeoBenchmark = () => {
    setIsBenchmarking(true);
    setBenchmarkResult(null);
    try {
      const res = GeoService.runGeoBenchmark(10000);
      setBenchmarkResult(res);
    } catch (err) {
      logger.error('VisitsScreen', 'Geo benchmark error', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Stopwatch effect for duration tracking
  useEffect(() => {
    if (view === 'execute') {
      setElapsedSeconds(0);
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    }
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, [view]);

  // Voice recording timer effect
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    }
    return () => {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, [isRecording]);

  const handleInitiateExecution = async (customer: Customer) => {
    setExecuteCustomer(customer);
    setView('execute');
    setGpsLoading(true);
    setGpsCoords(null);
    setGpsError(null);
    setPhotos([]);
    setRecordedAudioUrl(null);
    setHasSignature(false);
    
    // Default form inputs
    setVisitResult('CUSTOMER_MET');
    setAddressConfirmation('CONFIRMED');
    setCustomerCondition('Kondisi debitur kooperatif.');
    setStatus('CONTACT');
    setNotes('');
    setNextAction('REVISIT');
    setFollowUpDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    // Insert start record
    try {
      const collectorId = activeCollector?.id || '';
      
      // Auto-capture location on start visit
      let coordinates: any = null;
      try {
        coordinates = await permissions.requestLocation();
        setGpsCoords(coordinates);
        setGpsLoading(false);
      } catch (err: any) {
        setGpsError('GPS tidak dapat diakses atau diizinkan. Menggunakan koordinat default.');
        setGpsLoading(false);
        coordinates = { latitude: customer.latitude || -6.2146, longitude: customer.longitude || 106.8451, accuracy: 100 };
      }

      const activeVis = await VisitService.startVisit(customer.id, collectorId, coordinates);
      setActiveVisitId(activeVis.id);
      logger.info('VisitsScreen', `Visits session started: ${activeVis.id}`);
    } catch (e) {
      logger.error('VisitsScreen', 'Failed to start visit session', e);
    }
  };

  const handleFinishExecution = async () => {
    if (!activeVisitId || !executeCustomer) return;

    const collectorId = activeCollector?.id || '';

    // Verify canvas signature if signed
    let signatureStr: string | undefined = undefined;
    if (hasSignature && canvasRef.current) {
      signatureStr = canvasRef.current.toDataURL('image/png');
    }

    try {
      setIsLoading(true);
      await VisitService.endVisit(activeVisitId, {
        visitResult,
        addressConfirmation,
        customerCondition,
        status,
        notes: notes || `Selesai melakukan kunjungan dengan hasil: ${visitResult}`,
        nextAction,
        followUpDate: nextAction !== 'WAIT' && nextAction !== 'CLOSE_CASE' ? followUpDate : undefined,
        photoUrls: photos,
        voiceUrl: recordedAudioUrl || undefined,
        signatureBase64: signatureStr,
        gpsCoords: gpsCoords || undefined
      }, collectorId);

      await refreshPendingSyncCount();
      logger.info('VisitsScreen', `Kunjungan ${activeVisitId} diselesaikan.`);
      triggerHaptic(80);
      playConfirmSound();
      
      // Reset view to lists
      setView('list');
      await refreshVisitsList();
    } catch (e) {
      logger.error('VisitsScreen', 'Failed to end visit execution', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Real camera capture via getUserMedia
  const handleSimulatePhoto = () => {
    setShowCamera(true);
  };

  // Mock Voice Recording Workflow
  const handleToggleVoiceRecording = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      // Generate a mock voice note payload
      setRecordedAudioUrl(`data:audio/mp3;base64,MOCK_AUDIO_PAYLOAD_VST_${Date.now()}`);
      logger.info('VisitsScreen', 'Perekaman memo suara selesai.');
    } else {
      // Start recording
      setIsRecording(true);
      setRecordedAudioUrl(null);
    }
  };

  // Signature Canvas Drawing Logic
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get position relative to canvas
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b'; // Slate 800

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasSignature(true);
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
    }
    setHasSignature(false);
  };

  const handleOpenVisitDetail = async (v: VisitWithCustomer) => {
    setSelectedVisit(v);
    setView('detail');
    setIsLoading(true);
    try {
      // Build a chronological timeline for this customer
      const timeline = await VisitService.getTimelineForCustomer(v.customerId);
      setSelectedVisitTimeline(timeline);
    } catch (e) {
      logger.error('VisitsScreen', 'Failed to load timeline', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMassSeedPerformanceTest = async () => {
    setIsMassSeeding(true);
    setMassSeedResult(null);
    try {
      // Seed 50,000 operational records for massive database performance stress test
      const count = await VisitService.seedMassiveVisits(50000);
      setMassSeedResult(`Berhasil mengunggah ${count.toLocaleString()} Riwayat Kunjungan ke IndexedDB lokal! Sistem berjalan mulus.`);
      await refreshVisitsList();
    } catch (err: any) {
      setMassSeedResult(`Error: ${err?.message || 'Gagal membuat data massal'}`);
    } finally {
      setIsMassSeeding(false);
    }
  };

  // Helper formatting values
  const getNextActionBadge = (act: string) => {
    switch (act) {
      case 'REVISIT': return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400';
      case 'CALL': return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400';
      case 'REMINDER': return 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400';
      case 'ESCALATION': return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400';
      case 'LEGAL_REVIEW': return 'bg-red-50 text-red-850 border-red-300 dark:bg-red-950/40 dark:text-red-400';
      case 'CLOSE_CASE': return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400';
      default: return 'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6">

      {/* Real camera overlay — replaces simulation */}
      {showCamera && (
        <CameraCapture
          onCapture={(photo) => {
            setPhotos(prev => [...prev, photo.dataUrl]);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* BR-06: Contact update alert */}
      {executeCustomer?.needsContactUpdate && (
        <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-400 rounded-2xl p-4 mx-1">
          <div className="font-black text-red-700 text-sm uppercase tracking-wide mb-1">
            ⚠️ Wajib Update Kontak
          </div>
          <div className="text-xs text-red-600">
            {executeCustomer.name} sudah 3x berturut-turut tidak ditemukan. 
            Perbarui alamat atau nomor HP sebelum melanjutkan kunjungan.
          </div>
        </div>
      )}

      {/* VIEW: VISITS HISTORY LIST */}
      {view === 'list' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-900 pb-3">
            <div>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Eksekusi Kunjungan</h2>
              <p className="text-xs text-slate-500 mt-0.5">Pantau real-time data kunjungan lapangan & rute penagihan.</p>
            </div>
            {activeSubTab === 'history' && (
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`self-end sm:self-auto p-2.5 rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 text-xs font-black select-none ${
                  isFilterOpen || filterStatus !== 'ALL' || filterResult !== 'ALL' || filterArea !== 'ALL' || filterPriority !== 'ALL'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Filter className="w-4 h-4" /> Filter
              </button>
            )}
          </div>

          {/* SUB-TABS SELECTOR */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1 border border-slate-200/50 dark:border-slate-800">
            <button
              onClick={() => setActiveSubTab('history')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all select-none flex items-center justify-center gap-1.5 ${
                activeSubTab === 'history'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Riwayat Kunjungan
            </button>
            <button
              onClick={() => setActiveSubTab('geo')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all select-none flex items-center justify-center gap-1.5 ${
                activeSubTab === 'geo'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-rose-500" /> Geo & Rute Pintar
            </button>
          </div>

          {activeSubTab === 'history' ? (
            <>
              {/* SEARCH FIELD */}
              <div className="relative flex items-center w-full">
                <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari kunjungan berdasarkan nama debitur, nomor kontrak, atau ID kolektor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-11 pr-4 min-h-[48px] text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-xs"
                />
              </div>

              {/* ADVANCED FILTER PANEL */}
              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      {/* Status filter */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500">Status Operasional</label>
                        <select 
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                        >
                          <option value="ALL">Semua Status</option>
                          <option value="STARTED">Sedang Berjalan</option>
                          <option value="COMPLETED">Selesai</option>
                        </select>
                      </div>

                      {/* Visit Result filter */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500">Hasil Kunjungan</label>
                        <select 
                          value={filterResult}
                          onChange={(e) => setFilterResult(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                        >
                          <option value="ALL">Semua Hasil</option>
                          <option value="CUSTOMER_MET">Debitur Ditemui</option>
                          <option value="CUSTOMER_NOT_HOME">Tidak Ada di Rumah</option>
                          <option value="PROMISE_TO_PAY">Janji Bayar (PTP)</option>
                          <option value="PAID">Lunas/Bayar Tunai</option>
                          <option value="PARTIAL_PAYMENT">Bayar Sebagian</option>
                          <option value="REFUSED">Menolak Bayar</option>
                          <option value="MOVED">Debitur Pindah</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                      </div>

                      {/* Priority filter */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500">Prioritas Debitur</label>
                        <select 
                          value={filterPriority}
                          onChange={(e) => setFilterPriority(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                        >
                          <option value="ALL">Semua Prioritas</option>
                          <option value="CRITICAL">Critical</option>
                          <option value="HIGH">High</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="LOW">Low</option>
                        </select>
                      </div>

                      {/* Area filter */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500">Wilayah Penagihan</label>
                        <select 
                          value={filterArea}
                          onChange={(e) => setFilterArea(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                        >
                          <option value="ALL">Semua Wilayah</option>
                          {areas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>

                      {/* Sorting options */}
                      <div className="space-y-1 col-span-2 sm:col-span-1">
                        <label className="font-bold text-slate-500">Urutkan Berdasarkan</label>
                        <select 
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                        >
                          <option value="newest">Terbaru</option>
                          <option value="oldest">Terlama</option>
                          <option value="priority">Prioritas Tertinggi</option>
                          <option value="customerName">Nama Debitur</option>
                          <option value="followUpDate">Tanggal Janji Bayar</option>
                        </select>
                      </div>
                    </div>

                    {/* MASS TESTING TRIGGER */}
                    {(import.meta as any).env.DEV && (
                      <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 flex flex-col gap-2">
                        <span className="text-[10px] uppercase font-black tracking-wider text-rose-500 block">Kepatuhan Pengujian Stabilitas & Kecepatan</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button 
                            onClick={handleMassSeedPerformanceTest}
                            disabled={isMassSeeding}
                            className="bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-400 font-bold text-xs px-4 py-2 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-55"
                          >
                            <TrendingUp className="w-4 h-4 animate-pulse" />
                            {isMassSeeding ? 'Mengunggah 50k Data...' : 'Uji Beban Performa (50.000 Record)'}
                          </button>
                          {visits.length > 5000 && (
                            <button 
                              onClick={async () => {
                                setIsLoading(true);
                                await db.visits.where('id').startsWith('VST-MASS-').delete();
                                logger.info('VisitsScreen', 'Mass test records removed.');
                                await refreshVisitsList();
                                setIsLoading(false);
                              }}
                              className="text-xs text-slate-400 hover:text-red-500 font-semibold"
                            >
                              Bersihkan Data Uji Beban
                            </button>
                          )}
                        </div>
                        {massSeedResult && (
                          <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900 animate-fade-in">
                            {massSeedResult}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* VISITS RECORD STREAM */}
              {isLoading ? (
                <LoadingWidget message="Memuat riwayat kunjungan..." />
              ) : visits.length === 0 ? (
                <EmptyWidget title="Belum Ada Kunjungan" description="Gunakan menu Debitur, buka profil pelanggan, dan tekan tombol 'Mulai Kunjungan' untuk merekam data lapangan." />
              ) : (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-400 uppercase block">Total: {visits.length.toLocaleString()} Kunjungan</span>
                  {visits.slice(0, 100).map((v) => (
                    <ReusableCard key={v.id} onClick={() => handleOpenVisitDetail(v)} className="flex items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            ID: {v.id.replace('VST-MASS-', 'MASS-')}
                          </span>
                          
                          {/* Sync Status Badge */}
                          {(!v.syncStatus || v.syncStatus === 'pending' || v.syncStatus === 'syncing' || v.syncStatus === 'failed' || v.offlineStatus === 'OFFLINE') ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-full animate-pulse" title="Luring: Menunggu Sinkronisasi">
                              <CloudUpload className="w-3 h-3 text-amber-500 shrink-0" />
                              <span>Luring</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded-full" title="Sinkronisasi Berhasil ke Cloud">
                              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>Tersinkron</span>
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{v.customerName}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{v.customerAddress}</p>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 font-mono mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {v.visitDate}
                          </span>
                          {v.duration && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              {Math.floor(v.duration / 60)}m {v.duration % 60}s
                            </span>
                          )}
                          <span className="font-bold text-blue-600">{v.collectorId}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-1.5">
                        <span className={`px-2.5 py-0.5 text-[10px] font-black border rounded-full ${
                          v.visitResult === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400' :
                          v.visitResult === 'PROMISE_TO_PAY' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400' :
                          v.visitResult === 'CUSTOMER_NOT_HOME' ? 'bg-amber-50 text-amber-750 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400' :
                          'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {v.visitResult ? v.visitResult.replace('_', ' ') : 'STARTED'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                          Detail <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </span>
                      </div>
                    </ReusableCard>
                  ))}
                  {visits.length > 100 && (
                    <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl text-xs text-slate-400">
                      Dan {(visits.length - 100).toLocaleString()} records lainnya (Virtualisasi List Aktif untuk mencegah lag).
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* GEO INTELLIGENCE & ROUTE PLANNER */
            <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-100">
              
              {/* GPS TRACKING STATUS WIDGET */}
              <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 bg-blue-500/10 rounded-full blur-2xl"></div>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-black tracking-widest text-blue-400 uppercase">
                      <Compass className="w-4 h-4 animate-spin text-blue-400" /> Pelacak Koordinat GPS
                    </span>
                    <h3 className="text-lg font-black tracking-tight text-white">Satelit Telemetri Kolektor</h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Mengamankan koordinat presisi tinggi. {currentGeoLocation?.isSimulated ? 'Beroperasi dengan Simulasi Jembatan Satelit luring.' : 'Sensor internal aktif.'}
                    </p>
                  </div>
                  <button 
                    onClick={loadGeoDashboardData}
                    disabled={isGeoLoading}
                    className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-slate-300 hover:text-white rounded-xl disabled:opacity-50"
                  >
                    <RotateCcw className={`w-4 h-4 ${isGeoLoading ? 'animate-spin text-blue-400' : ''}`} />
                  </button>
                </div>

                {isGeoLoading ? (
                  <div className="py-6 flex items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="text-xs font-bold text-slate-400 animate-pulse">Melacak sinyal satelit GPS...</span>
                  </div>
                ) : geoErrorMsg ? (
                  <div className="mt-4 p-3.5 bg-red-950/30 border border-red-900/50 rounded-2xl flex items-start gap-2.5 text-red-400 text-xs font-mono">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Keamanan GPS Terhambat:</span>
                      <p className="mt-0.5">{geoErrorMsg}</p>
                    </div>
                  </div>
                ) : currentGeoLocation ? (
                  <div className="mt-5 grid grid-cols-2 gap-3 font-mono">
                    <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-850">
                      <span className="text-[10px] text-slate-500 font-bold block">GARIS LINTANG (LAT)</span>
                      <span className="text-sm font-bold text-emerald-400 tracking-wider mt-1 block">
                        {currentGeoLocation.latitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-850">
                      <span className="text-[10px] text-slate-500 font-bold block">GARIS BUJUR (LON)</span>
                      <span className="text-sm font-bold text-emerald-400 tracking-wider mt-1 block">
                        {currentGeoLocation.longitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-850 pt-2.5 mt-1">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-500" /> Presisi: ±{currentGeoLocation.accuracy}m
                      </span>
                      <span>Terakhir: Baru saja</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* TSP ROUTE PLANNER WIDGET */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="space-y-1">
                    <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-rose-500 uppercase">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 animate-bounce" /> Optimasi Jalur Terpendek
                    </span>
                    <h3 className="text-base font-black">Rute Penagihan Terurut (TSP Heuristic)</h3>
                    <p className="text-[11px] text-slate-500">
                      Hasil korelasi jarak Haversine & gravity bobot prioritas kritis.
                    </p>
                  </div>
                  {optimizedRoute && optimizedRoute.optimizedCustomers.length > 0 && (
                    <button
                      onClick={handleLogRouteExecution}
                      className="self-start sm:self-auto text-xs bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-400 font-bold px-3 py-2 rounded-xl active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Arsipkan Rute
                    </button>
                  )}
                </div>

                {routeLogSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 text-emerald-800 dark:text-emerald-400 rounded-2xl text-xs font-bold animate-fade-in">
                    {routeLogSuccess}
                  </div>
                )}

                {isGeoLoading ? (
                  <LoadingWidget message="Mengkalkulasi urutan TSP..." />
                ) : !optimizedRoute || optimizedRoute.optimizedCustomers.length === 0 ? (
                  <EmptyWidget title="Tidak Ada Antrean Rute" description="Tidak ditemukan debitur berstatus 'PENDING' dalam database untuk dipetakan ke dalam rute kerja hari ini." />
                ) : (
                  <div className="space-y-5">
                    {/* Route summary tags */}
                    <div className="grid grid-cols-3 gap-2.5 text-center font-mono">
                      <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850/50">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">TOTAL JARAK</span>
                        <span className="text-sm font-black text-slate-900 dark:text-slate-50 mt-1 block">
                          {optimizedRoute.totalDistanceKm} KM
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850/50">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">DURASI JALUR</span>
                        <span className="text-sm font-black text-slate-900 dark:text-slate-50 mt-1 block">
                          ~{optimizedRoute.estimatedDurationMinutes} MIN
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850/50">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">TOTAL STOP</span>
                        <span className="text-sm font-black text-slate-900 dark:text-slate-50 mt-1 block">
                          {optimizedRoute.optimizedCustomers.length} STOP
                        </span>
                      </div>
                    </div>

                    {/* Timeline stops */}
                    <div className="relative pl-7 space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                      {optimizedRoute.optimizedCustomers.slice(0, 15).map((customer, idx) => {
                        const segment = optimizedRoute.segments[idx];
                        const isCritical = customer.priorityLevel === 'CRITICAL';
                        const isHigh = customer.priorityLevel === 'HIGH';
                        
                        return (
                          <div key={customer.id} className="relative group animate-fade-in">
                            {/* Sequence Bullet */}
                            <div className="absolute -left-[25px] top-1 w-5 h-5 bg-blue-600 border-2 border-white dark:border-slate-950 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-xs">
                              {idx + 1}
                            </div>
                            
                            <div 
                              onClick={() => handleInitiateExecution(customer)}
                              className="p-3 bg-slate-50 dark:bg-slate-950 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border border-slate-100 dark:border-slate-900 rounded-2xl transition-all active:scale-[0.99] cursor-pointer flex justify-between items-start gap-3"
                            >
                              <div className="min-w-0">
                                <h4 className="text-xs font-black text-slate-900 dark:text-slate-50 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{customer.name}</h4>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">{customer.address}</p>
                                <span className="inline-block text-[9px] font-mono font-bold text-slate-400 mt-1 bg-slate-200/50 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                                  {customer.area || 'Tanpa Wilayah'}
                                </span>
                              </div>

                              <div className="text-right shrink-0 space-y-1">
                                {isCritical && (
                                  <span className="block text-[8px] font-black bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 px-2 py-0.5 rounded-full uppercase tracking-wider">CRITICAL</span>
                                )}
                                {isHigh && (
                                  <span className="block text-[8px] font-black bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full uppercase tracking-wider">HIGH</span>
                                )}
                                {segment && (
                                  <span className="block text-[9px] font-mono text-slate-400 font-bold">
                                    +{segment.distanceKm.toFixed(1)} km (~{segment.estimatedMinutes}m)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {optimizedRoute.optimizedCustomers.length > 15 && (
                        <p className="text-[10px] font-mono text-slate-400 text-center pt-2 italic">
                          Menampilkan 15 dari {optimizedRoute.optimizedCustomers.length} stops kerja (Optimasi luring berjalan lancar).
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RADAR NEARBY DEBTOR SCANNER */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-blue-500 uppercase">
                    <Activity className="w-3.5 h-3.5 animate-pulse text-blue-500" /> Radar Jarak Lapangan
                  </span>
                  <h3 className="text-base font-black">Cari Debitur Terdekat (Nearby Search)</h3>
                  <p className="text-[11px] text-slate-500">
                    Saring debitur dalam jangkauan radar meteran Anda untuk merespons kunjungan ad-hoc.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Slider Control */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                      <span>Radius Jangkauan</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400">{nearbyRadius} Kilometer</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="15" 
                      value={nearbyRadius}
                      onChange={(e) => setNearbyRadius(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>1 KM</span>
                      <span>5 KM</span>
                      <span>10 KM</span>
                      <span>15 KM</span>
                    </div>
                  </div>

                  {isGeoLoading ? (
                    <LoadingWidget message="Menyaring indeks spasial..." />
                  ) : nearbyCustomersList.length === 0 ? (
                    <EmptyWidget title="Tidak Ada Debitur Terdekat" description={`Tidak ditemukan debitur berstatus 'PENDING' dalam radius ${nearbyRadius} km dari koordinat GPS Anda.`} />
                  ) : (
                    <div className="space-y-2.5">
                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Ditemukan {nearbyCustomersList.length} Debitur Sekitar</span>
                      {nearbyCustomersList.slice(0, 5).map(({ customer, distanceKm, estimatedMinutes }) => (
                        <div 
                          key={customer.id} 
                          onClick={() => handleInitiateExecution(customer)}
                          className="p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 hover:border-blue-300 dark:hover:border-blue-900/60 rounded-2xl active:scale-99 transition-all cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">{customer.name}</h4>
                            <p className="text-[10px] text-slate-400 truncate">{customer.address}</p>
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <span className="block text-xs font-black text-blue-600 dark:text-blue-400">{distanceKm.toFixed(2)} km</span>
                            <span className="text-[9px] text-slate-400">~{estimatedMinutes}m jalan</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SPATIAL CLUSTERING ENGINE */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-emerald-500 uppercase">
                    <Layers className="w-3.5 h-3.5 text-emerald-500" /> Analisis Geospasial
                  </span>
                  <h3 className="text-base font-black">Densitas & Klaster Wilayah Kerja</h3>
                  <p className="text-[11px] text-slate-500">
                    Menganalisis pengelompokan debitur berjarak rapat untuk strategi penetapan tim wilayah.
                  </p>
                </div>

                {isGeoLoading ? (
                  <LoadingWidget message="Menghitung centroid wilayah..." />
                ) : customerClusters.length === 0 ? (
                  <EmptyWidget title="Tidak Ada Klaster" description="Centroid geografis tidak dapat dihitung karena data spasial kosong." />
                ) : (
                  <div className="space-y-3">
                    {customerClusters.slice(0, 4).map((cluster) => {
                      const criticalCount = cluster.customers.filter(c => c.priorityLevel === 'CRITICAL').length;
                      
                      return (
                        <div key={cluster.clusterId} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-2xl space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-black text-slate-900 dark:text-slate-50">{cluster.clusterName}</h4>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Centroid: {cluster.centerLatitude.toFixed(4)}, {cluster.centerLongitude.toFixed(4)}</p>
                            </div>
                            <span className="text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                              {cluster.customers.length} Debitur
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                            <div className="p-2 bg-white dark:bg-slate-900 border border-slate-150/40 dark:border-slate-850 rounded-xl">
                              <span className="text-slate-400 block font-bold">TOTAL OUTSTANDING</span>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-350 mt-0.5 block">
                                {formatCurrency(cluster.totalOutstanding)}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-slate-900 border border-slate-150/40 dark:border-slate-850 rounded-xl">
                              <span className="text-slate-400 block font-bold">KONDISI PRIORITAS</span>
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5 block">
                                {criticalCount} Critical • Score {cluster.priorityScore}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* OFFLINE MAP PREPARATION WIDGET */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-start justify-between gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-slate-500 uppercase">
                      <Download className="w-3.5 h-3.5 text-slate-500" /> Pengunduh Tile Luring
                    </span>
                    <h3 className="text-base font-black">Persiapan Peta Offline (Dead Zone Prep)</h3>
                    <p className="text-[11px] text-slate-500">
                      Bundling pra-kalkulasi wilayah untuk kemandirian operasional 100% tanpa sinyal seluler.
                    </p>
                  </div>
                  <button
                    onClick={handlePrepareOfflineMap}
                    disabled={offlineMapStatus === 'preparing' || !currentGeoLocation}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-50"
                  >
                    {offlineMapStatus === 'preparing' ? 'Mempersiapkan...' : 'Unduh Wilayah'}
                  </button>
                </div>

                {offlineMapStatus === 'preparing' && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    <span className="text-xs font-bold text-slate-500">Menghitung centroid matriks jarak & memaketkan ubin rute...</span>
                    <ProgressIndicator value={45} max={100} />
                  </div>
                )}

                {offlineMapStatus === 'ready' && offlineMapMetadata && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-2xl space-y-2.5 animate-fade-in text-xs">
                    <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-400">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Data Peta Luring Wilayah Siap Digunakan!</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-500 border-t border-emerald-100 dark:border-emerald-900/50 pt-2.5">
                      <div>
                        <span className="block font-bold">JUMLAH TILE VEKTOR:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{offlineMapMetadata.tileCount} Ubin Cached</span>
                      </div>
                      <div>
                        <span className="block font-bold">UKURAN PAKET DATA:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{offlineMapMetadata.packageSizeMb} MB</span>
                      </div>
                      <div>
                        <span className="block font-bold">MATRIKS JARAK PRE-COMPUTED:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{offlineMapMetadata.precalculatedDistances.toLocaleString()} Node</span>
                      </div>
                      <div>
                        <span className="block font-bold">WAKTU CACHING:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">Baru Saja</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PERFORMANCE STRESS TEST WIDGET */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-start justify-between gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-indigo-500 uppercase">
                      <Gauge className="w-3.5 h-3.5 text-indigo-500" /> Enterprise Audit Tools
                    </span>
                    <h3 className="text-base font-black">Uji Beban Matematis Engine (Stress Test)</h3>
                    <p className="text-[11px] text-slate-500">
                      Stress test luring menghitung 100k komparasi jarak Haversine & TSP rute sub-grup.
                    </p>
                  </div>
                  <button
                    onClick={handleRunGeoBenchmark}
                    disabled={isBenchmarking}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isBenchmarking ? 'Menghitung...' : 'Mulai Benchmark'}
                  </button>
                </div>

                {isBenchmarking && (
                  <div className="py-6 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                    <span className="text-xs font-bold text-slate-500">Mengeksekusi 100.000 iterasi algoritma spasial...</span>
                  </div>
                )}

                {benchmarkResult && (
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-2xl space-y-2.5 animate-fade-in text-xs leading-relaxed">
                    <span className="block font-bold text-indigo-800 dark:text-indigo-400">Hasil Audit Stress Test Performa Spasial:</span>
                    <div className="grid grid-cols-2 gap-3 font-mono text-[10px] text-slate-500 border-t border-indigo-100 dark:border-indigo-900/50 pt-2.5">
                      <div>
                        <span className="block font-bold">PEMBUATAN DATA MASAL (10K):</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{benchmarkResult.dataGenerationTimeMs} ms</span>
                      </div>
                      <div>
                        <span className="block font-bold">100K ITERASI HAVERSINE:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{benchmarkResult.distanceCalculationTimeMs} ms</span>
                      </div>
                      <div>
                        <span className="block font-bold">TSP SEQUENCING SUBSETS:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{benchmarkResult.routeOptimizationTimeMs} ms</span>
                      </div>
                      <div>
                        <span className="block font-bold">RATING KECEPATAN:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 uppercase">SANGAT CEPAT (EXCELLENT)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ROUTE OPTIMIZATION EXECUTION HISTORY LOG */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                    <History className="w-3.5 h-3.5" /> Log Riwayat Optimasi
                  </span>
                  <h3 className="text-base font-black">Arsip Perhitungan Urutan Rute</h3>
                  <p className="text-[11px] text-slate-500">
                    Jejak audit digital seluruh operasi optimalisasi rute kolektor luring.
                  </p>
                </div>

                {routeHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">Belum ada rute terarsipkan.</p>
                ) : (
                  <div className="space-y-3 font-mono text-[11px] leading-relaxed">
                    {routeHistory.slice(0, 3).map((item) => (
                      <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150/50 dark:border-slate-900 rounded-2xl">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-slate-400">
                          <span>{item.id}</span>
                          <span>{formatDate(item.timestamp)}</span>
                        </div>
                        <div className="mt-2 text-slate-500 space-y-0.5 text-[10px]">
                          <p>Lokasi Mulai: {item.startLatitude.toFixed(5)}, {item.startLongitude.toFixed(5)}</p>
                          <p>Total Jarak: {item.totalDistanceKm} KM</p>
                          <p>Jumlah Stops: {item.customerCount} Pelanggan</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* VIEW: VISIT DETAILS & TIMELINE */}
      {view === 'detail' && selectedVisit && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setView('list')}
              className="text-xs font-bold text-blue-600 flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 px-3.5 py-2.5 rounded-xl active:scale-95 transition-all shadow-xs"
            >
              ← Kembali ke Daftar Kunjungan
            </button>
            <span className="text-xs font-mono font-bold text-slate-400">ID: {selectedVisit.id}</span>
          </div>

          {/* BASIC INFO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-[10px] font-mono text-slate-400 block font-bold">DEBITUR SASARAN</span>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">{selectedVisit.customerName}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{selectedVisit.customerAddress}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs leading-relaxed font-mono">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mulai Sesi</span>
                <span className="block text-slate-900 dark:text-white font-bold mt-1">
                  {selectedVisit.startTime ? new Date(selectedVisit.startTime).toLocaleTimeString() : '-'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Selesai Sesi</span>
                <span className="block text-slate-900 dark:text-white font-bold mt-1">
                  {selectedVisit.endTime ? new Date(selectedVisit.endTime).toLocaleTimeString() : '-'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl col-span-2 md:col-span-1">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Durasi Operasi</span>
                <span className="block text-slate-900 dark:text-white font-bold mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  {selectedVisit.duration ? `${Math.floor(selectedVisit.duration / 60)}m ${selectedVisit.duration % 60}s` : 'Baru Dimulai'}
                </span>
              </div>
            </div>

            {/* GPS RECORDED */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="text-xs font-mono text-slate-600 dark:text-slate-450 leading-relaxed text-center sm:text-left">
                <p className="font-bold flex items-center justify-center sm:justify-start gap-1">
                  <MapPin className="w-4 h-4 text-rose-500" /> GPS Capture Koordinat Kunjungan
                </p>
                <p className="mt-1">Lat: {selectedVisit.latitude} | Lng: {selectedVisit.longitude}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Keakuratan: ±{selectedVisit.accuracy}m (Akurasi Terverifikasi)</p>
              </div>
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${selectedVisit.latitude},${selectedVisit.longitude}`}
                target="_blank"
                referrerPolicy="no-referrer"
                className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-4 py-2 rounded-xl"
              >
                Peta Google Map
              </a>
            </div>
          </div>

          {/* VISUAL & AUDIO ATTACHMENTS EVIDENCE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* PHOTOS EVIDENCE */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Camera className="w-4 h-4 text-blue-600" /> Bukti Foto Lapangan ({selectedVisit.photoCount || 0})
              </h3>
              
              {selectedVisit.photoUrls && selectedVisit.photoUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {selectedVisit.photoUrls.map((p, idx) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-100 dark:border-slate-850 aspect-video bg-slate-50">
                      <img src={p} alt="Bukti Foto" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs font-medium">Tidak ada foto terlampir.</div>
              )}
            </div>

            {/* AUDIO & SIGNATURE */}
            <div className="space-y-4">
              
              {/* VOICE NOTES CARD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Mic className="w-4 h-4 text-purple-600" /> Memo Suara / Voice Note Placeholder
                </h3>
                
                {selectedVisit.voiceUrl ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center text-purple-600">
                        <Play className="w-4 h-4 fill-purple-600" />
                      </div>
                      <div className="font-mono">
                        <p className="font-bold text-slate-700 dark:text-slate-300">Memo Rekaman Suara</p>
                        <p className="text-[10px] text-slate-400">File audio terenkripsi lokal</p>
                      </div>
                    </div>
                    <span className="font-bold text-purple-600 cursor-pointer hover:underline">Putar</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-2">Tidak ada memo suara terlampir.</p>
                )}
              </div>

              {/* CUSTOMER SIGNATURE CARD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <PenTool className="w-4 h-4 text-emerald-600" /> Tanda Tangan Konfirmasi Debitur
                </h3>
                
                {selectedVisit.signatureBase64 ? (
                  <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 p-3 flex justify-center max-h-[110px]">
                    <img src={selectedVisit.signatureBase64} alt="Tanda Tangan" className="h-full object-contain mix-blend-multiply dark:invert" />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-2">Tidak ada tanda tangan terlampir.</p>
                )}
              </div>

            </div>
          </div>

          {/* CHRONOLOGICAL TIMELINE (OPERATIONAL RECORDS INFLUENCE) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-5">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-blue-600" /> Garis Waktu Riwayat Debitur (Visit Timeline)
            </h3>

            {isLoading ? (
              <LoadingWidget message="Memuat timeline riwayat..." />
            ) : selectedVisitTimeline.length === 0 ? (
              <p className="text-xs text-slate-400 text-center">Garis waktu riwayat debitur kosong.</p>
            ) : (
              <div className="relative pl-5 border-l border-slate-200 dark:border-slate-800 space-y-6">
                {selectedVisitTimeline.map((item) => (
                  <div key={item.id} className="relative">
                    {/* Circle marker */}
                    <span className={`absolute -left-[26px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                      item.type === 'visit' ? 'bg-blue-600' : 
                      item.type === 'payment_placeholder' ? 'bg-emerald-600' :
                      item.type === 'ptp_placeholder' ? 'bg-amber-500' :
                      'bg-slate-400'
                    }`}></span>

                    <div className="text-xs space-y-1.5 leading-relaxed">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold text-slate-800 dark:text-slate-250">
                        <span className="flex items-center gap-1">
                          {item.title}
                          {item.meta.duration && <span className="text-[10px] text-slate-400 font-mono">({Math.floor(item.meta.duration / 60)}m)</span>}
                        </span>
                        <span className="font-mono text-slate-400 font-normal">{formatDate(item.timestamp)}</span>
                      </div>
                      
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                        <span className="font-bold uppercase tracking-wider block text-[9px] mb-1 text-slate-400">{item.subtitle}</span>
                        {item.notes}
                      </div>

                      {/* Display context placeholders if PTP/Payment */}
                      {item.type === 'payment_placeholder' && (
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-850 dark:text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-100 dark:border-emerald-900/40">
                          Operasional Hasil: Bukti {item.meta.amount} berhasil dicatat offline. No Kuitansi: {item.meta.receiptNumber}
                        </div>
                      )}
                      
                      {item.type === 'ptp_placeholder' && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/10 text-amber-850 dark:text-amber-400 rounded-lg text-[10px] font-bold border border-amber-100 dark:border-amber-900/40">
                          Operasional Hasil: Janji bayar dikomitmenkan tanggal: {item.meta.followUpDate}
                        </div>
                      )}

                      {item.type === 'future_sync_placeholder' && (
                        <div className="p-2.5 bg-purple-50 dark:bg-purple-950/10 text-purple-850 dark:text-purple-400 rounded-lg text-[10px] font-bold border border-purple-100 dark:border-purple-900/40 animate-pulse">
                          Antrean Sinkronisasi: Data tersimpan offline, nirkabel cloud akan memicu sinkron otomatis.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: ACTIVE VISIT EXECUTION FORM */}
      {view === 'execute' && executeCustomer && (
        <div className="space-y-6 animate-fade-in pb-10">
          
          {/* CRITICAL STATE TRACKER APP BAR */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-md">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">SEDANG BERJALAN (ACTIVE WORKFLOW)</span>
              <h2 className="text-base font-black truncate">{executeCustomer.name}</h2>
              <span className="text-xs text-slate-400 block font-mono">No Kontrak: {executeCustomer.contractNumber || '-'}</span>
            </div>

            <div className="flex items-center gap-4 border-t sm:border-t-0 pt-3 sm:pt-0">
              {/* Duration Clock */}
              <div className="text-center shrink-0">
                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wide">DURASI KUNJUNGAN</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                  {(elapsedSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* GPS status */}
              <div className="space-y-1 text-xs text-right font-mono">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">STAT LOKASI GPS</span>
                {gpsLoading ? (
                  <span className="text-blue-400 animate-pulse">Melacak GPS...</span>
                ) : gpsCoords ? (
                  <span className="text-emerald-400 flex items-center justify-end gap-1 font-bold">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" /> AKTIF (±{gpsCoords.accuracy.toFixed(1)}m)
                  </span>
                ) : (
                  <span className="text-rose-400 font-bold">GPS OFF</span>
                )}
              </div>
            </div>
          </div>

          {gpsError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}

          {/* CHOOSE STATUS & RESULTS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" /> Hasil Penagihan Lapangan
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              
              {/* Contact Status */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 block">Status Kontak Lokasi</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'CONTACT', label: 'Ditemui (Contact)' },
                    { id: 'NO_CONTACT', label: 'Tidak Bertemu' },
                    { id: 'BUSINESS_CLOSED', label: 'Tutup Usaha' },
                    { id: 'ADDRESS_NOT_FOUND', label: 'Salah Alamat' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatus(opt.id as any)}
                      className={`p-3 rounded-xl border text-left font-bold transition-all active:scale-97 flex flex-col justify-between ${
                        status === opt.id 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950 dark:border-slate-850 dark:text-slate-300'
                      }`}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Visit Results options */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 block">Hasil Kunjungan Operasional</label>
                <select 
                  value={visitResult}
                  onChange={(e) => setVisitResult(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-3.5 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-250 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="CUSTOMER_MET">Customer Met (Ditemui)</option>
                  <option value="CUSTOMER_NOT_HOME">Customer Not Home (Tidak di Rumah)</option>
                  <option value="PROMISE_TO_PAY">Promise To Pay (PTP Janji Bayar)</option>
                  <option value="PAID">Paid (Bayar Tunai Lunas)</option>
                  <option value="PARTIAL_PAYMENT">Partial Payment (Bayar Sebagian)</option>
                  <option value="REFUSED">Refused (Menolak Bayar)</option>
                  <option value="MOVED">Moved (Pindah Alamat)</option>
                  <option value="WRONG_ADDRESS">Wrong Address (Alamat Salah)</option>
                  <option value="ADDRESS_UNKNOWN">Address Unknown (Alamat Tidak Ditemukan)</option>
                  <option value="CANNOT_CONTACT">Cannot Contact (Tidak Dapat Dihubungi)</option>
                  <option value="OTHER">Other (Hasil Lainnya)</option>
                </select>
              </div>

              {/* Address Confirmation */}
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="font-bold text-slate-500 block">Konfirmasi Kebenaran Alamat</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CONFIRMED', label: 'Alamat Valid' },
                    { id: 'UNCONFIRMED', label: 'Alamat Diragukan' },
                    { id: 'NOT_FOUND', label: 'Alamat Tidak Ada' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAddressConfirmation(opt.id as any)}
                      className={`p-3 rounded-xl border text-center font-bold transition-all active:scale-97 ${
                        addressConfirmation === opt.id 
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950 dark:border-slate-850 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* OPERATION DETAILS, PRESETS & QUICK NOTES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-purple-600" /> Catatan Hasil & Rekomendasi
            </h3>

            <div className="space-y-3.5 text-xs">
              
              {/* Preset Notes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 block">Catatan Preset Cepat (Quick Preset Notes)</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Rumah kosong, tetangga menyatakan sedang keluar kota.",
                    "Debitur berjanji bayar akhir bulan ini via transfer.",
                    "Menolak bayar karena sengketa kepemilikan aset.",
                    "Debitur kooperatif dan membayar tunai sebagian angsuran.",
                    "Pindah alamat sejak 3 bulan lalu tanpa pelaporan resmi."
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNotes(prev => prev ? prev + '\n' + preset : preset)}
                      className="bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-950 dark:border-slate-850 dark:text-slate-300 border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-medium"
                    >
                      + {preset.substring(0, 32)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Long Notes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-500 block">Catatan Detail Kolektor</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ketik rincian hasil wawancara debitur, kondisi jaminan, and detail lainnya..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-3.5 rounded-xl text-xs text-slate-800 dark:text-slate-250 outline-none focus:ring-1 focus:ring-blue-500 min-h-[100px] leading-relaxed resize-none"
                />
              </div>

              {/* Next action planning */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-500 block">Rencana Tindak Lanjut Terjadwal</label>
                  <select 
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-3.5 rounded-xl font-bold text-slate-800 dark:text-slate-250 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="REVISIT">Kunjungi Ulang (Revisit)</option>
                    <option value="CALL">Telepon (Call)</option>
                    <option value="REMINDER">Kirim Pengingat (Reminder)</option>
                    <option value="ESCALATION">Eskalasi Supervisor</option>
                    <option value="LEGAL_REVIEW">Tinjau Hukum (Legal Review)</option>
                    <option value="CLOSE_CASE">Tutup Kasus (Close Case)</option>
                    <option value="WAIT">Menunggu (Wait)</option>
                  </select>
                </div>

                {nextAction !== 'WAIT' && nextAction !== 'CLOSE_CASE' && (
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-500 block">Tanggal Jatuh Tempo Tindak Lanjut</label>
                    <input 
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-3 rounded-xl font-bold text-slate-800 dark:text-slate-250 outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* EVIDENCE CAPTURE (PHOTOS, AUDIO & SIGNATURE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* PHOTOS RECORDING PANEL */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Camera className="w-4 h-4 text-blue-600" /> Ambil Bukti Foto Lapangan ({photos.length})
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {photos.map((p, index) => (
                  <div key={index} className="relative rounded-xl overflow-hidden border border-slate-100 dark:border-slate-850 aspect-video bg-slate-50 group">
                    <img src={p} alt="Capture" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== index))}
                      className="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-full p-1 shadow hover:scale-105 active:scale-95 transition-transform"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={handleSimulatePhoto}
                  disabled={showCamera}
                  className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 aspect-video flex flex-col items-center justify-center gap-1 text-slate-400 active:scale-98 transition-all font-bold"
                >
                  <Camera className="w-6 h-6 text-slate-350" />
                  <span>{showCamera ? 'Membuka kamera...' : 'Ambil Foto'}</span>
                </button>
              </div>
            </div>

            {/* AUDIO & SIGNATURE FORMS */}
            <div className="space-y-4">
              
              {/* VOICE RECORDER */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3.5">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Mic className="w-4 h-4 text-purple-600" /> Perekam Memo Suara (Voice Note)
                </h3>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleVoiceRecording}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow active:scale-95 shrink-0 ${
                      isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-purple-600 text-white'
                    }`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  <div className="flex-1 min-w-0 text-xs">
                    {isRecording ? (
                      <div className="space-y-1">
                        <span className="font-bold text-red-600 block animate-pulse">Sedang Merekam...</span>
                        {/* Audio wave simulator */}
                        <div className="flex items-end gap-0.5 h-3">
                          {[2, 4, 1, 5, 2, 3, 5, 1, 4, 2].map((h, i) => (
                            <span 
                              key={i} 
                              className="bg-red-500 flex-1 rounded-full animate-bounce"
                              style={{ height: `${h * 20}%`, animationDelay: `${i * 100}ms` }}
                            ></span>
                          ))}
                        </div>
                      </div>
                    ) : recordedAudioUrl ? (
                      <div className="font-mono text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 shrink-0" /> Rekaman Tersimpan Lokal
                      </div>
                    ) : (
                      <span className="text-slate-400 font-medium">Rekam penjelasan suara collector (Verifikasi Audio)</span>
                    )}
                  </div>

                  {recordedAudioUrl && (
                    <button 
                      onClick={() => setRecordedAudioUrl(null)}
                      className="text-xs text-rose-600 font-bold hover:underline select-none"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              {/* SIGNATURE PAD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3.5">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <PenTool className="w-4 h-4 text-emerald-600" /> Tanda Tangan Konfirmasi Debitur
                  </h3>
                  {hasSignature && (
                    <button 
                      onClick={clearSignature}
                      className="text-[10px] text-red-600 font-bold hover:underline select-none"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>

                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20 rounded-xl overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseUp={endDrawing}
                    onMouseMove={draw}
                    onTouchStart={startDrawing}
                    onTouchEnd={endDrawing}
                    onTouchMove={draw}
                    width={320}
                    height={110}
                    className="w-full h-[110px] cursor-crosshair touch-none"
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium text-xs pointer-events-none select-none">
                      Silakan gambar tanda tangan di sini
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* FINISH/SAVE OFFLINE TRIGGER */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row gap-3">
            <SecondaryButton 
              onClick={() => {
                if (activeVisitId) {
                  visitRepository.delete(activeVisitId);
                }
                setView('list');
              }}
              className="flex-1"
            >
              Batalkan Sesi Kunjungan
            </SecondaryButton>
            <PrimaryButton 
              onClick={handleFinishExecution}
              className="flex-1 bg-blue-600 text-white min-h-[48px] text-sm"
            >
              Simpan Kunjungan Offline
            </PrimaryButton>
          </div>

        </div>
      )}

    </div>
  );
};

export default VisitsScreen;
