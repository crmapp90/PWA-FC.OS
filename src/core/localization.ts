import { create } from 'zustand';
import { logger } from './logger';

export type SupportedLanguage = 'id' | 'en';

/**
 * Localization Dictionary
 * Default language: Bahasa Indonesia (id), with support for future English (en) extension.
 */
export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  id: {
    // General UI
    'app.title': 'FC.OS - Kolektor Lapangan',
    'app.subtitle': 'Field Collection Operating System',
    'app.loading': 'Memuat sistem...',
    'app.error': 'Terjadi kesalahan sistem',
    'app.offline': 'Mode Offline Aktif',
    'app.online': 'Terhubung ke Cloud',
    'app.search_placeholder': 'Cari nama debitur atau nomor akun...',
    
    // Auth
    'auth.login': 'Masuk Sistem',
    'auth.username': 'Nama Pengguna',
    'auth.password': 'Kata Sandi',
    'auth.submitting': 'Menautkan Kredensial...',
    'auth.invalid': 'Nama pengguna atau kata sandi salah',
    'auth.logout': 'Keluar',
    
    // Navigation
    'nav.dashboard': 'Dasbor',
    'nav.customers': 'Daftar Debitur',
    'nav.sync': 'Status Sinkronisasi',
    'nav.settings': 'Pengaturan',
    'nav.logs': 'Audit Log',

    // Dashboard Statistics
    'dashboard.welcome': 'Selamat Bekerja,',
    'dashboard.target': 'Target Koleksi',
    'dashboard.collected': 'Sudah Terkumpul',
    'dashboard.progress': 'Kemajuan Koleksi',
    'dashboard.pending_tasks': 'Tugas Kunjungan',
    'dashboard.overdue': 'Debitur Jatuh Tempo',
    'dashboard.active_region': 'Wilayah Operasional',

    // Customers / Debitur List
    'customer.title': 'Kelola Debitur',
    'customer.account_no': 'No. Rekening',
    'customer.outstanding': 'Sisa Tunggakan',
    'customer.min_due': 'Pembayaran Minimum',
    'customer.overdue_days': 'Hari Keterlambatan',
    'customer.overdue_suffix': 'hari',
    'customer.address': 'Alamat Rumah',
    'customer.phone': 'No. Telepon',
    'customer.status.PENDING': 'Belum Dikunjungi',
    'customer.status.VISITED': 'Sudah Dikunjungi',
    'customer.status.PAID': 'Lunas / Bayar',
    'customer.status.PROMISED': 'Janji Bayar',
    'customer.bucket': 'Kategori Tunggakan',
    'customer.nav_map': 'Petunjuk Rute',

    // Visits / Kunjungan Form
    'visit.title': 'Formulir Kunjungan',
    'visit.status': 'Hasil Kunjungan',
    'visit.status.CONTACT': 'Bertemu Langsung',
    'visit.status.NO_CONTACT': 'Tidak Bertemu / Rumah Kosong',
    'visit.status.BUSINESS_CLOSED': 'Tempat Usaha Tutup',
    'visit.status.ADDRESS_NOT_FOUND': 'Alamat Tidak Ditemukan',
    'visit.notes': 'Catatan Detail Kunjungan',
    'visit.notes_placeholder': 'Tulis rincian hasil pembicaraan, kondisi rumah, alasan menunggak...',
    'visit.gps': 'Koordinat GPS Kunjungan',
    'visit.photo': 'Foto Bukti Kunjungan',
    'visit.submit': 'Simpan Kunjungan Offline',
    'visit.success': 'Kunjungan disimpan dalam antrean offline!',

    // Payments
    'payment.title': 'Penerimaan Pembayaran',
    'payment.amount': 'Jumlah Pembayaran (IDR)',
    'payment.method': 'Metode Pembayaran',
    'payment.method.CASH': 'Tunai',
    'payment.method.BANK_TRANSFER': 'Transfer Bank',
    'payment.method.CHEQUE': 'Cek / Giro',
    'payment.receipt': 'Nomor Tanda Terima',
    'payment.signature': 'Tanda Tangan Debitur',
    'payment.signature_clear': 'Bersihkan',
    'payment.submit': 'Proses Pembayaran Offline',
    'payment.success': 'Pembayaran berhasil disimpan secara lokal!',

    // Promise To Pay (PTP) / Janji Bayar
    'ptp.title': 'Janji Bayar (PTP)',
    'ptp.amount': 'Jumlah Kesepakatan PTP (IDR)',
    'ptp.date': 'Tanggal Rencana Bayar',
    'ptp.notes': 'Catatan Kesepakatan',
    'ptp.submit': 'Simpan Janji Bayar Offline',
    'ptp.success': 'Janji bayar berhasil disimpan dalam antrean!',

    // Sync
    'sync.title': 'Sinkronisasi Cloud',
    'sync.queue': 'Antrean Data Tertunda',
    'sync.empty': 'Semua data telah sinkron dengan server!',
    'sync.now': 'Mulai Sinkronisasi Sekarang',
    'sync.running': 'Sedang mengirim data ke Supabase...',
    'sync.history': 'Histori Transaksi',
  },
  en: {
    // General UI
    'app.title': 'FC.OS - Field Collector',
    'app.subtitle': 'Field Collection Operating System',
    'app.loading': 'Loading system...',
    'app.error': 'System error occurred',
    'app.offline': 'Offline Mode Active',
    'app.online': 'Connected to Cloud',
    'app.search_placeholder': 'Search customer name or account number...',

    // Auth
    'auth.login': 'Login to System',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.submitting': 'Authenticating...',
    'auth.invalid': 'Invalid username or password',
    'auth.logout': 'Logout',

    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.customers': 'Debtors List',
    'nav.sync': 'Sync Status',
    'nav.settings': 'Settings',
    'nav.logs': 'Audit Logs',

    // Dashboard Statistics
    'dashboard.welcome': 'Welcome back,',
    'dashboard.target': 'Collection Target',
    'dashboard.collected': 'Collected Amount',
    'dashboard.progress': 'Collection Progress',
    'dashboard.pending_tasks': 'Visit Tasks',
    'dashboard.overdue': 'Overdue Debtors',
    'dashboard.active_region': 'Active Region',

    // Customers
    'customer.title': 'Manage Debtors',
    'customer.account_no': 'Account No',
    'customer.outstanding': 'Outstanding Balance',
    'customer.min_due': 'Min Payment Due',
    'customer.overdue_days': 'Days Overdue',
    'customer.overdue_suffix': 'days',
    'customer.address': 'Home Address',
    'customer.phone': 'Phone Number',
    'customer.status.PENDING': 'Not Visited',
    'customer.status.VISITED': 'Visited',
    'customer.status.PAID': 'Paid',
    'customer.status.PROMISED': 'PTP (Promised)',
    'customer.bucket': 'Overdue Category',
    'customer.nav_map': 'Get Directions',

    // Visits
    'visit.title': 'Visit Form',
    'visit.status': 'Visit Result',
    'visit.status.CONTACT': 'Met Customer Directly',
    'visit.status.NO_CONTACT': 'No Contact / House Empty',
    'visit.status.BUSINESS_CLOSED': 'Business Place Closed',
    'visit.status.ADDRESS_NOT_FOUND': 'Address Not Found',
    'visit.notes': 'Detailed Visit Notes',
    'visit.notes_placeholder': 'Write detail conversation, housing conditions, overdue reasons...',
    'visit.gps': 'Visit GPS Coordinates',
    'visit.photo': 'Photo Proof of Visit',
    'visit.submit': 'Save Visit Offline',
    'visit.success': 'Visit saved in offline queue!',

    // Payments
    'payment.title': 'Collect Payment',
    'payment.amount': 'Payment Amount (IDR)',
    'payment.method': 'Payment Method',
    'payment.method.CASH': 'Cash',
    'payment.method.BANK_TRANSFER': 'Bank Transfer',
    'payment.method.CHEQUE': 'Cheque / Giro',
    'payment.receipt': 'Receipt Number',
    'payment.signature': 'Debtor Signature',
    'payment.signature_clear': 'Clear',
    'payment.submit': 'Process Payment Offline',
    'payment.success': 'Payment processed and saved locally!',

    // Promise To Pay (PTP)
    'ptp.title': 'Promise To Pay (PTP)',
    'ptp.amount': 'PTP Agreed Amount (IDR)',
    'ptp.date': 'Promise Payment Date',
    'ptp.notes': 'Agreement Notes',
    'ptp.submit': 'Save Promise Offline',
    'ptp.success': 'Promise to pay saved in offline queue!',

    // Sync
    'sync.title': 'Cloud Synchronization',
    'sync.queue': 'Pending Data Queue',
    'sync.empty': 'All data is synchronized with the server!',
    'sync.now': 'Start Sync Now',
    'sync.running': 'Uploading data to Supabase...',
    'sync.history': 'Transaction History',
  }
};

interface LocalizationState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

export const useLocalization = create<LocalizationState>((set, get) => ({
  language: (localStorage.getItem('fc_os_lang') as SupportedLanguage) || 'id',
  setLanguage: (language: SupportedLanguage) => {
    localStorage.setItem('fc_os_lang', language);
    logger.info('Localization', `Language switched to: ${language}`);
    set({ language });
  },
  t: (key: string) => {
    const { language } = get();
    return TRANSLATIONS[language][key] || key;
  }
}));
export default useLocalization;
