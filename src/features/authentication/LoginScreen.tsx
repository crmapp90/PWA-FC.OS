import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Wifi, WifiOff, Loader2, Settings2, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../core/store';
import { AuthService } from '../../core/auth_service';
import { db, seedDatabaseIfEmpty } from '../../core/database';
import { logger } from '../../core/logger';

type Mode = 'pin_entry' | 'first_setup' | 'setup_confirm';

export const LoginScreen: React.FC = () => {
  const { setActiveCollector, isOnline } = useStore();
  const [mode, setMode] = useState<Mode>(AuthService.hasPIN() ? 'pin_entry' : 'first_setup');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [collectorName, setCollectorName] = useState('');
  const [collectorTarget, setCollectorTarget] = useState('50000000');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSetupDetails, setShowSetupDetails] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Lockout countdown
  useEffect(() => {
    const remaining = AuthService.getRemainingLockout();
    if (remaining > 0) {
      setLockoutSeconds(remaining);
      const timer = setInterval(() => {
        const r = AuthService.getRemainingLockout();
        setLockoutSeconds(r);
        if (r <= 0) clearInterval(timer);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, []);

  const addDigit = (d: string) => {
    if (lockoutSeconds > 0) return;
    const current = mode === 'setup_confirm' ? confirmPin : pin;
    if (current.length >= 6) return;
    const next = current + d;
    if (mode === 'setup_confirm') setConfirmPin(next);
    else setPin(next);
    setError('');
  };

  const removeDigit = () => {
    if (mode === 'setup_confirm') setConfirmPin(p => p.slice(0, -1));
    else setPin(p => p.slice(0, -1));
    setError('');
  };

  const clearAll = () => { setPin(''); setConfirmPin(''); setError(''); };

  // Auto-submit when PIN reaches required length
  useEffect(() => {
    if (mode === 'pin_entry' && pin.length === 6) handlePinLogin();
    if (mode === 'first_setup' && pin.length === 6) setMode('setup_confirm');
    if (mode === 'setup_confirm' && confirmPin.length === 6) handleSetupConfirm();
  }, [pin, confirmPin]);

  const handlePinLogin = async () => {
    if (pin.length < 4) return;
    setIsLoading(true);
    setError('');
    try {
      const collectorId = await AuthService.verifyPIN(pin);
      if (collectorId) {
        const collector = await db.collectors.get(collectorId);
        if (collector) {
          collector.lastLoginAt = new Date().toISOString();
          await db.collectors.put(collector);
          logger.info('Login', `Success: ${collector.fullName}`);
          setActiveCollector(collector);
        }
      } else {
        setError('PIN salah. Coba lagi.');
        setPin('');
      }
    } catch (err: any) {
      setError(err.message || 'Verifikasi gagal.');
      setPin('');
      const remaining = AuthService.getRemainingLockout();
      if (remaining > 0) setLockoutSeconds(remaining);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupConfirm = async () => {
    if (pin !== confirmPin) {
      setError('PIN tidak cocok. Ulangi dari awal.');
      setPin(''); setConfirmPin(''); setMode('first_setup');
      return;
    }
    if (!collectorName.trim()) {
      setError('Nama collector wajib diisi sebelum menyimpan PIN.');
      setPin(''); setConfirmPin(''); setMode('first_setup');
      return;
    }
    setIsLoading(true);
    try {
      await seedDatabaseIfEmpty();
      // Update or create collector with user-provided data
      let collector = await db.collectors.toCollection().first();
      if (!collector) {
        collector = {
          id: `COL-${Math.floor(1000 + Math.random() * 9000)}`,
          username: collectorName.toLowerCase().replace(/\s+/g, '_'),
          fullName: collectorName.trim(),
          region: 'Jakarta',
          branch: 'Kantor Pusat',
          targetAmount: parseInt(collectorTarget) || 50000000,
          collectedAmount: 0,
          lastLoginAt: new Date().toISOString(),
        };
        await db.collectors.add(collector);
      } else {
        collector.fullName = collectorName.trim();
        collector.targetAmount = parseInt(collectorTarget) || 50000000;
        await db.collectors.put(collector);
      }
      await AuthService.setupPIN(pin, collector.id);
      logger.info('Setup', `PIN configured for collector: ${collector.fullName}`);
      setActiveCollector(collector);
    } catch (err: any) {
      setError(err.message || 'Setup gagal.');
      setPin(''); setConfirmPin(''); setMode('first_setup');
    } finally {
      setIsLoading(false);
    }
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const currentPin = mode === 'setup_confirm' ? confirmPin : pin;

  const titleMap = {
    pin_entry: 'Masukkan PIN',
    first_setup: 'Buat PIN Baru',
    setup_confirm: 'Konfirmasi PIN',
  };
  const subtitleMap = {
    pin_entry: 'Masukkan 6-digit PIN untuk masuk',
    first_setup: 'Setup pertama kali — tentukan PIN 6 digit Anda',
    setup_confirm: 'Ketik ulang PIN yang sama untuk konfirmasi',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 overflow-y-auto select-none transition-colors duration-150 pb-safe">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/55 p-6 sm:p-8 rounded-3xl shadow-xl dark:shadow-slate-950/40 flex flex-col items-center animate-scale-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <div className="text-slate-900 dark:text-white font-black text-xl tracking-widest uppercase font-mono">FC.OS</div>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] tracking-widest uppercase mt-1 text-center font-bold">Field Collection Operating System</div>
          <div className="mt-2.5">
            {isOnline
              ? <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-1 rounded-full font-bold flex items-center gap-1.5"><Wifi className="w-3 h-3"/>ONLINE</span>
              : <span className="text-[10px] bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30 px-3 py-1 rounded-full font-bold flex items-center gap-1.5"><WifiOff className="w-3 h-3"/>OFFLINE</span>
            }
          </div>
        </div>

        {/* Setup: collector info */}
        {mode === 'first_setup' && (
          <div className="w-full max-w-xs mb-5 space-y-3 animate-scale-up">
            <div>
              <label className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Nama Anda</label>
              <input
                type="text"
                value={collectorName}
                onChange={e => setCollectorName(e.target.value)}
                placeholder="Nama lengkap collector"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-950 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-500 text-sm font-medium border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={() => setShowSetupDetails(!showSetupDetails)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5"/> {showSetupDetails ? 'Sembunyikan Target' : 'Atur Target Harian'}
            </button>
            {showSetupDetails && (
              <div className="animate-scale-up">
                <label className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Target Harian (Rp)</label>
                <input
                  type="number"
                  value={collectorTarget}
                  onChange={e => setCollectorTarget(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-950 dark:text-slate-50 text-sm font-medium border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-5">
          <div className="text-slate-900 dark:text-white font-extrabold text-base tracking-tight">{titleMap[mode]}</div>
          <div className="text-slate-500 dark:text-slate-400 text-xs mt-1">{subtitleMap[mode]}</div>
        </div>

        {/* PIN dots */}
        <div className="flex gap-4 mb-5">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${i < currentPin.length ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500 scale-110 shadow-sm shadow-blue-500/20' : 'border-slate-300 dark:border-slate-700'}`} />
          ))}
        </div>

        {/* Error */}
        <div className="h-8 flex items-center mb-2">
          {error && <div className="text-red-600 dark:text-red-400 text-xs font-semibold text-center px-4">{error}</div>}
          {lockoutSeconds > 0 && !error && (
            <div className="text-amber-600 dark:text-amber-400 text-xs font-semibold text-center">Terkunci — coba lagi dalam {lockoutSeconds}s</div>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[240px] mx-auto">
          {digits.map((d, i) => {
            if (d === '') return <div key={i} />;
            return (
              <button
                key={i}
                onClick={() => d === '⌫' ? removeDigit() : addDigit(d)}
                disabled={isLoading || lockoutSeconds > 0}
                className={`w-14 h-14 rounded-full text-lg font-bold transition-all flex items-center justify-center mx-auto
                  ${d === '⌫' 
                    ? 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 active:scale-95' 
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-blue-600 active:text-white dark:active:bg-blue-600 dark:active:text-white active:scale-95 border border-slate-200/50 dark:border-slate-800/10 shadow-sm'
                  }
                  disabled:opacity-40`}
              >
                {isLoading && d === '0' ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : d}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 text-slate-400 dark:text-slate-500 text-[10px] text-center font-medium">
          PIN dienkripsi dengan WebCrypto SHA-256 · Data tersimpan lokal
        </div>
      </div>
    </div>
  );
};
