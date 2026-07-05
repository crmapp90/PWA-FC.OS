import React, { useEffect, useState, useRef } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Plus, 
  Edit2, 
  Trash2, 
  MapPin, 
  Calendar, 
  DollarSign, 
  CircleDollarSign,
  Phone, 
  User, 
  FileText, 
  X, 
  CheckCircle, 
  TrendingUp, 
  UploadCloud, 
  AlertTriangle, 
  RotateCcw, 
  ChevronRight, 
  Undo, 
  Eye,
  MessageSquare,
  Paperclip,
  Activity,
  History,
  Info,
  Handshake,
  MessageCircle
} from 'lucide-react';
import { db } from '../../core/database';
import { useLocalization } from '../../core/localization';
import { useStore } from '../../core/store';
import { formatCurrency } from '../../shared/utils/formatters';
import { THEME } from '../../core/theme';
import { Customer, Note, Attachment, Visit, Payment, PromiseToPay } from '../../types';
import { customerRepository, noteRepository, attachmentRepository } from '../../core/repositories/ConcreteRepositories';
import { SyncQueueManager } from '../../core/repositories/SyncQueueManager';
import { DomainFormatter } from '../../domain/utils';
import { DomainValidator } from '../../domain/validators';
import { DomainConstants } from '../../domain/models';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

const WHATSAPP_TEMPLATES = {
  REMINDER: "Halo Bapak/Ibu {nama},\n\nKami dari tim FC.OS ingin mengonfirmasi terkait tagihan dengan nomor kontrak {kontrak}. Saat ini terdapat tunggakan sebesar Rp {outstanding} dengan keterlambatan {hari} hari.\n\nMohon segera melakukan pembayaran melalui kanal resmi. Terima kasih.",
  PTP: "Halo Bapak/Ibu {nama},\n\nTerima kasih atas konfirmasinya. Sesuai kesepakatan, kami telah mencatat janji pembayaran Anda untuk nomor kontrak {kontrak} sebesar Rp {outstanding} pada tanggal {hari} hari yang lalu/jatuh tempo.\n\nMohon melakukan pembayaran sesuai komitmen tersebut. Terima kasih.",
  VISIT: "Halo Bapak/Ibu {nama},\n\nPetugas lapangan kami (FC.OS) telah melakukan kunjungan ke alamat Anda hari ini terkait penyelesaian kewajiban nomor kontrak {kontrak}.\n\nKarena tidak dapat bertemu langsung, mohon hubungi kami kembali di cabang {branch} untuk tindak lanjut. Terima kasih."
};

function formatWhatsAppMessage(template: string, customer: Customer | null): string {
  if (!customer) return '';
  return template
    .replace(/{nama}/gi, customer.name || '')
    .replace(/{kontrak}/gi, customer.contractNumber || 'FCOS-' + customer.id.slice(0, 8).toUpperCase())
    .replace(/{outstanding}/gi, (customer.outstandingBalance || 0).toLocaleString('id-ID'))
    .replace(/{hari}/gi, String(customer.daysOverdue || 0))
    .replace(/{branch}/gi, customer.branch || 'KCP Fatmawati');
}

