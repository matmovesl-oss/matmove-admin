
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Database, ShieldCheck, RefreshCw } from 'lucide-react';

export function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const mounted = useRef(false), generation = useRef(0);
  const fetchLogs = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const {data,error} = await supabase.from('audit_logs').select('*').order('created_at',{ascending:false});
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Could not verify the audit response.');
      if (mounted.current && token === generation.current) setLogs(data);
    } catch (error: any) {
      if (mounted.current && token === generation.current) setLoadError(error.message || 'Could not load this section. Please retry.');
    } finally {
      if (mounted.current && token === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => { mounted.current = true; void fetchLogs(); return () => { mounted.current = false; generation.current++; }; }, [fetchLogs]);

  return (
    <AdminLayout title="System & Audit Logs" subtitle="Real-time security record of administrative actions">
      <div className="flex justify-end mt-4 mb-4">
        <button disabled={loading} onClick={fetchLogs} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Sync Audit Trail
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
        <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="text-blue-600" size={18} /> Admin Activity Stream
          </h3>
        </div>
        {loading ? <div className="p-12 text-center text-slate-500">Loading activity logs...</div> : loadError ? <p role="alert" className="p-6 text-red-800">{loadError}<button type="button" onClick={() => void fetchLogs()} className="ml-2 min-h-11 font-bold underline">Retry audit logs</button></p> : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center">
            <ShieldCheck size={40} className="text-slate-300 mb-3" />
            <p>No audit events recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {logs.map((log) => (
              <div key={log.id} className="p-5 hover:bg-slate-50 transition flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-blue-700 text-xs uppercase tracking-wider">{log.action}</h4>
                    <span className="text-xs text-slate-400 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="break-words whitespace-pre-wrap text-sm text-slate-700 mt-1 font-medium">{typeof log.details === 'string' ? log.details : log.details ? JSON.stringify(log.details) : 'Details not supplied'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
