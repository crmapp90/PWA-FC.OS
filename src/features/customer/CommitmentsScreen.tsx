import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Handshake, 
  Search, 
  SlidersHorizontal, 
  ArrowUpDown, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  ChevronRight, 
  MapPin, 
  Phone, 
  AlertCircle, 
  User, 
  CornerDownRight, 
  Sparkles, 
  Database, 
  RefreshCw,
  Eye,
  Trash2,
  CalendarCheck,
  Zap,
  Info,
  DollarSign,
  CloudUpload,
  Check
} from 'lucide-react';
import { useStore } from '../../core/store';
import { db } from '../../core/database';
import { 
  CommitmentService, 
  CommitmentWithCustomer 
} from '../../core/services/CommitmentService';
import { PromiseToPay, Customer, Visit } from '../../types';
import { logger } from '../../core/logger';
import { auditLogRepository } from '../../core/repositories/ConcreteRepositories';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHaptic, playConfirmSound } from '../../shared/utils/feedback';

export const CommitmentsScreen: React.FC = () => {
  const { activeCollector } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation Tabs: 'list' | 'followup' | 'reminders' | 'simulation'
  const [activeSegment, setActiveSegment] = useState<'list' | 'followup' | 'reminders' | 'simulation'>('list');

  // Load state
  const [commitments, setCommitments] = useState<CommitmentWithCustomer[]>([]);
  const [reminderQueue, setReminderQueue] = useState<CommitmentWithCustomer[]>([]);
  const [followUpQueues, setFollowUpQueues] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<any>('newest');
  const [showFilters, setShowFilters] = useState(false);

  // Detail Modal
  const [selectedCommitment, setSelectedCommitment] = useState<CommitmentWithCustomer | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Action Dialogs (notes inputs)
  const [showFulfillDialog, setShowFulfillDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [actionNotes, setActionNotes] = useState('');

  // Form View State: 'view' | 'create' | 'edit'
  const [formMode, setFormMode] = useState<'view' | 'create' | 'edit'>('view');
  const [editingCommitment, setEditingCommitment] = useState<CommitmentWithCustomer | null>(null);

  // Form Fields
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formPromisedAmount, setFormPromisedAmount] = useState<number>(0);
  const [formDueDate, setFormDueDate] = useState('');
  const [formExpectedMethod, setFormExpectedMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'>('CASH');
  const [formPriority, setFormPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('LOW');
  const [formRisk, setFormRisk] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Low');
  const [formReason, setFormReason] = useState('');
  const [formCollectorNotes, setFormCollectorNotes] = useState('');
  const [formCustomerNotes, setFormCustomerNotes] = useState('');
  const [formReminderDate, setFormReminderDate] = useState('');
  const [formReminderTime, setFormReminderTime] = useState('');
  const [formFollowUpDate, setFormFollowUpDate] = useState('');
  
  // Validation Errors
  const [formError, setFormError] = useState<string | null>(null);

  // Benchmark stats for Simulation
  const [simulationMetrics, setSimulationMetrics] = useState<{
    loadTimeMs?: number;
    recordsCount?: number;
    lastAction?: string;
  }>({});

  // Unique areas for filters
  const uniqueAreas = useMemo(() => {
    const areas = customers.map(c => c.area).filter((a): a is string => !!a);
    return ['ALL', ...Array.from(new Set(areas))];
  }, [customers]);

  // Load all data
  const loadData = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      // Evaluate statuses first
      await CommitmentService.evaluateCommitmentStatuses();

      const collectorId = activeCollector?.id || '';

      const [list, reminders, followUp, allCustomers] = await Promise.all([
        CommitmentService.getCommitmentsWithDetails({
          query: searchQuery,
          status: statusFilter,
          riskLevel: riskFilter,
          priority: priorityFilter,
          area: areaFilter,
          sortBy
        }),
        CommitmentService.getReminderQueue(),
        CommitmentService.getFollowUpQueue(),
        db.customers.toArray()
      ]);

      setCommitments(list);
      setReminderQueue(reminders);
      setFollowUpQueues(followUp);
      setCustomers(allCustomers);

      const end = performance.now();
      setSimulationMetrics(prev => ({
        ...prev,
        loadTimeMs: Math.round(end - start),
        recordsCount: list.length
      }));
    } catch (err) {
      logger.error('CommitmentsScreen', 'Error loading commitments', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, [searchQuery, statusFilter, riskFilter, priorityFilter, areaFilter, sortBy, activeSegment]);

  // Check query parameters to launch Create form automatically
  useEffect(() => {
    const startCustomerId = searchParams.get('startCustomerId');
    if (startCustomerId) {
      setFormCustomerId(startCustomerId);
      
      // Auto-populate customer properties
      const cust = customers.find(c => c.id === startCustomerId);
      if (cust) {
        setFormPromisedAmount(cust.minPaymentDue || 0);
      }
      
      const inTwoDays = new Date();
      inTwoDays.setDate(inTwoDays.getDate() + 2);
      setFormDueDate(inTwoDays.toISOString().split('T')[0]);
      
      setFormMode('create');
      // Clear search parameter so it doesn't trigger repeatedly
      searchParams.delete('startCustomerId');
      setSearchParams(searchParams);
    }
  }, [searchParams, customers]);

  // Fetch timeline for a single customer
  const loadTimeline = async (customerId: string) => {
    setLoadingTimeline(true);
    try {
      const history = await CommitmentService.getTimelineForCustomer(customerId);
      setTimeline(history);
    } catch (err) {
      logger.error('CommitmentsScreen', 'Failed loading timeline', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // View detail
  const handleOpenDetail = (c: CommitmentWithCustomer) => {
    setSelectedCommitment(c);
    loadTimeline(c.customerId);
  };

  // Create action
  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCustomerId) {
      setFormError('Silakan pilih debitur.');
      return;
    }
    if (formPromisedAmount <= 0) {
      setFormError('Nominal janji harus lebih besar dari Rp 0.');
      return;
    }
    if (!formDueDate) {
      setFormError('Silakan pilih tanggal jatuh tempo janji bayar.');
      return;
    }

    try {
      const collectorId = activeCollector?.id || '';
      await CommitmentService.createCommitment(formCustomerId, collectorId, {
        dueDate: formDueDate,
        promisedAmount: formPromisedAmount,
        expectedPaymentMethod: formExpectedMethod,
        priority: formPriority,
        riskLevel: formRisk,
        reminderDate: formReminderDate || undefined,
        reminderTime: formReminderTime || undefined,
        followUpDate: formFollowUpDate || undefined,
        reason: formReason || undefined,
        collectorNotes: formCollectorNotes || undefined,
        customerNotes: formCustomerNotes || undefined
      });

      // Clear form
      triggerHaptic(80);
      playConfirmSound();
      resetForm();
      setFormMode('view');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan komitmen.');
    }
  };

  // Launch Edit Mode
  const handleOpenEdit = (c: CommitmentWithCustomer) => {
    setEditingCommitment(c);
    setFormCustomerId(c.customerId);
    setFormPromisedAmount(c.promisedAmount || c.amount);
    setFormDueDate(c.dueDate || c.promiseDate);
    setFormExpectedMethod(c.expectedPaymentMethod || 'CASH');
    setFormPriority(c.priority || 'LOW');
    setFormRisk(c.riskLevel || 'Low');
    setFormReason(c.reason || '');
    setFormCollectorNotes(c.collectorNotes || c.notes || '');
    setFormCustomerNotes(c.customerNotes || '');
    setFormReminderDate(c.reminderDate || '');
    setFormReminderTime(c.reminderTime || '');
    setFormFollowUpDate(c.followUpDate || '');
    setFormError(null);
    setFormMode('edit');
    setSelectedCommitment(null); // Close detail modal
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingCommitment) return;
    if (formPromisedAmount <= 0) {
      setFormError('Nominal janji harus lebih besar dari Rp 0.');
      return;
    }
    if (!formDueDate) {
      setFormError('Silakan pilih tanggal jatuh tempo.');
      return;
    }

    try {
      const collectorId = activeCollector?.id || '';
      await CommitmentService.updateCommitment(editingCommitment.id, {
        dueDate: formDueDate,
        promisedAmount: formPromisedAmount,
        expectedPaymentMethod: formExpectedMethod,
        priority: formPriority,
        riskLevel: formRisk,
        reminderDate: formReminderDate || undefined,
        reminderTime: formReminderTime || undefined,
        followUpDate: formFollowUpDate || undefined,
        reason: formReason || undefined,
        collectorNotes: formCollectorNotes || undefined,
        customerNotes: formCustomerNotes || undefined
      }, collectorId);

      resetForm();
      setFormMode('view');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal mengubah komitmen.');
    }
  };

  // Action Cancel
  const handleCancelCommitment = async () => {
    if (!selectedCommitment) return;
    try {
      const collectorId = activeCollector?.id || '';
      await CommitmentService.cancelCommitment(selectedCommitment.id, actionNotes, collectorId);
      
      setShowCancelDialog(false);
      setSelectedCommitment(null);
      setActionNotes('');
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Error cancelling commitment', err);
    }
  };

  // Action Fulfill
  const handleFulfillCommitment = async () => {
    if (!selectedCommitment) return;
    try {
      const collectorId = activeCollector?.id || '';
      await CommitmentService.fulfillCommitment(selectedCommitment.id, actionNotes, collectorId);
      
      setShowFulfillDialog(false);
      setSelectedCommitment(null);
      setActionNotes('');
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Error fulfilling commitment', err);
    }
  };

  // Action Break
  const handleBreakCommitment = async () => {
    if (!selectedCommitment) return;
    try {
      const collectorId = activeCollector?.id || '';
      await CommitmentService.breakCommitment(selectedCommitment.id, actionNotes, collectorId);
      
      setShowBreakDialog(false);
      setSelectedCommitment(null);
      setActionNotes('');
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Error breaking commitment', err);
    }
  };

  const resetForm = () => {
    setFormCustomerId('');
    setFormPromisedAmount(0);
    setFormDueDate('');
    setFormExpectedMethod('CASH');
    setFormPriority('LOW');
    setFormRisk('Low');
    setFormReason('');
    setFormCollectorNotes('');
    setFormCustomerNotes('');
    setFormReminderDate('');
    setFormReminderTime('');
    setFormFollowUpDate('');
    setEditingCommitment(null);
    setFormError(null);
  };

  // Simulation: Massive Seeding (1,000 PTPs)
  const handleMassiveSeeding = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const count = await CommitmentService.seedMassiveCommitments(1000);
      const end = performance.now();
      
      setSimulationMetrics({
        loadTimeMs: Math.round(end - start),
        recordsCount: count,
        lastAction: `Berhasil menambahkan ${count} data Janji Bayar untuk tes beban.`
      });
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Mass seeding failed', err);
    } finally {
      setLoading(false);
    }
  };

  // Simulation: Reset Commitment DB
  const handleResetCommitments = async () => {
    setLoading(true);
    try {
      await db.promise_to_pay.clear();
      setSimulationMetrics({
        recordsCount: 0,
        lastAction: 'Berhasil membersihkan seluruh data janji bayar.'
      });
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Database clear failed', err);
    } finally {
      setLoading(false);
    }
  };

  // Risk Color map
  const getRiskColor = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case 'critical': return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
      case 'low':
      default: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    }
  };

  // Status Badge map
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30';
      case 'Overdue':
      case 'Broken':
        return 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/30';
      case 'Due Today':
        return 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border border-orange-200 dark:border-orange-900/30';
      case 'Cancelled':
        return 'bg-slate-50 text-slate-500 dark:bg-slate-900/40 dark:text-slate-400 border border-slate-200 dark:border-slate-800';
      case 'Draft':
        return 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400 border border-gray-200 dark:border-gray-800';
      case 'Active':
      default:
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30';
    }
  };

  // Quick action call logger
  const handleLogCall = async (ptp: CommitmentWithCustomer) => {
    try {
      const collectorId = activeCollector?.id || '';
      const logId = `AUDIT-CALL-${Date.now()}`;
      await auditLogRepository.insert({
        id: logId,
        level: 'INFO',
        tag: 'CommitmentService',
        timestamp: new Date().toISOString(),
        message: `Kolektor melakukan panggilan telepon follow-up ke debitur ${ptp.customerName} (${ptp.customerId}) terkait PTP ${ptp.id}.`,
        details: JSON.stringify({ commitmentId: ptp.id, customerId: ptp.customerId })
      }, collectorId);
      alert(`Panggilan telepon ke ${ptp.customerName} berhasil direkam dalam log audit.`);
      loadData();
    } catch (err) {
      logger.error('CommitmentsScreen', 'Failed log call', err);
    }
  };

  // Total amount collector summary
  const totals = useMemo(() => {
    return commitments.reduce((acc, curr) => {
      if (curr.status === 'Completed') acc.completed += (curr.promisedAmount || curr.amount);
      else if (curr.status === 'Active' || curr.status === 'Due Today' || curr.status === 'Overdue') {
        acc.active += (curr.promisedAmount || curr.amount);
      }
      return acc;
    }, { completed: 0, active: 0 });
  }, [commitments]);

  return (
    <div className="space-y-6" id="commitments-screen-root">
      
      {/* 1. Header Widget with quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-xs text-center">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Aktif</span>
          <span className="text-sm font-black text-blue-600 dark:text-blue-400 mt-1 block">
            Rp {totals.active.toLocaleString()}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-xs text-center">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Realisasi</span>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            Rp {totals.completed.toLocaleString()}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl shadow-xs text-center flex flex-col justify-center items-center">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Janji Aktif</span>
          <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-1 block">
            {commitments.filter(c => c.status === 'Active' || c.status === 'Due Today').length}
          </span>
        </div>
      </div>

      {/* 2. Top Segment Controls */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
        <button 
          onClick={() => { setActiveSegment('list'); setFormMode('view'); }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSegment === 'list' && formMode === 'view' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
        >
          <Handshake className="w-3.5 h-3.5" /> Komitmen
        </button>
        <button 
          onClick={() => { setActiveSegment('followup'); setFormMode('view'); }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSegment === 'followup' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
        >
          <Phone className="w-3.5 h-3.5" /> Follow Up
        </button>
        <button 
          onClick={() => { setActiveSegment('reminders'); setFormMode('view'); }}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSegment === 'reminders' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
        >
          <Clock className="w-3.5 h-3.5" /> Pengingat
        </button>
        {(import.meta as any).env.DEV && (
          <button 
            onClick={() => { setActiveSegment('simulation'); setFormMode('view'); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSegment === 'simulation' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
          >
            <Database className="w-3.5 h-3.5" /> Simulasi
          </button>
        )}
      </div>

      {/* VIEW / FORM SWITCH CONTROLLER */}
      {formMode === 'create' || formMode === 'edit' ? (
        
        // --- CREATE / EDIT COMMITMENT FORM ---
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-blue-600" />
              {formMode === 'create' ? 'Buat Komitmen Baru' : 'Ubah Janji Bayar'}
            </h3>
            <button 
              onClick={() => { resetForm(); setFormMode('view'); }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
            >
              Batal
            </button>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 text-xs rounded-xl font-bold border border-red-200/40 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={formMode === 'create' ? handleSaveCreate : handleSaveEdit} className="space-y-4">
            
            {/* 1. Customer Select */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Debitur Penerima</label>
              {formMode === 'create' ? (
                <select 
                  value={formCustomerId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setFormCustomerId(cid);
                    const cust = customers.find(c => c.id === cid);
                    if (cust) {
                      setFormPromisedAmount(cust.minPaymentDue || 0);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-blue-500 outline-none"
                >
                  <option value="">-- Pilih Debitur --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Rek: {c.contractNumber || c.id}) - Tunggakan: Rp {c.outstandingBalance.toLocaleString()}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-950 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                    {customers.find(c => c.id === formCustomerId)?.name || formCustomerId}
                  </span>
                </div>
              )}
            </div>

            {/* 2. Amount and Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Nominal Janji (Rp)</label>
                <input 
                  type="number"
                  value={formPromisedAmount || ''}
                  onChange={(e) => setFormPromisedAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-black focus:border-blue-500 outline-none"
                  placeholder="Rp..."
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Tanggal Jatuh Tempo</label>
                <input 
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-bold focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* 3. Expected Payment Method & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Metode Bayar</label>
                <select 
                  value={formExpectedMethod}
                  onChange={(e: any) => setFormExpectedMethod(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-bold focus:border-blue-500 outline-none"
                >
                  <option value="CASH">CASH (Tunai)</option>
                  <option value="BANK_TRANSFER">TRANSFER BANK</option>
                  <option value="CHEQUE">GIRO / CEK</option>
                  <option value="OTHER">LAINNYA</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Prioritas Janji</label>
                <select 
                  value={formPriority}
                  onChange={(e: any) => setFormPriority(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-bold focus:border-blue-500 outline-none"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            {/* 4. Risk Level & Reason */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Tingkat Risiko</label>
                <select 
                  value={formRisk}
                  onChange={(e: any) => setFormRisk(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-bold focus:border-blue-500 outline-none"
                >
                  <option value="Low">Low (Rendah)</option>
                  <option value="Medium">Medium (Sedang)</option>
                  <option value="High">High (Tinggi)</option>
                  <option value="Critical">Critical (Sangat Tinggi)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Alasan Penundaan</label>
                <input 
                  type="text"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Gaji tertunda, sakit, dll."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* 5. Reminder Engines */}
            <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/60 space-y-2.5">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-orange-500" /> Atur Jadwal Pengingat
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Tanggal Pengingat</label>
                  <input 
                    type="date"
                    value={formReminderDate}
                    onChange={(e) => setFormReminderDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Waktu Pengingat</label>
                  <input 
                    type="time"
                    value={formReminderTime}
                    onChange={(e) => setFormReminderTime(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Rencana Kunjungan/Kontak Ulang</label>
                <input 
                  type="date"
                  value={formFollowUpDate}
                  onChange={(e) => setFormFollowUpDate(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none"
                />
              </div>
            </div>

            {/* 6. Notes fields */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Catatan Kolektor</label>
              <textarea 
                value={formCollectorNotes}
                onChange={(e) => setFormCollectorNotes(e.target.value)}
                placeholder="Hasil kesepakatan, janji khusus kolektor..."
                rows={2}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Catatan Debitur (Pernyataan)</label>
              <textarea 
                value={formCustomerNotes}
                onChange={(e) => setFormCustomerNotes(e.target.value)}
                placeholder="Pernyataan langsung atau alasan verbal debitur..."
                rows={2}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Submit buttons */}
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => { resetForm(); setFormMode('view'); }}
                className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 active:scale-95 transition-all"
              >
                Kembali
              </button>
              <button 
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 text-xs rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Simpan Janji Offline
              </button>
            </div>

          </form>
        </div>

      ) : (
        
        // --- SCREEN TABS RENDERERS ---
        <div>
          {activeSegment === 'list' && (
            
            // ==========================================
            // TAB 1: LIST VIEW
            // ==========================================
            <div className="space-y-4">
              
              {/* Search & Filter Trigger */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-3 text-slate-400 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="Cari debitur, nomor kontrak, tanggal..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none shadow-xs"
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/30' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500'}`}
                >
                  <SlidersHorizontal className="w-4 h-4" /> Filter
                </button>
                <button 
                  onClick={() => { resetForm(); setFormMode('create'); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl font-black text-xs shadow-xs flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Baru
                </button>
              </div>

              {/* Collapsible Filter Panel */}
              {showFilters && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl space-y-3 shadow-xs animate-fade-in">
                  <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 block border-b border-slate-50 dark:border-slate-800 pb-1.5">Parameter Filter Koleksi</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Status Janji</label>
                      <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-[11px] font-bold rounded-lg outline-none text-slate-700 dark:text-slate-300"
                      >
                        <option value="ALL">SEMUA STATUS</option>
                        <option value="Active">Active</option>
                        <option value="Due Today">Due Today</option>
                        <option value="Overdue">Overdue</option>
                        <option value="Completed">Completed</option>
                        <option value="Broken">Broken</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Draft">Draft</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Tingkat Risiko</label>
                      <select 
                        value={riskFilter}
                        onChange={(e) => setRiskFilter(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-[11px] font-bold rounded-lg outline-none text-slate-700 dark:text-slate-300"
                      >
                        <option value="ALL">SEMUA RISIKO</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Prioritas</label>
                      <select 
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-[11px] font-bold rounded-lg outline-none text-slate-700 dark:text-slate-300"
                      >
                        <option value="ALL">SEMUA PRIORITAS</option>
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Wilayah / Area</label>
                      <select 
                        value={areaFilter}
                        onChange={(e) => setAreaFilter(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-[11px] font-bold rounded-lg outline-none text-slate-700 dark:text-slate-300"
                      >
                        {uniqueAreas.map(a => (
                          <option key={a} value={a}>{a === 'ALL' ? 'SEMUA WILAYAH' : a}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Urutan Penyusunan</label>
                      <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-[11px] font-bold rounded-lg outline-none text-slate-700 dark:text-slate-300"
                      >
                        <option value="newest">Paling Baru</option>
                        <option value="oldest">Paling Lama</option>
                        <option value="dueDate">Jatuh Tempo Terdekat</option>
                        <option value="priority">Prioritas Tertinggi</option>
                        <option value="amount">Nominal Terbesar</option>
                        <option value="customerName">Nama Debitur (A-Z)</option>
                      </select>
                    </div>
                    <div className="flex items-end justify-end">
                      <button 
                        onClick={() => {
                          setStatusFilter('ALL');
                          setRiskFilter('ALL');
                          setPriorityFilter('ALL');
                          setAreaFilter('ALL');
                          setSortBy('newest');
                          setSearchQuery('');
                        }}
                        className="text-[10px] font-black text-blue-600 hover:text-blue-800 block p-2 transition-all active:scale-95"
                      >
                        Reset Semua Filter
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Loader widget */}
              {loading ? (
                <div className="flex flex-col items-center p-12 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                  <span className="text-xs text-slate-500 font-bold">Mengevaluasi basis data & menyusun komitmen...</span>
                </div>
              ) : commitments.length === 0 ? (
                <div className="text-center p-12 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl space-y-3">
                  <Handshake className="w-12 h-12 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Tidak Ada Komitmen Janji Bayar</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Tidak ada janji bayar yang cocok dengan kriteria pencarian atau filter saat ini.</p>
                </div>
              ) : (
                
                // Commitments List
                <div className="space-y-3">
                  {commitments.map((c) => (
                    <div 
                      key={c.id}
                      onClick={() => handleOpenDetail(c)}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-blue-100 dark:hover:border-blue-900/30 transition-all cursor-pointer active:scale-99 flex flex-col gap-3 relative overflow-hidden"
                    >
                      {/* Priority indicator tag line */}
                      {c.priority === 'CRITICAL' && <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-600"></div>}
                      {c.priority === 'HIGH' && <div className="absolute top-0 left-0 right-0 h-[3px] bg-orange-500"></div>}
                      
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">{c.customerName}</h4>
                            <span className="text-[9px] font-bold text-slate-400">({c.contractNumber})</span>
                            
                            {/* Interactive Sync Badge */}
                            {(!c.syncStatus || c.syncStatus === 'pending' || c.syncStatus === 'syncing' || c.syncStatus === 'failed') ? (
                              <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded" title="Luring: Menunggu Sinkronisasi">
                                <CloudUpload className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                <span>Luring</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[8px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded" title="Sinkronisasi Berhasil ke Cloud">
                                <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                <span>Tersinkron</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{c.customerAddress}</span>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${getStatusBadge(c.status)}`}>
                          {c.status}
                        </span>
                      </div>

                      {/* Financial info bento line */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Janji Bayar</span>
                          <span className="text-xs font-black text-slate-900 dark:text-slate-50">
                            Rp {(c.promisedAmount || c.amount).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Rencana Jatuh Tempo</span>
                          <span className="text-xs font-black text-slate-900 dark:text-slate-50 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" /> {c.dueDate || c.promiseDate}
                          </span>
                        </div>
                      </div>

                      {/* Detail metadata row */}
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-md ${getRiskColor(c.riskLevel)}`}>
                            {c.riskLevel} Risk
                          </span>
                          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                            {c.expectedPaymentMethod}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400">ID: {c.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSegment === 'followup' && (
            
            // ==========================================
            // TAB 2: FOLLOW-UP ACTION QUEUE
            // ==========================================
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  <strong>Antrean Follow-up Operasional</strong>: Segmen ini secara otomatis mendistribusikan debitur berdasarkan tingkat risiko, prioritas, dan tanggal keterlambatan untuk membantu Anda menetapkan strategi tindakan harian.
                </p>
              </div>

              {loading ? (
                <div className="text-center p-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <span className="text-xs text-slate-500 font-bold">Mengatur antrean follow-up...</span>
                </div>
              ) : followUpQueues.length === 0 || !followUpQueues.some(q => q.commitments.length > 0) ? (
                <div className="text-center p-12 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Semua Follow-Up Bersih!</h4>
                  <p className="text-xs text-slate-400">Tidak ada komitmen aktif yang membutuhkan tindakan penanganan mendesak hari ini.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {followUpQueues.map((q) => {
                    if (q.commitments.length === 0) return null;
                    return (
                      <div key={q.action} className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              q.action === 'Escalate' ? 'bg-red-600' :
                              q.action === 'Visit Again' ? 'bg-orange-500' :
                              q.action === 'Call Customer' ? 'bg-blue-500' : 'bg-slate-400'
                            }`}></span>
                            {q.action === 'Escalate' ? '⚠️ Segera Eskalasi (Overdue / Critical)' :
                             q.action === 'Visit Again' ? '📍 Kunjungan Lapangan Ulang (High Risk)' :
                             q.action === 'Call Customer' ? '📞 Hubungi Debitur (Due Today / Medium)' :
                             q.action === 'Send Reminder (Future)' ? '⏰ Kirim Pengingat Digital' :
                             '🎯 Dukungan Strategis / Lainnya'}
                          </h4>
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                            {q.commitments.length} Debitur
                          </span>
                        </div>

                        <div className="space-y-3">
                          {q.commitments.map((ptp: CommitmentWithCustomer) => (
                            <div 
                              key={ptp.id}
                              className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">{ptp.customerName}</span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">{ptp.customerAddress}</span>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${getRiskColor(ptp.riskLevel)}`}>
                                  {ptp.riskLevel}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40 mt-3 text-xs">
                                <div>
                                  <span className="text-[9px] text-slate-400 font-bold block">Nominal Janji</span>
                                  <span className="font-black text-slate-800 dark:text-slate-100">Rp {ptp.promisedAmount.toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-400 font-bold block">Jatuh Tempo</span>
                                  <span className="font-black text-red-600 dark:text-red-400 flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" /> {ptp.dueDate}
                                  </span>
                                </div>
                              </div>

                              {/* Interactive Follow up actions */}
                              <div className="flex gap-2 mt-3">
                                <button 
                                  onClick={() => handleLogCall(ptp)}
                                  className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-blue-100 dark:border-blue-900/30"
                                >
                                  <Phone className="w-3.5 h-3.5" /> Hubungi Sekarang
                                </button>
                                <button 
                                  onClick={() => navigate(`/visits?startCustomerId=${ptp.customerId}`)}
                                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-300 text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-800"
                                >
                                  <MapPin className="w-3.5 h-3.5" /> Buat Kunjungan
                                </button>
                                <button 
                                  onClick={() => handleOpenDetail(ptp)}
                                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-[10px] font-bold p-2 rounded-xl active:scale-95 transition-all"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSegment === 'reminders' && (
            
            // ==========================================
            // TAB 3: REMINDER SCHEDULES QUEUE
            // ==========================================
            <div className="space-y-4">
              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40 rounded-2xl flex items-start gap-3">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800 dark:text-orange-300 leading-relaxed">
                  <strong>Mesin Pengingat Offline</strong>: Pengingat digital ini berjalan sepenuhnya offline di HP. Anda dapat mengonfigurasi notifikasi SMS/WhatsApp secara verbal, atau menjadwalkan alarm kontak sebelum tanggal jatuh tempo.
                </p>
              </div>

              {loading ? (
                <div className="text-center p-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-2" />
                  <span className="text-xs text-slate-500 font-bold">Menyinkronkan jadwal alarm pengingat...</span>
                </div>
              ) : reminderQueue.length === 0 ? (
                <div className="text-center p-12 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-500 space-y-2">
                  <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold">Tidak Ada Jadwal Pengingat</h4>
                  <p className="text-xs text-slate-400">Belum ada alarm atau agenda pengingat komitmen yang diatur.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reminderQueue.map((ptp) => (
                    <div 
                      key={ptp.id}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">{ptp.customerName}</span>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1 font-bold text-orange-600">
                            <Clock className="w-3.5 h-3.5" /> {ptp.reminderDate} @ {ptp.reminderTime || '09:00'}
                          </span>
                          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md font-bold text-[9px]">
                            Tagihan: Rp {ptp.promisedAmount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={() => handleOpenDetail(ptp)}
                        className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all"
                      >
                        Kelola
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(import.meta as any).env.DEV && activeSegment === 'simulation' && (
            
            // ==========================================
            // TAB 4: SIMULATION & BENCHMARKING
            // ==========================================
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
                <Database className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-50">Panel Simulasi Skalabilitas & Stabilitas</h3>
                  <p className="text-[10px] text-slate-400">Verifikasi respons lokal IndexedDB di bawah muatan beban besar.</p>
                </div>
              </div>

              {/* Benchmark panel */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">Kecepatan Muat Query Lokal</span>
                  <span className="text-base font-black text-blue-600 flex items-center gap-1.5 mt-1">
                    <Zap className="w-4 h-4 fill-current text-blue-500" />
                    {simulationMetrics.loadTimeMs ? `${simulationMetrics.loadTimeMs} ms` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">Jumlah Records Terdaftar</span>
                  <span className="text-base font-black text-slate-800 dark:text-slate-100 block mt-1">
                    {simulationMetrics.recordsCount || commitments.length} Data
                  </span>
                </div>
              </div>

              {simulationMetrics.lastAction && (
                <div className="p-3 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 text-xs font-bold rounded-xl border border-blue-200/20">
                  ⚡ {simulationMetrics.lastAction}
                </div>
              )}

              {/* Action triggers */}
              <div className="space-y-3 pt-2">
                <button 
                  onClick={handleMassiveSeeding}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-2xl shadow-xs active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" /> Suntik 1.000 Janji Bayar (Stress Test)
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  Menambahkan 1.000 records janji bayar yang disebar secara otomatis ke database lokal HP Anda untuk membuktikan algoritma filtering, search, dan pagination tetap berjalan super cepat di bawah 100 ms.
                </p>
                <button 
                  onClick={handleResetCommitments}
                  disabled={loading}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-bold py-3.5 rounded-2xl border border-red-100 dark:border-red-900/30 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Kosongkan Seluruh Tabel Janji Bayar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          MODAL: DETAIL COMMITMENT & TIMELINE
         ========================================== */}
      {selectedCommitment && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setSelectedCommitment(null)}></div>
          
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-5 animate-slide-up">
            
            {/* Header detail */}
            <div className="flex justify-between items-start border-b border-slate-50 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-50">{selectedCommitment.customerName}</h3>
                <span className="text-[10px] font-bold text-slate-400 block mt-0.5">ID Janji: {selectedCommitment.id}</span>
              </div>
              <button 
                onClick={() => setSelectedCommitment(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-black p-1"
              >
                Tutup
              </button>
            </div>

            {/* Quick stats grid */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/40 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Nominal Janji</span>
                <span className="font-black text-blue-600 dark:text-blue-400 block mt-0.5">Rp {selectedCommitment.promisedAmount.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Jatuh Tempo</span>
                <span className="font-black text-slate-800 dark:text-slate-100 block mt-0.5">{selectedCommitment.dueDate}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Status Janji</span>
                <span className={`inline-block font-black px-2 py-0.5 rounded-md mt-1 ${getStatusBadge(selectedCommitment.status)}`}>
                  {selectedCommitment.status}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Tingkat Risiko</span>
                <span className={`inline-block font-black px-2 py-0.5 rounded-md mt-1 ${getRiskColor(selectedCommitment.riskLevel)}`}>
                  {selectedCommitment.riskLevel} Risk
                </span>
              </div>
            </div>

            {/* Detail info parameters */}
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Metode Pembayaran</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">{selectedCommitment.expectedPaymentMethod}</span>
              </div>
              {selectedCommitment.reason && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Alasan Penundaan</span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">{selectedCommitment.reason}</p>
                </div>
              )}
              {selectedCommitment.collectorNotes && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Catatan Kolektor</span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">{selectedCommitment.collectorNotes}</p>
                </div>
              )}
              {selectedCommitment.customerNotes && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Pernyataan Debitur</span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">{selectedCommitment.customerNotes}</p>
                </div>
              )}
              {selectedCommitment.reminderDate && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-2.5 py-1.5 rounded-xl border border-orange-200/20">
                  <Clock className="w-3.5 h-3.5" /> Scheduled Reminder: {selectedCommitment.reminderDate} @ {selectedCommitment.reminderTime || '09:00'}
                </div>
              )}
            </div>

            {/* Actions panel for collector */}
            {selectedCommitment.status !== 'Completed' && selectedCommitment.status !== 'Cancelled' && (
              <div className="space-y-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-center">Tindakan Kolektor</span>
                
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => { setShowFulfillDialog(true); setActionNotes(''); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Janji Terpenuhi
                  </button>
                  <button 
                    onClick={() => { setShowBreakDialog(true); setActionNotes(''); }}
                    className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 text-xs font-black py-2.5 rounded-xl border border-red-100 dark:border-red-900/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Janji Gagal
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleOpenEdit(selectedCommitment)}
                    className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 rounded-xl active:scale-95 transition-all"
                  >
                    Ubah Janji Bayar
                  </button>
                  <button 
                    onClick={() => { setShowCancelDialog(true); setActionNotes(''); }}
                    className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold py-2.5 rounded-xl active:scale-95 transition-all"
                  >
                    Batalkan Komitmen
                  </button>
                </div>
              </div>
            )}

            {/* Timeline Area (Historical audit tracker for customer) */}
            <div className="border-t border-slate-50 dark:border-slate-800 pt-4 space-y-3">
              <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Riwayat Aktivitas Debitur (Timeline)</span>
              {loadingTimeline ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 justify-center py-4">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Mengurai lini masa aktivitas...</span>
                </div>
              ) : timeline.length === 0 ? (
                <span className="text-[11px] text-slate-400 text-center block py-4">Belum ada riwayat aktivitas yang tercatat untuk debitur ini.</span>
              ) : (
                <div className="relative pl-4 border-l border-slate-100 dark:border-slate-800 space-y-4">
                  {timeline.map((item, index) => (
                    <div key={item.id} className="relative">
                      {/* Circle bullet */}
                      <span className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                        item.type === 'ptp' ? 'bg-blue-500' :
                        item.type === 'visit' ? 'bg-orange-500' :
                        'bg-emerald-500'
                      }`}></span>

                      <div className="space-y-0.5">
                        <span className="text-[9px] text-slate-400 font-bold block">{new Date(item.timestamp).toLocaleDateString()} @ {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">{item.title}</span>
                        <span className="text-[10px] text-slate-400 block">{item.subtitle}</span>
                        {item.notes && <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic bg-slate-50 dark:bg-slate-950 p-1.5 rounded-lg border border-slate-100/50 dark:border-slate-800/30 mt-1">{item.notes}</p>}
                        {item.meta && item.meta.amount !== undefined && (
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 block mt-0.5">
                            Rp {item.meta.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- FULFILL ACTION MODAL DIALOG --- */}
      {showFulfillDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setShowFulfillDialog(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-50">Selesaikan Komitmen Janji Bayar</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Pernyataan komitmen ini akan ditandai sebagai TERPENUHUI secara permanen. Tambahkan catatan bukti transaksi lunas/sebagian.</p>
            
            <textarea 
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Sebutkan referensi bayar / nomor kuitansi / bukti transaksi..."
              rows={3}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />

            <div className="flex gap-2">
              <button 
                onClick={() => setShowFulfillDialog(false)}
                className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold py-2.5 text-xs rounded-xl active:scale-95 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleFulfillCommitment}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 text-xs rounded-xl shadow-xs active:scale-95 transition-all"
              >
                Tandai Berhasil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CANCEL ACTION MODAL DIALOG --- */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setShowCancelDialog(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-50 text-red-600">Batalkan Komitmen Janji Bayar</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Membatalkan janji bayar ini karena kesalahan input data atau perubahan janji lisan baru. Mengapa komitmen dibatalkan?</p>
            
            <textarea 
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Alasan pembatalan janji..."
              rows={3}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />

            <div className="flex gap-2">
              <button 
                onClick={() => setShowCancelDialog(false)}
                className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold py-2.5 text-xs rounded-xl active:scale-95 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleCancelCommitment}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 text-xs rounded-xl shadow-xs active:scale-95 transition-all"
              >
                Batalkan Janji
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BREAK ACTION MODAL DIALOG --- */}
      {showBreakDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setShowBreakDialog(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-50 text-red-600">Tandai Komitmen Janji Gagal</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Janji bayar ini ditandai ingkar janji (Broken) karena terbukti melewati tanggal jatuh tempo tanpa realisasi lunas. Mengapa ingkar janji?</p>
            
            <textarea 
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Alasan verbal debitur ingkar janji bayar..."
              rows={3}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />

            <div className="flex gap-2">
              <button 
                onClick={() => setShowBreakDialog(false)}
                className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold py-2.5 text-xs rounded-xl active:scale-95 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleBreakCommitment}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 text-xs rounded-xl shadow-xs active:scale-95 transition-all"
              >
                Ingkar Janji
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