function sendWhatsApp(phoneNumber: string, rawText: string) {
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }
  const encodedText = encodeURIComponent(rawText);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export const CustomersScreen: React.FC = () => {
  const { t } = useLocalization();
  const { activeCollector } = useStore();
  const navigate = useNavigate();
  
  // Navigation View State
  const [view, setView] = useState<'list' | 'detail' | 'create' | 'edit'>('list');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Customer list and presentation state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10); // Simulated Infinite scroll limit
  const [lastDeletedCustomer, setLastDeletedCustomer] = useState<Customer | null>(null);
  
  // Search, Filter and Sort parameters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterBucket, setFilterBucket] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterArea, setFilterArea] = useState<string>('ALL');
  const [filterBranch, setFilterBranch] = useState<string>('ALL');
  const [filterDeleted, setFilterDeleted] = useState<boolean>(false);
  const [sortField, setSortField] = useState<'priorityLevel' | 'daysOverdue' | 'outstandingBalance' | 'name' | 'lastVisitDate'>('daysOverdue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Show/Hide filter panel
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  
  // Detail related local sub-states
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailNotes, setDetailNotes] = useState<Note[]>([]);
  const [detailAttachments, setDetailAttachments] = useState<Attachment[]>([]);
  const [detailVisits, setDetailVisits] = useState<Visit[]>([]);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailPtps, setDetailPtps] = useState<PromiseToPay[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentBase64, setAttachmentBase64] = useState('');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [isAttachmentSaving, setIsAttachmentSaving] = useState(false);
  
  // WhatsApp Template Modal State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppPhoneNumber, setWhatsAppPhoneNumber] = useState('');
  const [whatsAppCustomer, setWhatsAppCustomer] = useState<Customer | null>(null);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<'REMINDER' | 'PTP' | 'VISIT'>('REMINDER');
  const [customizedMessageText, setCustomizedMessageText] = useState('');
  
  // Simulated Bulk Import state
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState(0);
  const [bulkImportStatus, setBulkImportStatus] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    contractNumber: '',
    address: '',
    phoneNumber: '',
    alternativePhone: '',
    outstandingBalance: 0,
    minPaymentDue: 0,
    installmentAmount: 0,
    daysOverdue: 0,
    bucket: '30' as '30' | '60' | '90' | '90+',
    status: 'PENDING' as 'PENDING' | 'VISITED' | 'PAID' | 'PROMISED',
    priorityLevel: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    area: 'Mampang Prapatan',
    branch: 'KCP Fatmawati',
    latitude: -6.2734,
    longitude: 106.8214,
    notes: '',
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isFormSaving, setIsFormSaving] = useState(false);

  // Fetch all customers from Dexie Repo
  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const allCustomers = await customerRepository.findAll({ includeDeleted: true } as any);
      setCustomers(allCustomers);
    } catch (e) {
      console.error('Failed to load portfolio customers', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Sync specific customer detail components when selectedCustomerId changes
  const loadCustomerDetailData = async (custId: string) => {
    try {
      const cust = await customerRepository.findById(custId, true);
      if (cust) {
        setDetailCustomer(cust);
        
        // Fetch Notes
        const notes = await noteRepository.findForEntity('customer', custId);
        setDetailNotes(notes);
        
        // Fetch Attachments
        const attachments = await attachmentRepository.findForEntity('customer', custId);
        setDetailAttachments(attachments);

        // Fetch Visits from DB
        const visits = await db.visits.where('customerId').equals(custId).toArray();
        setDetailVisits(visits);

        // Fetch Payments from DB
        const payments = await db.payments.where('customerId').equals(custId).toArray();
        setDetailPayments(payments);

        // Fetch Promises to Pay
        const ptps = await db.promiseToPay.where('customerId').equals(custId).toArray();
        setDetailPtps(ptps);
      }
    } catch (e) {
      console.error('Failed to load customer sub-details', e);
    }
  };

  useEffect(() => {
    if (selectedCustomerId && (view === 'detail' || view === 'edit')) {
      loadCustomerDetailData(selectedCustomerId);
    }
  }, [selectedCustomerId, view]);

  // Extract unique areas and branches for filter option dropdowns
  const uniqueAreas = Array.from(new Set(customers.map(c => c.area).filter(Boolean)));
  const uniqueBranches = Array.from(new Set(customers.map(c => c.branch).filter(Boolean)));

  // Filter & Sort Core Logic
  const filteredCustomers = customers.filter(c => {
    // Soft Delete check
    if (filterDeleted) {
      if (!c.isDeleted) return false;
    } else {
      if (c.isDeleted) return false;
    }

    // Search query
    const matchSearch = 
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contractNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phoneNumber?.includes(searchQuery);

    if (!matchSearch) return false;

    // Filters
    if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
    if (filterBucket !== 'ALL' && c.bucket !== filterBucket) return false;
    if (filterPriority !== 'ALL' && c.priorityLevel !== filterPriority) return false;
    if (filterArea !== 'ALL' && c.area !== filterArea) return false;
    if (filterBranch !== 'ALL' && c.branch !== filterBranch) return false;

    return true;
  });

  // Sort Logic
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    let valA: any = a[sortField];
    let valB: any = b[sortField];

    // Priority Map sorting weight
    if (sortField === 'priorityLevel') {
      const weight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, undefined: 0 };
      valA = weight[a.priorityLevel || 'LOW'];
      valB = weight[b.priorityLevel || 'LOW'];
    }

    if (valA === undefined) return sortOrder === 'asc' ? 1 : -1;
    if (valB === undefined) return sortOrder === 'asc' ? -1 : 1;

    if (typeof valA === 'string') {
      return sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }

    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  // Paginated/Lazy customers
  const paginatedCustomers = sortedCustomers.slice(0, visibleCount);

  // Summary statistics for currently filtered list
  const totalOutstanding = filteredCustomers.reduce((acc, c) => acc + c.outstandingBalance, 0);
  const totalMinDue = filteredCustomers.reduce((acc, c) => acc + c.minPaymentDue, 0);
  const criticalCount = filteredCustomers.filter(c => c.priorityLevel === 'CRITICAL').length;
  const overdueCount = filteredCustomers.filter(c => c.daysOverdue > 0).length;

  // Form Reset
  const resetForm = (c?: Customer) => {
    if (c) {
      setFormData({
        id: c.id,
        name: c.name,
        contractNumber: c.contractNumber || '',
        address: c.address,
        phoneNumber: c.phoneNumber,
        alternativePhone: c.alternativePhone || '',
        outstandingBalance: c.outstandingBalance,
        minPaymentDue: c.minPaymentDue,
        installmentAmount: c.installmentAmount || 0,
        daysOverdue: c.daysOverdue,
        bucket: c.bucket,
        status: c.status,
        priorityLevel: c.priorityLevel || 'LOW',
        area: c.area || 'Mampang Prapatan',
        branch: c.branch || 'KCP Fatmawati',
        latitude: c.latitude || -6.2734,
        longitude: c.longitude || 106.8214,
        notes: c.notes || '',
        dueDate: c.dueDate ? c.dueDate.split('T')[0] : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    } else {
      const generatedId = `ACC-${Math.floor(100000 + Math.random() * 900000)}`;
      setFormData({
        id: generatedId,
        name: '',
        contractNumber: `CTR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        address: '',
        phoneNumber: '',
        alternativePhone: '',
        outstandingBalance: 0,
        minPaymentDue: 0,
        installmentAmount: 0,
        daysOverdue: 0,
        bucket: '30',
        status: 'PENDING',
        priorityLevel: 'LOW',
        area: 'Mampang Prapatan',
        branch: activeCollector?.branch || 'KCP Fatmawati',
        latitude: -6.2734,
        longitude: 106.8214,
        notes: '',
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
    setFormErrors({});
  };

  const handleOpenCreate = () => {
    resetForm();
    setView('create');
  };

  const handleOpenEdit = (c: Customer) => {
    resetForm(c);
    setSelectedCustomerId(c.id);
    setView('edit');
  };

  // Form validation & submission
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // ID validation
    if (!formData.id.trim()) {
      errors.id = 'Nomor Pelanggan (ID) wajib diisi.';
    } else if (view === 'create' && customers.some(c => c.id === formData.id)) {
      errors.id = 'Nomor Pelanggan sudah terdaftar di sistem.';
    }

    // Name validation
    const nameCheck = DomainValidator.required(formData.name, 'Nama debitur');
    if (!nameCheck.success) errors.name = nameCheck.error.message;

    // Phone validation
    const phoneCheck = DomainValidator.phone(formData.phoneNumber, 'Nomor telepon');
    if (!phoneCheck.success) errors.phoneNumber = phoneCheck.error.message;

    if (formData.alternativePhone) {
      const altCheck = DomainValidator.phone(formData.alternativePhone, 'Nomor telepon alternatif');
      if (!altCheck.success) errors.alternativePhone = altCheck.error.message;
    }

    // Address validation
    const addressCheck = DomainValidator.required(formData.address, 'Alamat');
    if (!addressCheck.success) errors.address = addressCheck.error.message;

    // Finance validations
    if (formData.outstandingBalance < 0) {
      errors.outstandingBalance = 'Saldo outstanding tidak boleh negatif.';
    }
    if (formData.minPaymentDue < 0) {
      errors.minPaymentDue = 'Minimum pembayaran tidak boleh negatif.';
    }
    if (formData.installmentAmount < 0) {
      errors.installmentAmount = 'Nilai angsuran tidak boleh negatif.';
    }
    if (formData.daysOverdue < 0) {
      errors.daysOverdue = 'Hari keterlambatan (DPD) tidak boleh negatif.';
    }

    // Coordinates check
    const coordCheck = DomainValidator.coordinate({ latitude: formData.latitude, longitude: formData.longitude });
    if (!coordCheck.success) {
      errors.latitude = coordCheck.error.message;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsFormSaving(true);
    try {
      const currentTimestamp = new Date().toISOString();
      const collectorId = activeCollector?.id || '';

      const record: Partial<Customer> = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        alternativePhone: formData.alternativePhone.trim() || undefined,
        outstandingBalance: Number(formData.outstandingBalance),
        minPaymentDue: Number(formData.minPaymentDue),
        installmentAmount: Number(formData.installmentAmount),
        daysOverdue: Number(formData.daysOverdue),
        bucket: formData.bucket,
        status: formData.status,
        priorityLevel: formData.priorityLevel,
        area: formData.area,
        branch: formData.branch,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        notes: formData.notes.trim() || undefined,
        contractNumber: formData.contractNumber.trim() || undefined,
        dueDate: new Date(formData.dueDate).toISOString(),
        assignedCollectorId: collectorId,
        updatedAt: currentTimestamp,
        updatedBy: collectorId
      };

      if (view === 'create') {
        const fullRecord: Customer = {
          id: formData.id.trim(),
          uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + currentTimestamp,
          createdAt: currentTimestamp,
          deletedAt: null,
          isDeleted: false,
          version: 1,
          syncStatus: 'pending',
          createdBy: collectorId,
          ...(record as Customer)
        };

        await customerRepository.insert(fullRecord, collectorId);
        try {
          await SyncQueueManager.enqueue(
            'customer',
            fullRecord.id,
            'CREATE',
            fullRecord,
            collectorId
          );
        } catch (syncErr) {
          console.error('Failed to enqueue customer creation', syncErr);
        }
      } else {
        await customerRepository.update(formData.id, record, collectorId);
        const updatedCustomer = await customerRepository.findById(formData.id, true);
        if (updatedCustomer) {
          try {
            await SyncQueueManager.enqueue(
              'customer',
              formData.id,
              'UPDATE',
              updatedCustomer,
              collectorId
            );
          } catch (syncErr) {
            console.error('Failed to enqueue customer update', syncErr);
          }
        }
      }

      await loadCustomers();
      setView('list');
    } catch (err) {
      console.error('Failed to persist customer', err);
      alert('Gagal menyimpan data pelanggan ke database lokal.');
    } finally {
      setIsFormSaving(false);
    }
  };

  // Soft Delete handler
  const handleDeleteCustomer = async (custId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin memindahkan debitur ini ke folder sampah?')) return;
    try {
      const target = customers.find(c => c.id === custId);
      if (target) {
        setLastDeletedCustomer(target);
      }
      const collectorId = activeCollector?.id || '';
      await customerRepository.softDelete(custId, collectorId);

      const deletedRecord = await customerRepository.findById(custId, true);
      if (deletedRecord) {
        try {
          await SyncQueueManager.enqueue(
            'customer',
            custId,
            'UPDATE',
            deletedRecord,
            collectorId
          );
        } catch (syncErr) {
          console.error('Failed to enqueue customer delete', syncErr);
        }
      }

      await loadCustomers();
      setSelectedCustomerId(null);
      setView('list');
    } catch (e) {
      console.error('Soft delete failed', e);
    }
  };

  // Restore handler
  const handleRestoreCustomer = async (custId: string) => {
    try {
      const collectorId = activeCollector?.id || '';
      await customerRepository.restore(custId, collectorId);

      const restoredRecord = await customerRepository.findById(custId, true);
      if (restoredRecord) {
        try {
          await SyncQueueManager.enqueue(
            'customer',
            custId,
            'UPDATE',
            restoredRecord,
            collectorId
          );
        } catch (syncErr) {
          console.error('Failed to enqueue customer restore', syncErr);
        }
      }

      await loadCustomers();
      setLastDeletedCustomer(null);
    } catch (e) {
      console.error('Restore customer failed', e);
    }
  };

  // Add Local Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedCustomerId) return;
    
    setIsNoteSaving(true);
    try {
      const now = new Date().toISOString();
      const collectorId = activeCollector?.id || '';
      const id = `NTE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const newNote: Note = {
        id,
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: collectorId,
        updatedBy: collectorId,
        entityType: 'customer',
        entityId: selectedCustomerId,
        content: newNoteText.trim()
      };

      await noteRepository.insert(newNote, collectorId);
      setNewNoteText('');
      await loadCustomerDetailData(selectedCustomerId);
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setIsNoteSaving(false);
    }
  };

  // Simulated Attach File
  const handleUploadSimulatedAttachment = async () => {
    if (!attachmentName.trim() || !selectedCustomerId) {
      alert('Silakan ketik nama lampiran terlebih dahulu.');
      return;
    }
    
    setIsAttachmentSaving(true);
    try {
      const now = new Date().toISOString();
      const collectorId = activeCollector?.id || '';
      const id = `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const newAttachment: Attachment = {
        id,
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        isDeleted: false,
        version: 1,
        syncStatus: 'pending',
        createdBy: collectorId,
        updatedBy: collectorId,
        entityType: 'customer',
        entityId: selectedCustomerId,
        fileName: attachmentName.trim() + '.jpg',
        fileType: 'image/jpeg',
        fileSize: Math.floor(1024 * 50 + Math.random() * 1024 * 200), // ~50kb to 250kb
        fileUrlOrBase64: attachmentBase64 || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNDAiIGZpbGw9IiNlMmU4ZjAiLz48L3N2Zz4='
      };

      await attachmentRepository.insert(newAttachment, collectorId);
      setAttachmentName('');
      setAttachmentBase64('');
      await loadCustomerDetailData(selectedCustomerId);
    } catch (err) {
      console.error('Failed to attach file', err);
    } finally {
      setIsAttachmentSaving(false);
    }
  };

  // Simulated Excel Bulk Import Process
  const handleSimulatedBulkImport = () => {
    setIsImporting(true);
    setBulkImportProgress(10);
    setBulkImportStatus('Membaca berkas spreadsheet...');

    const interval = setInterval(async () => {
      setBulkImportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(async () => {
            // Bulk add 5 unique customers
            const baseFields = () => {
              const now = new Date().toISOString();
              return {
                uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                isDeleted: false,
                version: 1,
                syncStatus: 'pending' as const,
                createdBy: activeCollector?.id || '',
                updatedBy: activeCollector?.id || '',
              };
            };

            const imports: Customer[] = [
              {
                id: 'ACC-209112',
                ...baseFields(),
                name: 'Rian Hidayat',
                address: 'Komp. Rawa Barat No. 34, Kebayoran Baru, Jakarta Selatan',
                phoneNumber: '081288991122',
                outstandingBalance: 17800000,
                minPaymentDue: 1800000,
                daysOverdue: 45,
                bucket: '30',
                status: 'PENDING',
                priorityLevel: 'HIGH',
                area: 'Kebayoran Baru',
                branch: 'KCP Fatmawati',
                installmentAmount: 1800000,
                dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
                latitude: -6.2341,
                longitude: 106.8012,
                notes: 'Imported via Bulk Upload.'
              },
              {
                id: 'ACC-201889',
                ...baseFields(),
                name: 'Linda Permata',
                address: 'Jl. Melati Blok G No. 9, Pancoran, Jakarta Selatan',
                phoneNumber: '081377889900',
                outstandingBalance: 31000000,
                minPaymentDue: 5000000,
                daysOverdue: 95,
                bucket: '90',
                status: 'PENDING',
                priorityLevel: 'CRITICAL',
                area: 'Pancoran',
                branch: 'KCP Fatmawati',
                installmentAmount: 2500000,
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                latitude: -6.2512,
                longitude: 106.8322,
                notes: 'Imported via Bulk Upload.'
              },
              {
                id: 'ACC-205118',
                ...baseFields(),
                name: 'Taufik Rahman',
                address: 'Jl. Dr. Saharjo No. 120, Tebet, Jakarta Selatan',
                phoneNumber: '085611229988',
                outstandingBalance: 6500000,
                minPaymentDue: 1500000,
                daysOverdue: 12,
                bucket: '30',
                status: 'PENDING',
                priorityLevel: 'LOW',
                area: 'Tebet',
                branch: 'KCP Fatmawati',
                installmentAmount: 750000,
                dueDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
                latitude: -6.2215,
                longitude: 106.8415,
                notes: 'Imported via Bulk Upload.'
              },
              {
                id: 'ACC-209115',
                ...baseFields(),
                name: 'Yulia Saputri',
                address: 'Perumahan Pondok Indah Blok D-11, Kebayoran Lama',
                phoneNumber: '081199001133',
                outstandingBalance: 42000000,
                minPaymentDue: 8000000,
                daysOverdue: 110,
                bucket: '90+',
                status: 'PENDING',
                priorityLevel: 'CRITICAL',
                area: 'Kebayoran Lama',
                branch: 'KCP Fatmawati',
                installmentAmount: 4000000,
                dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                latitude: -6.2655,
                longitude: 106.7725,
                notes: 'Imported via Bulk Upload.'
              },
              {
                id: 'ACC-204556',
                ...baseFields(),
                name: 'Adi Putera',
                address: 'Gg. Masjid No. 25, Jagakarsa, Jakarta Selatan',
                phoneNumber: '081244558800',
                outstandingBalance: 12000000,
                minPaymentDue: 1200000,
                daysOverdue: 58,
                bucket: '60',
                status: 'PENDING',
                priorityLevel: 'MEDIUM',
                area: 'Jagakarsa',
                branch: 'KCP Fatmawati',
                installmentAmount: 1200000,
                dueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
                latitude: -6.3212,
                longitude: 106.8124,
                notes: 'Imported via Bulk Upload.'
              }
            ];

            try {
              await db.customers.bulkAdd(imports);
              await loadCustomers();
              setBulkImportStatus('Impor 5 Debitur Berhasil disimpan!');
              setIsImporting(false);
              setTimeout(() => {
                setIsBulkImportOpen(false);
                setBulkImportProgress(0);
              }, 1200);
            } catch (bulkErr) {
              console.error('Bulk insert failed', bulkErr);
              setBulkImportStatus('Gagal menyimpan beberapa entri. ID Duplikat.');
              setIsImporting(false);
            }
          }, 500);
          return 100;
        }
        
        if (prev < 40) {
          setBulkImportStatus('Memvalidasi format kolom data & aturan DPD...');
          return prev + 25;
        } else if (prev < 80) {
          setBulkImportStatus('Mendaftarkan transaksi ke SQLite Dexie DB...');
          return prev + 30;
        }
        return prev + 10;
      });
    }, 400);
  };

  // Trigger simulated local file selector
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleSimulatedBulkImport();
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10" id="customer-portfolio-section">
      
      {/* UNDO DELETION TOAST */}
      <AnimatePresence>
        {lastDeletedCustomer && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 z-50 bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between border border-slate-800"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="text-emerald-500 w-5 h-5 shrink-0" />
              <div className="text-xs">
                <span className="font-bold">{lastDeletedCustomer.name}</span> dipindahkan ke Sampah.
              </div>
            </div>
            <button 
              onClick={() => handleRestoreCustomer(lastDeletedCustomer.id)}
              className="text-xs font-mono font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 active:scale-95 transition-all"
            >
              <Undo className="w-3.5 h-3.5" /> URUNGKAN
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW: PORTFOLIO LISTING */}
      {view === 'list' && (
        <div className="space-y-6">
          
          {/* HEADER AND QUICK ACTIONS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2">
                <Activity className="text-blue-600 w-7 h-7" /> Portofolio Kolektor
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pondasi Domain Kerja Lapangan Offline FCOS v{DomainConstants.VERSION}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsBulkImportOpen(true)}
                className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <UploadCloud className="w-4 h-4" /> Impor Excel
              </button>
              <button 
                onClick={handleOpenCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> Tambah Debitur
              </button>
            </div>
          </div>

          {/* SIMULATED BULK IMPORT MODAL */}
          {isBulkImportOpen && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <UploadCloud className="text-emerald-600 w-5 h-5" /> Unggah Spreadsheet Portofolio Kolektif
                </h3>
                <button onClick={() => setIsBulkImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleSimulatedBulkImport}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-xl p-8 text-center cursor-pointer space-y-3 bg-slate-50/50 dark:bg-slate-950/20 transition-all"
              >
                <div className="mx-auto w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 rounded-full flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tarik & Lepas file Excel (.xlsx) atau CSV di sini
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Atau klik untuk menyeleksi file dari komputer Anda secara lokal
                  </p>
                </div>
              </div>

              {isImporting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <span>{bulkImportStatus}</span>
                    <span>{bulkImportProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300" 
                      style={{ width: `${bulkImportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {!isImporting && bulkImportStatus && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-lg flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4 shrink-0" /> {bulkImportStatus}
                </div>
              )}
            </div>
          )}

          {/* PORTFOLIO METRICS / COUNTERS CONTAINER */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sisa Outstanding</span>
              <span className="block text-sm font-black text-slate-900 dark:text-white font-mono mt-1">
                {formatCurrency(totalOutstanding)}
              </span>
              <span className="text-[9px] text-slate-500 mt-0.5 block">Dari {filteredCustomers.length} Debitur</span>
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Min Pembayaran</span>
              <span className="block text-sm font-black text-slate-900 dark:text-white font-mono mt-1 text-blue-600">
                {formatCurrency(totalMinDue)}
              </span>
              <span className="text-[9px] text-slate-500 mt-0.5 block">Harus Ditagih</span>
            </div>

            <div className="p-4 bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/40 rounded-2xl shadow-sm text-center">
              <span className="block text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Prioritas Kritis
              </span>
              <span className="block text-xl font-black text-red-600 dark:text-red-400 font-mono mt-1">
                {criticalCount}
              </span>
              <span className="text-[9px] text-red-500/80 mt-0.5 block">Butuh Tindakan Segera</span>
            </div>

            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/40 rounded-2xl shadow-sm text-center">
              <span className="block text-[10px] font-bold text-amber-600 uppercase tracking-wider">Debitur Menunggak</span>
              <span className="block text-xl font-black text-amber-700 dark:text-amber-500 font-mono mt-1">
                {overdueCount}
              </span>
              <span className="text-[9px] text-amber-600/80 mt-0.5 block">Memiliki Hari Terlewat (DPD)</span>
            </div>
          </div>

          {/* SEARCH, SORT, FILTER TOOLBAR */}
          <div className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            
            {/* Search Input and Filter Toggle */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text"
                  placeholder="Cari Debitur, No Kontrak, No HP, Alamat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 pl-11 pr-4 py-3 text-xs md:text-sm font-semibold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-800 dark:text-white"
                />
              </div>
              <button 
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className={`px-4 py-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95 ${isFilterPanelOpen ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 dark:bg-slate-950 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
              >
                <Filter className="w-4 h-4" /> Filter {isFilterPanelOpen ? 'Tutup' : 'Buka'}
              </button>
            </div>

            {/* EXPANDABLE FILTER OPTIONS PANEL */}
            {isFilterPanelOpen && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in">
                
                {/* STATUS FILTER */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status Penagihan</label>
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-xs font-semibold outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="PENDING">PENDING (Belum Dikunjungi)</option>
                    <option value="VISITED">VISITED (Telah Dikunjungi)</option>
                    <option value="PAID">PAID (Lunas/Bayar)</option>
                    <option value="PROMISED">PROMISED (Janji Bayar)</option>
                  </select>
                </div>

                {/* BUCKET FILTER */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Bucket Tunggakan</label>
                  <select 
                    value={filterBucket}
                    onChange={(e) => setFilterBucket(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-xs font-semibold outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">Semua Bucket</option>
                    <option value="30">30 Hari</option>
                    <option value="60">60 Hari</option>
                    <option value="90">90 Hari</option>
                    <option value="90+">90+ Hari</option>
                  </select>
                </div>

                {/* PRIORITY FILTER */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Prioritas Kerja</label>
                  <select 
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-xs font-semibold outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">Semua Prioritas</option>
                    <option value="LOW">LOW (Rendah)</option>
                    <option value="MEDIUM">MEDIUM (Sedang)</option>
                    <option value="HIGH">HIGH (Tinggi)</option>
                    <option value="CRITICAL">CRITICAL (Sangat Mendesak)</option>
                  </select>
                </div>

                {/* AREA FILTER */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Area Kerja</label>
                  <select 
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-xs font-semibold outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">Semua Area</option>
                    {uniqueAreas.map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>

                {/* BRANCH FILTER */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Kantor Cabang</label>
                  <select 
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-xs font-semibold outline-none text-slate-800 dark:text-slate-100"
                  >
                    <option value="ALL">Semua Cabang</option>
                    {uniqueBranches.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>

                {/* TRASH VIEW */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Arsip / Folder Sampah</label>
                  <div className="flex items-center h-[34px]">
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={filterDeleted} 
                        onChange={(e) => setFilterDeleted(e.target.checked)} 
                        className="sr-only peer"
                      />
                      <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-red-600"></div>
                      <span className="ms-3 text-xs font-bold text-red-600">Lihat Debitur Terhapus</span>
                    </label>
                  </div>
                </div>

              </div>
            )}

            {/* SORT FIELDS BAR */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400 font-bold">
                <ArrowUpDown className="w-4 h-4 text-blue-600" /> Urut Berdasarkan:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: 'Prioritas', field: 'priorityLevel' },
                  { label: 'Hari Terlambat DPD', field: 'daysOverdue' },
                  { label: 'Outstanding Balance', field: 'outstandingBalance' },
                  { label: 'Nama Debitur', field: 'name' },
                  { label: 'Kunjungan Terakhir', field: 'lastVisitDate' }
                ].map((option) => (
                  <button
                    key={option.field}
                    onClick={() => {
                      if (sortField === option.field) {
                        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField(option.field as any);
                        setSortOrder('desc');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg border font-bold transition-all text-[11px] ${sortField === option.field ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}`}
                  >
                    {option.label} {sortField === option.field && (sortOrder === 'asc' ? '▲' : '▼')}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* LIST CARDS */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(n => (
                  <div key={n} className="h-44 bg-white dark:bg-slate-900 rounded-2xl animate-pulse border border-slate-100 dark:border-slate-800" />
                ))}
              </div>
            ) : paginatedCustomers.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl space-y-4 bg-white dark:bg-slate-900">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-400 mx-auto">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-200">Portofolio Kerja Bersih</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                    Tidak ditemukan debitur aktif yang sesuai dengan kriteria filter, pencarian, atau status yang dipilih.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('ALL');
                    setFilterBucket('ALL');
                    setFilterPriority('ALL');
                    setFilterArea('ALL');
                    setFilterBranch('ALL');
                    setFilterDeleted(false);
                  }}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 text-slate-700 dark:text-slate-300"
                >
                  Bersihkan Semua Filter
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
                  <span>Menampilkan {paginatedCustomers.length} dari {sortedCustomers.length} Pelanggan</span>
                  <span>Urutan: {sortField} ({sortOrder === 'asc' ? 'Kecil ke Besar' : 'Besar ke Kecil'})</span>
                </div>
                
                {paginatedCustomers.map((customer) => {
                  const daysOverdue = customer.daysOverdue || 0;
                  const isCritical = customer.priorityLevel === 'CRITICAL' || customer.priorityLevel === 'HIGH';
                  
                  return (
                    <div 
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomerId(customer.id);
                        setView('detail');
                      }}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900 rounded-2xl p-4 md:p-5 shadow-sm transition-all duration-200 cursor-pointer hover:shadow-md relative overflow-hidden group active:scale-[0.99]"
                    >
                      {/* Left accent color based on priority level */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        customer.priorityLevel === 'CRITICAL' ? 'bg-red-600' :
                        customer.priorityLevel === 'HIGH' ? 'bg-amber-500' :
                        customer.priorityLevel === 'MEDIUM' ? 'bg-blue-500' : 'bg-slate-300'
                      }`} />

                      <div className="pl-2 space-y-3">
                        
                        {/* Title Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-slate-400">{customer.id}</span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span className="text-[10px] font-mono font-bold text-slate-400">{customer.contractNumber || '-'}</span>
                            </div>
                            <h4 className="text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                              {customer.name}
                            </h4>
                          </div>
                          
                          {/* Badges Container */}
                          <div className="flex flex-col sm:flex-row items-end gap-1.5">
                            <span className={`px-2.5 py-1 text-[9px] font-black border rounded-full uppercase tracking-wider ${
                              customer.priorityLevel === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900' :
                              customer.priorityLevel === 'HIGH' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900' :
                              customer.priorityLevel === 'MEDIUM' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900' :
                              'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}>
                              {customer.priorityLevel || 'LOW'}
                            </span>
                            <span className={`px-2.5 py-1 text-[9px] font-black border rounded-full uppercase tracking-wider ${THEME.colors.status[customer.status]}`}>
                              {t(`customer.status.${customer.status}`)}
                            </span>
                          </div>
                        </div>

                        {/* Location / Meta row */}
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[240px]">{customer.address}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/40 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            {customer.area}
                          </div>
                        </div>

                        {/* Financial bento metrics */}
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-center font-mono">
                          <div className="p-1.5 bg-slate-50 dark:bg-slate-950/50 rounded-lg">
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">Outstanding</span>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-200">
                              {formatCurrency(customer.outstandingBalance)}
                            </span>
                          </div>
                          
                          <div className="p-1.5 bg-slate-50 dark:bg-slate-950/50 rounded-lg">
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">Min Tagihan</span>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-200">
                              {formatCurrency(customer.minPaymentDue)}
                            </span>
                          </div>

                          <div className="p-1.5 bg-slate-50 dark:bg-slate-950/50 rounded-lg">
                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">Overdue Days</span>
                            <span className={`text-[11px] font-bold ${daysOverdue >= 90 ? 'text-red-600 dark:text-red-400' : daysOverdue >= 30 ? 'text-amber-500' : 'text-slate-800 dark:text-slate-200'}`}>
                              {daysOverdue} DPD ({customer.bucket}d)
                            </span>
                          </div>
                        </div>

                        {/* Bottom Meta Log Details */}
                        <div className="flex items-center justify-between pt-2 text-[10px] text-slate-400 border-t border-dashed border-slate-100 dark:border-slate-800/40 flex-wrap gap-2">
                          <div>
                            <strong>Hari Ini:</strong> {daysOverdue >= 90 ? '🔴 Prioritas Eksekusi' : daysOverdue >= 60 ? '🟡 Tagih Intensif' : '🔵 Tindakan Pengingat'}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setWhatsAppCustomer(customer);
                                setWhatsAppPhoneNumber(customer.phoneNumber);
                                setSelectedTemplateCategory('REMINDER');
                                setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.REMINDER, customer));
                                setShowWhatsAppModal(true);
                              }}
                              className="flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/40 transition-all active:scale-95"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-500" /> WhatsApp
                            </button>
                            <div className="flex items-center gap-1 font-semibold text-blue-600 hover:underline">
                              Lihat Detail <ChevronRight className="w-3 h-3" />
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}

                {/* Simulated Infinite Scroll trigger */}
                {visibleCount < sortedCustomers.length && (
                  <button
                    onClick={() => setVisibleCount(prev => prev + 10)}
                    className="w-full py-4 text-xs font-black text-blue-600 hover:text-blue-700 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center active:scale-98 transition-all"
                  >
                    Muat Lebih Banyak Debitur ({sortedCustomers.length - visibleCount} Tersisa)
                  </button>
                )}

              </div>
            )}
          </div>

        </div>
      )}

      {/* VIEW: CREATE OR EDIT FORM */}
      {(view === 'create' || view === 'edit') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {view === 'create' ? 'Tambah Debitur Baru' : 'Edit Informasi Debitur'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pondasi Data Portofolio Kolektor Lapangan offline
              </p>
            </div>
            <button 
              onClick={() => setView('list')}
              className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSaveCustomer} className="space-y-4">
            
            {/* GRID 1: IDENTIFICATION */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nomor Pelanggan (ID) *
                </label>
                <input 
                  type="text" 
                  disabled={view === 'edit'}
                  value={formData.id}
                  onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                  placeholder="ACC-123456"
                  className={`w-full border p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 ${formErrors.id ? 'border-red-500 focus:ring-1 focus:ring-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'}`}
                />
                {formErrors.id && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.id}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nomor Kontrak *
                </label>
                <input 
                  type="text" 
                  value={formData.contractNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, contractNumber: e.target.value }))}
                  placeholder="CTR-2026-XXXX"
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
            </div>

            {/* DEBITUR NAME */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Nama Debitur Lengkap *
              </label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Masukkan nama sesuai KTP"
                className={`w-full border p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 ${formErrors.name ? 'border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'}`}
              />
              {formErrors.name && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.name}</p>}
            </div>

            {/* CONTACT ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nomor Telepon Utama *
                </label>
                <input 
                  type="text" 
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="08XXXXXXXXXX"
                  className={`w-full border p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 ${formErrors.phoneNumber ? 'border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'}`}
                />
                {formErrors.phoneNumber && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.phoneNumber}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nomor Telepon Alternatif
                </label>
                <input 
                  type="text" 
                  value={formData.alternativePhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, alternativePhone: e.target.value }))}
                  placeholder="08XXXXXXXXXX"
                  className={`w-full border p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 ${formErrors.alternativePhone ? 'border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'}`}
                />
                {formErrors.alternativePhone && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.alternativePhone}</p>}
              </div>
            </div>

            {/* ADDRESS */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Alamat Tinggal / Rumah tinggal *
              </label>
              <textarea 
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Jl. Nama Jalan No. Rumah, RT/RW, Kelurahan, Kecamatan"
                rows={2}
                className={`w-full border p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 ${formErrors.address ? 'border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'}`}
              />
              {formErrors.address && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.address}</p>}
            </div>

            {/* GEOLOCATION COORDINATES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Latitude GPS Coordinate *
                </label>
                <input 
                  type="number" 
                  step="0.000001"
                  value={formData.latitude}
                  onChange={(e) => setFormData(prev => ({ ...prev, latitude: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
                {formErrors.latitude && <p className="text-red-500 text-[10px] mt-1 font-bold">{formErrors.latitude}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Longitude GPS Coordinate *
                </label>
                <input 
                  type="number" 
                  step="0.000001"
                  value={formData.longitude}
                  onChange={(e) => setFormData(prev => ({ ...prev, longitude: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
            </div>

            {/* METADATA: AREA & BRANCH */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Wilayah / Area Penagihan
                </label>
                <input 
                  type="text" 
                  value={formData.area}
                  onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value }))}
                  placeholder="Kebayoran Baru, Mampang, Cilandak..."
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Kantor Cabang Pengendali
                </label>
                <input 
                  type="text" 
                  value={formData.branch}
                  onChange={(e) => setFormData(prev => ({ ...prev, branch: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
            </div>

            {/* GRID 2: WORKFLOW BADGES */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Bucket Tunggakan (Kolektibilitas)
                </label>
                <select 
                  value={formData.bucket}
                  onChange={(e) => setFormData(prev => ({ ...prev, bucket: e.target.value as any }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
                >
                  <option value="30">Bucket 30 (Koll 2)</option>
                  <option value="60">Bucket 60 (Koll 3)</option>
                  <option value="90">Bucket 90 (Koll 4)</option>
                  <option value="90+">Bucket 90+ (Koll 5 / NPL)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Status Penagihan Lapangan
                </label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
                >
                  <option value="PENDING">PENDING (Baru)</option>
                  <option value="VISITED">VISITED (Telah Dikunjungi)</option>
                  <option value="PAID">PAID (Telah Bayar)</option>
                  <option value="PROMISED">PROMISED (Janji Bayar)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Prioritas Tindakan
                </label>
                <select 
                  value={formData.priorityLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, priorityLevel: e.target.value as any }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
                >
                  <option value="LOW">LOW (Rendah)</option>
                  <option value="MEDIUM">MEDIUM (Sedang)</option>
                  <option value="HIGH">HIGH (Tinggi)</option>
                  <option value="CRITICAL">CRITICAL (Mendesak)</option>
                </select>
              </div>
            </div>

            {/* GRID 3: FINANCIAL VALUES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Saldo Tunggakan Outstanding (IDR) *
                </label>
                <input 
                  type="number" 
                  value={formData.outstandingBalance}
                  onChange={(e) => setFormData(prev => ({ ...prev, outstandingBalance: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nilai Angsuran Bulanan (IDR)
                </label>
                <input 
                  type="number" 
                  value={formData.installmentAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, installmentAmount: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Min Pembayaran Tagihan (IDR) *
                </label>
                <input 
                  type="number" 
                  value={formData.minPaymentDue}
                  onChange={(e) => setFormData(prev => ({ ...prev, minPaymentDue: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Hari Keterlambatan (DPD) *
                </label>
                <input 
                  type="number" 
                  value={formData.daysOverdue}
                  onChange={(e) => setFormData(prev => ({ ...prev, daysOverdue: Number(e.target.value) }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Tanggal Jatuh Tempo
                </label>
                <input 
                  type="date" 
                  value={formData.dueDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 font-mono text-slate-800 dark:text-slate-100 focus:border-blue-500"
                />
              </div>
            </div>

            {/* PRIVATE NOTES */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Catatan Debitur / Petunjuk Jalan
              </label>
              <textarea 
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Misal: Bertemu Bpk Heru, bayar tiap tanggal 5 sore."
                rows={2}
                className="w-full border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-sm outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:border-blue-500"
              />
            </div>

            {/* FORM ACTIONS */}
            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button"
                onClick={() => setView('list')}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-all"
              >
                Kembali
              </button>
              <button 
                type="submit"
                disabled={isFormSaving}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                {isFormSaving ? 'Menyimpan...' : (
                  <>
                    <CheckCircle className="w-4 h-4" /> Simpan Debitur
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* VIEW: CUSTOMER DETAIL */}
      {view === 'detail' && detailCustomer && (
        <div className="space-y-6 pb-28 md:pb-6">
          
          {/* TOP BACK BAR & ACTIONS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button 
              onClick={() => setView('list')}
              className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-4 py-3 rounded-2xl active:scale-95 transition-all shadow-sm w-full sm:w-auto justify-center"
            >
              ← Kembali ke Portofolio
            </button>
            
            {/* Desktop Actions (Hidden on mobile viewports to promote the bottom ergonomic thumb bar) */}
            <div className="hidden md:flex items-center gap-2">
              <button 
                onClick={() => navigate(`/visits?startCustomerId=${detailCustomer.id}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl active:scale-95 transition-all flex items-center gap-1.5 text-xs font-black shadow-md"
              >
                <MapPin className="w-4 h-4" /> Mulai Kunjungan
              </button>
              <button 
                onClick={() => navigate(`/commitments?startCustomerId=${detailCustomer.id}`)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-2xl active:scale-95 transition-all flex items-center gap-1.5 text-xs font-black shadow-md"
              >
                <Handshake className="w-4 h-4" /> Janji Bayar
              </button>
              <button 
                onClick={() => navigate(`/payments?startCustomerId=${detailCustomer.id}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl active:scale-95 transition-all flex items-center gap-1.5 text-xs font-black shadow-md"
              >
                <CircleDollarSign className="w-4 h-4" /> Terima Bayar
              </button>
              <button 
                onClick={() => handleOpenEdit(detailCustomer)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 p-3 rounded-2xl active:scale-95 transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold"
              >
                <Edit2 className="w-4 h-4" /> Edit
              </button>
              <button 
                onClick={() => handleDeleteCustomer(detailCustomer.id)}
                className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 p-3 rounded-2xl active:scale-95 transition-all border border-red-100 dark:border-red-900/40 flex items-center gap-1.5 text-xs font-bold"
              >
                <Trash2 className="w-4 h-4" /> Hapus
              </button>
            </div>

            {/* Mobile Helper Actions (Edit/Delete only; primary CTAs are in the Bottom Thumb Bar) */}
            <div className="flex md:hidden items-center gap-2 w-full justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kelola Debitur:</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleOpenEdit(detailCustomer)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-3.5 py-2.5 rounded-xl active:scale-95 transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold shadow-xs"
                >
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
                <button 
                  onClick={() => handleDeleteCustomer(detailCustomer.id)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 px-3.5 py-2.5 rounded-xl active:scale-95 transition-all border border-red-100 dark:border-red-900/40 flex items-center gap-1.5 text-xs font-bold shadow-xs"
                >
                  <Trash2 className="w-4 h-4" /> Hapus
                </button>
              </div>
            </div>
          </div>

          {/* BASIC IDENTIFIER HERO CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold text-slate-400">
                  <span>No Pelanggan: {detailCustomer.id}</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>Kontrak: {detailCustomer.contractNumber || '-'}</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-950 dark:text-white mt-1">
                  {detailCustomer.name}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 self-start">
                <span className={`px-3 py-1 text-xs font-black border rounded-full uppercase tracking-wider ${
                  detailCustomer.priorityLevel === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900' :
                  detailCustomer.priorityLevel === 'HIGH' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900' :
                  detailCustomer.priorityLevel === 'MEDIUM' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900' :
                  'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                }`}>
                  PRIORITAS {detailCustomer.priorityLevel || 'LOW'}
                </span>
                <span className={`px-3 py-1 text-xs font-black border rounded-full uppercase tracking-wider ${THEME.colors.status[detailCustomer.status]}`}>
                  {t(`customer.status.${detailCustomer.status}`)}
                </span>
              </div>
            </div>

            {/* METADATA GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm leading-relaxed">
              <div className="space-y-2">
                <p className="flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span><strong>{t('customer.address')}:</strong> {detailCustomer.address}</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span><strong>Telepon Utama:</strong> {DomainFormatter.phone(detailCustomer.phoneNumber)}</span>
                  </p>
                  <button
                    onClick={() => {
                      setWhatsAppCustomer(detailCustomer);
                      setWhatsAppPhoneNumber(detailCustomer.phoneNumber);
                      setSelectedTemplateCategory('REMINDER');
                      setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.REMINDER, detailCustomer));
                      setShowWhatsAppModal(true);
                    }}
                    title="Kirim Pesan WhatsApp terstruktur"
                    className="flex items-center gap-1 text-[11px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 transition-all active:scale-95"
                  >
                    <MessageCircle className="w-3 h-3 text-emerald-500" /> WhatsApp
                  </button>
                </div>
                {detailCustomer.alternativePhone && (
                  <div className="flex items-center gap-2 flex-wrap pl-5.5">
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <span><strong>Telepon Alternatif:</strong> {DomainFormatter.phone(detailCustomer.alternativePhone)}</span>
                    </p>
                    <button
                      onClick={() => {
                        setWhatsAppCustomer(detailCustomer);
                        setWhatsAppPhoneNumber(detailCustomer.alternativePhone);
                        setSelectedTemplateCategory('REMINDER');
                        setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.REMINDER, detailCustomer));
                        setShowWhatsAppModal(true);
                      }}
                      title="Kirim Pesan WhatsApp terstruktur (Alternatif)"
                      className="flex items-center gap-1 text-[11px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 transition-all active:scale-95"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-500" /> WhatsApp Alt
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-3 md:pt-0 md:pl-4">
                <p><strong>Wilayah Penagihan:</strong> {detailCustomer.area || 'Mampang'}</p>
                <p><strong>Kantor Cabang:</strong> {detailCustomer.branch || 'KCP Fatmawati'}</p>
                <p className="flex items-center gap-1">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span><strong>Collector Penanggung Jawab:</strong> {detailCustomer.assignedCollectorId || ''}</span>
                </p>
                {detailCustomer.notes && (
                  <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/40 p-2.5 rounded-lg text-xs text-amber-800 dark:text-amber-400">
                    <strong>Catatan Petunjuk:</strong> {detailCustomer.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* FINANCIAL STATS BENTO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-blue-600" /> Informasi Finansial Piutang
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Outstanding Balance</span>
                <span className="block text-lg md:text-xl font-black text-slate-950 dark:text-white mt-1">
                  {formatCurrency(detailCustomer.outstandingBalance)}
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Min Pembayaran</span>
                <span className="block text-lg md:text-xl font-black text-blue-700 dark:text-blue-400 mt-1">
                  {formatCurrency(detailCustomer.minPaymentDue)}
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Angsuran Bulanan</span>
                <span className="block text-lg md:text-xl font-black text-slate-950 dark:text-white mt-1">
                  {formatCurrency(detailCustomer.installmentAmount || 0)}
                </span>
              </div>

              <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/40">
                <span className="block text-[10px] text-red-600 dark:text-red-400 font-bold uppercase tracking-wider">Days Overdue (DPD)</span>
                <span className="block text-lg md:text-xl font-black text-red-700 dark:text-red-400 mt-1">
                  {detailCustomer.daysOverdue} Hari ({detailCustomer.bucket}d)
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5 pt-3 border-t border-slate-150 dark:border-slate-800/60 justify-between">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Calendar className="w-4 h-4 text-slate-500" /> Tanggal Jatuh Tempo Tagihan:
              </span>
              <span className="font-black text-slate-950 dark:text-white font-mono text-xs md:text-sm">
                {DomainFormatter.date(detailCustomer.dueDate || new Date().toISOString(), 'long')}
              </span>
            </div>
          </div>

          {/* GPS AND ACCURACY */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-4 h-4 text-red-600" /> Lokasi GPS Koordinat Penagihan
            </h3>
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl">
              <div className="text-xs font-mono text-slate-600 dark:text-slate-400 text-center sm:text-left">
                <p><strong>Latitude:</strong> {detailCustomer.latitude || -6.2734}</p>
                <p className="mt-0.5"><strong>Longitude:</strong> {detailCustomer.longitude || 106.8214}</p>
                <p className="mt-0.5 text-[10px] text-slate-400"><strong>Keakuratan GPS:</strong> ±15m (Presisi Tinggi)</p>
              </div>
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${detailCustomer.latitude || -6.2734},${detailCustomer.longitude || 106.8214}`}
                target="_blank"
                referrerPolicy="no-referrer"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all w-full sm:w-auto justify-center"
              >
                <MapPin className="w-3.5 h-3.5" /> Navigasi Peta Google
              </a>
            </div>
          </div>

          {/* HISTORIES: RECENT VISITS & PAYMENTS (PLACEHOLDERS) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* VISITS COLUMN */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <History className="w-4 h-4 text-blue-600" /> Riwayat Kunjungan (Visits)
              </h3>
              
              {detailVisits.length === 0 ? (
                <div className="text-center p-6 bg-slate-50/50 dark:bg-slate-950/10 rounded-xl text-xs text-slate-500">
                  <p>Belum ada riwayat kunjungan.</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Semua kunjungan kolektor akan muncul otomatis di sini.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailVisits.map((visit) => (
                    <div key={visit.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 text-xs">
                      <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                        <span>{visit.status}</span>
                        <span className="font-mono text-slate-400">{DomainFormatter.date(visit.visitDate, 'short')}</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mt-1 font-sans">{visit.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PAYMENTS COLUMN */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Riwayat Pembayaran (Payments)
              </h3>
              
              {detailPayments.length === 0 ? (
                <div className="text-center p-6 bg-slate-50/50 dark:bg-slate-950/10 rounded-xl text-xs text-slate-500">
                  <p>Belum ada bukti kuitansi pembayaran.</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Bukti setor tunai offline kolektor akan tercatat di sini.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailPayments.map((p) => (
                    <div key={p.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 text-xs">
                      <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                        <span className="text-emerald-600">{formatCurrency(p.amount)}</span>
                        <span className="font-mono text-slate-400">{DomainFormatter.date(p.paymentDate, 'short')}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">Receipt No: {p.receiptNumber}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* MORE PLACEHOLDERS: PROMISE TO PAY & TIMELINE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* PROMISE TO PAY */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-4 h-4 text-purple-600" /> Janji Bayar (Promise To Pay)
              </h3>
              
              {detailPtps.length === 0 ? (
                <div className="text-center p-6 bg-slate-50/50 dark:bg-slate-950/10 rounded-xl text-xs text-slate-500">
                  <p>Tidak ada komitmen janji bayar aktif.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailPtps.map((p) => (
                    <div key={p.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 text-xs">
                      <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                        <span className="text-purple-600">{formatCurrency(p.amount)}</span>
                        <span className="font-mono text-slate-400">{DomainFormatter.date(p.promiseDate, 'short')}</span>
                      </div>
                      <p className="text-slate-500 mt-1">{p.notes}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TIMELINE ACTIVITIES */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <History className="w-4 h-4 text-slate-500" /> Garis Waktu Operasi (Timeline)
              </h3>
              
              <div className="relative pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-4 text-xs">
                <div className="relative">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-blue-600 rounded-full" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">Portofolio Diunggah ke HP</p>
                  <p className="text-[10px] text-slate-400">{DomainFormatter.date(detailCustomer.createdAt, 'full')}</p>
                </div>
                
                {detailCustomer.lastVisitDate && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">Kunjungan Kolektor Terakhir</p>
                    <p className="text-[10px] text-slate-400">{DomainFormatter.date(detailCustomer.lastVisitDate, 'full')}</p>
                  </div>
                )}

                {detailCustomer.lastPaymentDate && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">Setoran Cicilan Diidentifikasi</p>
                    <p className="text-[10px] text-slate-400">{DomainFormatter.date(detailCustomer.lastPaymentDate, 'full')}</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* NOTES MANAGER MODULE (FULLY ACTIVE) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MessageSquare className="w-4 h-4 text-blue-600" /> Catatan Aktivitas Lapangan ({detailNotes.length})
            </h3>

            {/* Note list */}
            {detailNotes.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl text-center">
                Belum ada catatan internal. Tambahkan petunjuk jalan atau hasil percakapan di bawah.
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {detailNotes.map((note) => (
                  <div key={note.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850/60 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1">
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-sans">{note.content}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span>Oleh: {note.createdBy}</span>
                        <span>•</span>
                        <span>{DomainFormatter.date(note.createdAt, 'full')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Note form */}
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input 
                type="text"
                placeholder="Tulis instruksi pintu masuk, alamat alternatif..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:border-blue-500"
              />
              <button 
                type="submit"
                disabled={isNoteSaving || !newNoteText.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shrink-0"
              >
                {isNoteSaving ? 'Simpan...' : 'Simpan Catatan'}
              </button>
            </form>
          </div>

          {/* ATTACHMENTS MANAGER MODULE (FULLY ACTIVE) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Paperclip className="w-4 h-4 text-emerald-600" /> Lampiran Berkas & Foto Lokasi ({detailAttachments.length})
            </h3>

            {/* Attachments List */}
            {detailAttachments.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl text-center">
                Belum ada lampiran dokumen atau foto KTP/Rumah.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {detailAttachments.map((att) => (
                  <div key={att.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-xl flex items-center gap-2 text-xs">
                    <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="truncate flex-1">
                      <p className="font-bold text-slate-700 dark:text-slate-300 truncate" title={att.fileName}>{att.fileName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{(att.fileSize / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Simulating Document Attachment with Pre-packaged Base64 payload */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row gap-2">
              <input 
                type="text"
                placeholder="Ketik nama lampiran (misal: Foto KTP, Bukti Rumah)"
                value={attachmentName}
                onChange={(e) => setAttachmentName(e.target.value)}
                className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-white focus:border-blue-500"
              />
              <button 
                type="button"
                onClick={handleUploadSimulatedAttachment}
                disabled={isAttachmentSaving || !attachmentName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shrink-0"
              >
                <UploadCloud className="w-3.5 h-3.5" /> {isAttachmentSaving ? 'Mengunggah...' : 'Unggah File'}
              </button>
            </div>
          </div>

          {/* ERGONOMIC MOBILE DOCK (THUMB ZONE ACTION BAR)
              Always stays floating nicely at the bottom for easy one-handed access on mobile. */}
          <div className="fixed bottom-[64px] left-0 right-0 z-30 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 p-3.5 px-4 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] flex items-center justify-between gap-2.5">
            <button 
              onClick={() => navigate(`/visits?startCustomerId=${detailCustomer.id}`)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-3 px-1.5 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black shadow-md transition-all h-[46px]"
            >
              <MapPin className="w-4 h-4 shrink-0" /> Kunjungan
            </button>
            <button 
              onClick={() => navigate(`/commitments?startCustomerId=${detailCustomer.id}`)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-3 px-1.5 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black shadow-md transition-all h-[46px]"
            >
              <Handshake className="w-4 h-4 shrink-0" /> Janji Bayar
            </button>
            <button 
              onClick={() => navigate(`/payments?startCustomerId=${detailCustomer.id}`)}
              className="flex-1 bg-blue-700 hover:bg-blue-800 active:scale-95 text-white py-3 px-1.5 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black shadow-md transition-all h-[46px]"
            >
              <CircleDollarSign className="w-4 h-4 shrink-0" /> Bayar
            </button>
          </div>

        </div>
      )}

      {/* WHATSAPP TEMPLATE SELECTION MODAL */}
      <AnimatePresence>
        {showWhatsAppModal && whatsAppCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWhatsAppModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            {/* Modal Content */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-emerald-500 shrink-0" /> Kirim Template WhatsApp
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    Nasabah: <span className="font-bold text-slate-700 dark:text-slate-300">{whatsAppCustomer.name}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setShowWhatsAppModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* TEMPLATE CATEGORY SELECTOR CARDS */}
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Pilih Kategori Template Pesan
                </label>
                <div className="grid grid-cols-1 gap-2">
                  
                  {/* Category: REMINDER */}
                  <div 
                    onClick={() => {
                      setSelectedTemplateCategory('REMINDER');
                      setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.REMINDER, whatsAppCustomer));
                    }}
                    className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                      selectedTemplateCategory === 'REMINDER' 
                        ? 'border-red-500 bg-red-50/20 dark:bg-red-950/10' 
                        : 'border-slate-150 dark:border-slate-800/80 hover:border-red-300 dark:hover:border-red-900/60'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">🔴 Somasi / Pengingat Keras (Keterlambatan Tinggi)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Untuk debitur dengan keterlambatan tinggi (DPD tinggi) atau butuh tindakan hukum.</p>
                    </div>
                  </div>

                  {/* Category: PTP */}
                  <div 
                    onClick={() => {
                      setSelectedTemplateCategory('PTP');
                      setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.PTP, whatsAppCustomer));
                    }}
                    className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                      selectedTemplateCategory === 'PTP' 
                        ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10' 
                        : 'border-slate-150 dark:border-slate-800/80 hover:border-blue-300 dark:hover:border-blue-900/60'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">🟡 Konfirmasi Janji Bayar (PTP)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Mengingatkan komitmen janji bayar (Promise to Pay) yang sudah disepakati.</p>
                    </div>
                  </div>

                  {/* Category: VISIT */}
                  <div 
                    onClick={() => {
                      setSelectedTemplateCategory('VISIT');
                      setCustomizedMessageText(formatWhatsAppMessage(WHATSAPP_TEMPLATES.VISIT, whatsAppCustomer));
                    }}
                    className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                      selectedTemplateCategory === 'VISIT' 
                        ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10' 
                        : 'border-slate-150 dark:border-slate-800/80 hover:border-emerald-300 dark:hover:border-emerald-900/60'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">🟢 Kunjungan Lapangan (Visit Notification)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Mengirimkan ringkasan bukti kunjungan saat tidak berhasil bertemu di alamat.</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* LIVE PREVIEW EDITOR TEXTAREA */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Interactive Live Preview
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Dapat diedit manual</span>
                </div>
                <textarea
                  rows={6}
                  value={customizedMessageText}
                  onChange={(e) => setCustomizedMessageText(e.target.value)}
                  placeholder="Ketik draf pesan Anda di sini..."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs outline-none bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                />
              </div>

              {/* TARGET PHONE CONFIRMATION */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="block text-[9px] text-slate-400 font-bold uppercase">Nomor Tujuan</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{DomainFormatter.phone(whatsAppPhoneNumber)}</span>
                </div>
                <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Siap Dikirim
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold py-3 rounded-xl transition-all active:scale-95 text-center"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendWhatsApp(whatsAppPhoneNumber, customizedMessageText);
                    setShowWhatsAppModal(false);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-500/20"
                >
                  <MessageCircle className="w-4 h-4" /> Buka di WhatsApp
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default CustomersScreen;
