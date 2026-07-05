import React, { useState } from 'react';
import { 
  Trash2, 
  Languages, 
  Moon, 
  Sun,
  Bell,
  WifiOff,
  LogOut,
  FileText,
  BrainCircuit,
  User,
  Building,
  Check,
  Loader2,
  TrendingUp,
  Target,
  Cloud,
  Database,
  Key,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { useStore } from '../../core/store';
import { useLocalization } from '../../core/localization';
import { ReusableCard, ConfirmationDialog } from '../../shared/components/BaseComponents';
import { db } from '../../core/database';
import { secureStorage } from '../../core/secure_storage';
import { logger } from '../../core/logger';
import { isSupabaseConfigured, updateSupabaseConfig } from '../../core/supabase';
import { AuthService } from '../../core/auth_service';


export const SettingsScreen: React.FC = () => {
  const { language, setLanguage } = useLocalization();
  const { 
    theme, 
    setTheme, 
    offlinePreference, 
    setOfflinePreference,
    notificationPreference, 
    setNotificationPreference,
    activeCollector,
    updateActiveCollector,
    logout,
    triggerSync
  } = useStore();

  const [collectorName, setCollectorName] = useState(activeCollector?.fullName || '');
  const [collectorBranch, setCollectorBranch] = useState(activeCollector?.branch || '');
  const [monthlyTarget, setMonthlyTarget] = useState<string>(
    activeCollector?.targetAmount !== undefined ? String(activeCollector.targetAmount) : '50000000'
  );
  const [dailyTarget, setDailyTarget] = useState<string>(
    activeCollector?.dailyTargetAmount !== undefined ? String(activeCollector.dailyTargetAmount) : String(Math.round((activeCollector?.targetAmount || 50000000) / 22))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const [supabaseUrlInput, setSupabaseUrlInput] = useState(localStorage.getItem('supabase_url_override') || '');
  const [supabaseAnonKeyInput, setSupabaseAnonKeyInput] = useState(localStorage.getItem('supabase_anon_key_override') || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestMsg, setConnectionTestMsg] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [isPwaClearing, setIsPwaClearing] = useState(false);


  const handleWipeDatabase = async () => {
    try {
      // Safely wipe database using Dexie safeReset() to ensure all tables are completely cleared
      await db.safeReset();
      
      // Clear PIN and all auth credentials
      AuthService.resetDevice();
      secureStorage.clear();
      
      logger.info('System', 'Local database hard reset applied.');
      setIsResetConfirmOpen(false);
      window.location.reload();
    } catch (e: any) {
      logger.error('System', 'Wipe failed', e);
      alert(`Gagal mereset data lokal: ${e?.message || String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Pengaturan Sistem Kolektor</h2>
      
      {/* PROFILE & KPI SETUP */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Profil Kolektor & Target KPI Pemulihan</span>
        </h3>
        <p className="text-xs text-slate-500">
          Ubah nama kolektor, kantor cabang bertugas, serta tentukan target pemulihan (KPI) bulanan dan harian secara manual untuk pelacakan performa.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Nama Lengkap Collector
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={collectorName}
                onChange={(e) => {
                  setCollectorName(e.target.value);
                  setSaveSuccess(false);
                }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                placeholder="Nama Lengkap Collector"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Kantor Cabang
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Building className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={collectorBranch}
                onChange={(e) => {
                  setCollectorBranch(e.target.value);
                  setSaveSuccess(false);
                }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                placeholder="Kantor Cabang (misal: KCP Fatmawati)"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Target Pemulihan Bulanan (Rp)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                Rp
              </span>
              <input
                type="number"
                value={monthlyTarget}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonthlyTarget(val);
                  setSaveSuccess(false);
                  const parsed = parseInt(val) || 0;
                  setDailyTarget(String(Math.round(parsed / 22)));
                }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                placeholder="Target Bulanan (misal: 50000000)"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <span>Target Pemulihan Harian (Rp)</span>
              <span className="text-[10px] text-amber-500 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">Manual</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                Rp
              </span>
              <input
                type="number"
                value={dailyTarget}
                onChange={(e) => {
                  setDailyTarget(e.target.value);
                  setSaveSuccess(false);
                }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                placeholder="Target Harian (misal: 2272727)"
              />
            </div>
          </div>
        </div>

        {saveSuccess && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-1.5 animate-fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>Perubahan profil dan Target KPI Pemulihan berhasil disimpan!</span>
          </div>
        )}

        <button
          onClick={async () => {
            if (!collectorName.trim() || !collectorBranch.trim()) return;
            setIsSaving(true);
            try {
              const parsedMonthly = parseInt(monthlyTarget) || 0;
              const parsedDaily = parseInt(dailyTarget) || 0;
              await updateActiveCollector(collectorName.trim(), collectorBranch.trim(), parsedMonthly, parsedDaily);
              setSaveSuccess(true);
            } catch (err) {
              logger.error('Settings', 'Failed to update collector profile/KPI', err);
            } finally {
              setIsSaving(false);
            }
          }}
          disabled={isSaving || !collectorName.trim() || !collectorBranch.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <span>Simpan Profil & Target KPI</span>
          )}
        </button>
      </ReusableCard>

      {/* THEME SELECTOR */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {theme === 'dark' ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
          <span>Tema Aplikasi (Theme Mode)</span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setTheme('light')}
            className={`p-3 text-sm font-bold border rounded-lg transition-all flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'}`}
          >
            <Sun className="w-4 h-4" /> Light Mode
          </button>
          <button 
            onClick={() => setTheme('dark')}
            className={`p-3 text-sm font-bold border rounded-lg transition-all flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'}`}
          >
            <Moon className="w-4 h-4" /> Dark Mode
          </button>
        </div>
      </ReusableCard>

      {/* LANGUAGE SELECTION */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Languages className="w-4 h-4 text-blue-500" />
          <span>Bahasa Aplikasi (Language)</span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setLanguage('id')}
            className={`p-3 text-sm font-bold border rounded-lg transition-all ${language === 'id' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'}`}
          >
            Bahasa Indonesia
          </button>
          <button 
            onClick={() => setLanguage('en')}
            className={`p-3 text-sm font-bold border rounded-lg transition-all ${language === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'}`}
          >
            English (US)
          </button>
        </div>
      </ReusableCard>

      {/* USER PREFERENCES */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Preferensi Operasional</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div className="space-y-0.5 pr-4">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" /> Notifikasi Kunjungan
              </span>
              <p className="text-xs text-slate-400">Kirim pengingat rute debitur jatuh tempo setiap pagi</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              checked={notificationPreference}
              onChange={(e) => setNotificationPreference(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer select-none border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="space-y-0.5 pr-4">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-slate-500" /> Paksa Mode Offline
              </span>
              <p className="text-xs text-slate-400">Gunakan database lokal meskipun koneksi internet tersedia</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              checked={offlinePreference}
              onChange={(e) => setOfflinePreference(e.target.checked)}
            />
          </label>
        </div>
      </ReusableCard>

      {/* SUPABASE CONNECTION SETTINGS & PWA REFRESH */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Konektivitas Supabase Cloud</span>
        </h3>
        
        <p className="text-xs text-slate-500 leading-relaxed">
          PWA (Progressive Web App) menyimpan aset di HP Anda. Jika Anda baru mengubah Environment Variables di Vercel, HP Anda membutuhkan pembaruan manual agar terhubung. Gunakan opsi di bawah untuk memaksa koneksi atau memasukkan URL/Key Supabase secara langsung ke HP ini.
        </p>

        {/* Current Connection Status */}
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Cloud className={`w-5 h-5 ${isSupabaseConfigured() ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isSupabaseConfigured() ? 'Status: Terhubung ke Supabase' : 'Status: Mode Offline / Luring Lokal'}
              </span>
              <span className="text-[10px] text-slate-400">
                {localStorage.getItem('supabase_url_override') ? 'Menggunakan Key Manual di HP' : 'Menggunakan Environment Variables (Vercel)'}
              </span>
            </div>
          </div>
          {isSupabaseConfigured() && (
            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
              Online
            </span>
          )}
        </div>

        {/* Credentials Form */}
        <div className="space-y-3.5 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-slate-400" />
              <span>Supabase URL Manual</span>
            </label>
            <input
              type="text"
              value={supabaseUrlInput}
              onChange={(e) => {
                setSupabaseUrlInput(e.target.value);
                setConnectionTestMsg({ type: null, text: '' });
              }}
              placeholder="https://your-project.supabase.co"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>Supabase Anon Key Manual</span>
            </label>
            <input
              type="password"
              value={supabaseAnonKeyInput}
              onChange={(e) => {
                setSupabaseAnonKeyInput(e.target.value);
                setConnectionTestMsg({ type: null, text: '' });
              }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-mono text-xs"
            />
          </div>
        </div>

        {/* Test Connection result */}
        {connectionTestMsg.text && (
          <div className={`text-xs p-3 rounded-xl border flex items-start gap-2 animate-fade-in ${connectionTestMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 border-red-100 text-red-700 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400'}`}>
            {connectionTestMsg.type === 'success' ? <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
            <span>{connectionTestMsg.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={async () => {
              setIsTestingConnection(true);
              setConnectionTestMsg({ type: null, text: '' });
              try {
                // Update configurations
                updateSupabaseConfig(supabaseUrlInput, supabaseAnonKeyInput);
                
                // Test connectivity by executing sync
                const success = await triggerSync();
                if (success) {
                  setConnectionTestMsg({
                    type: 'success',
                    text: 'Koneksi berhasil! Seluruh data nasabah, kunjungan, dan transaksi berhasil tersinkronisasi ke Supabase Cloud.'
                  });
                } else {
                  throw new Error('Sinkronisasi gagal. Pastikan URL dan Anon Key valid dan koneksi internet stabil.');
                }
              } catch (err: any) {
                setConnectionTestMsg({
                  type: 'error',
                  text: err?.message || 'Gagal terhubung ke Supabase. Periksa kembali kecocokan URL dan Anon Key.'
                });
              } finally {
                setIsTestingConnection(false);
              }
            }}
            disabled={isTestingConnection || !supabaseUrlInput.trim() || !supabaseAnonKeyInput.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-bold py-3 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menghubungkan...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 font-bold" />
                <span>Simpan & Sinkron</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setSupabaseUrlInput('');
              setSupabaseAnonKeyInput('');
              updateSupabaseConfig('', '');
              setConnectionTestMsg({
                type: 'success',
                text: 'Konfigurasi manual dihapus. Sistem beralih menggunakan Environment Variables bawaan.'
              });
            }}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold py-3 px-3 rounded-xl text-xs transition-colors flex items-center justify-center cursor-pointer"
          >
            Hapus Konfigurasi
          </button>
        </div>

        {/* Force PWA Service Worker Update */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3">
          <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
            *Jika data masih belum muncul setelah memasukkan kredensial, tekan tombol di bawah untuk membersihkan cache PWA di HP Anda dan memuat ulang kode aplikasi terbaru dari Vercel:
          </p>
          <button
            onClick={async () => {
              setIsPwaClearing(true);
              try {
                // Unregister all service workers
                if ('serviceWorker' in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  for (const r of registrations) {
                    await r.unregister();
                  }
                }
                // Clear Cache storage
                if ('caches' in window) {
                  const cacheKeys = await caches.keys();
                  for (const key of cacheKeys) {
                    await caches.delete(key);
                  }
                }
                logger.info('System', 'PWA cache and Service Workers cleared for forced reload.');
                // Reload page fully from server
                window.location.reload();
              } catch (e) {
                logger.error('System', 'Failed to clear PWA cache', e);
                window.location.reload();
              } finally {
                setIsPwaClearing(false);
              }
            }}
            disabled={isPwaClearing}
            className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isPwaClearing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Bersihkan Cache PWA & Muat Ulang</span>
          </button>
        </div>
      </ReusableCard>

      {/* COLLECTION INTELLIGENCE ENGINE */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-blue-600" />
          <span>Kecerdasan Koleksi (Intelligence Engine)</span>
        </h3>
        <p className="text-xs text-slate-500">
          Kelola sistem aturan bisnis, analisis prioritas harian, peringatan operasional, dan lakukan stress test performa mesin secara luring.
        </p>
        <button 
          onClick={() => {
            window.location.hash = '#/intel';
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
        >
          <BrainCircuit className="w-4 h-4" /> Buka Intelligence Engine
        </button>
      </ReusableCard>

      {/* AUDIT LOG LINK */}
      <ReusableCard className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <span>Log Aktivitas Kolektor (Logs)</span>
        </h3>
        <p className="text-xs text-slate-500">
          Lihat jejak aktivitas operasional, penanda koordinat GPS, dan log kegagalan transmisi untuk pemecahan masalah di lapangan.
        </p>
        <button 
          onClick={() => {
            window.location.hash = '#/logs';
          }}
          className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-850 dark:text-slate-200 font-bold py-3 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          Buka Log Audit Sistem
        </button>
      </ReusableCard>

      {/* LOGOUT BUTTON */}
      <ReusableCard className="p-0 overflow-hidden border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all active:scale-98"
        >
          <LogOut className="w-4 h-4" /> Keluar Sesi Kolektor
        </button>
      </ReusableCard>

      {/* HARD SYSTEM WIPE BUTTON */}
      <ReusableCard className="space-y-4 border-red-200 dark:border-red-900/50">
        <h3 className="text-sm font-bold text-red-600">Keamanan & Penghapusan Data</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Menghapus seluruh database IndexedDB lokal, token sesi, riwayat audit logs, dan data debitur secara total. Data yang belum tersinkronisasi akan hilang permanen. Hanya lakukan ini untuk keperluan penyetelan ulang.
        </p>
        <button 
          onClick={() => setIsResetConfirmOpen(true)}
          className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/40 text-red-600 font-bold py-3 px-4 border border-red-200 dark:border-red-900/40 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" /> Reset Semua Data Lokal
        </button>
      </ReusableCard>

      {/* CONFIRMATION DIALOG */}
      <ConfirmationDialog 
        isOpen={isResetConfirmOpen}
        title="Konfirmasi Hard Reset"
        message="Apakah Anda yakin ingin menghapus seluruh data debitur, log audit, and antrean sinkronisasi di HP ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus Permanen"
        cancelLabel="Batal"
        onConfirm={handleWipeDatabase}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};

export default SettingsScreen;
