import React, { useEffect, useState, useRef } from 'react';
import { 
  Terminal, 
  Trash2, 
  RefreshCw,
  Search
} from 'lucide-react';
import { logger } from '../../core/logger';
import { db } from '../../core/database';
import { LogEntry } from '../../types';
import { ReusableCard, EmptyWidget } from '../../shared/components/BaseComponents';

export const LogsScreen: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = async () => {
    try {
      const allLogs = await db.logs.orderBy('timestamp').reverse().toArray();
      setLogs(allLogs);
    } catch (e) {
      console.error('Failed to load logs', e);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleClearLogs = async () => {
    await logger.clearLogs();
    fetchLogs();
  };

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.context.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Log Audit Sistem (Diagnostics)</h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchLogs}
            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            title="Refresh Logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={handleClearLogs}
            className="p-2 bg-red-50 dark:bg-red-950/20 rounded-lg text-red-600 hover:bg-red-100"
            title="Clear Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="grid grid-cols-3 gap-2">
        {['ALL', 'INFO', 'WARN', 'ERROR'].map(level => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            className={`py-2 text-xs font-bold border rounded-lg transition-colors ${
              filterLevel === level 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      {/* SEARCH LOGS */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Cari pesan log..."
          className="w-full pl-9 pr-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 dark:bg-slate-900 rounded-lg outline-none focus:border-blue-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* TERMINAL CONSOLE */}
      <ReusableCard className="p-0 overflow-hidden border border-slate-950 bg-slate-950 text-slate-50 dark:border-slate-800">
        <div className="bg-slate-900 px-4 py-2 border-b border-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Live Terminal Logs</span>
        </div>

        <div className="h-96 overflow-y-auto p-4 font-mono text-[10px] space-y-2.5 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-500">No log entries found. Try changing filters.</div>
          ) : (
            filteredLogs.map((log) => {
              const colorMap = {
                INFO: 'text-blue-400',
                WARN: 'text-amber-400',
                ERROR: 'text-red-400',
                DEBUG: 'text-slate-400',
              };
              return (
                <div key={log.id} className="border-b border-slate-900 pb-2 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>[{new Date(log.timestamp).toLocaleTimeString()}] [{log.context}]</span>
                    <span className={`font-bold ${colorMap[log.level]}`}>{log.level}</span>
                  </div>
                  <div className="text-slate-200 break-all">{log.message}</div>
                  {log.error && (
                    <pre className="text-red-400/95 bg-red-950/20 p-2 rounded border border-red-950 mt-1 max-w-full overflow-x-auto whitespace-pre-wrap">
                      {log.error}
                    </pre>
                  )}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </ReusableCard>
    </div>
  );
};

export default LogsScreen;
