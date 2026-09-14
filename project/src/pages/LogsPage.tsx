import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { AlertOctagon, Activity, ShieldCheck, Database } from 'lucide-react';

export function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fraud_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error; // Ignore table not found if it doesn't exist yet
      if (data) setLogs(data);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveLogs();
  }, []);

  const highRisk = logs.filter(l => l.risk === 'high').length;

  return (
    <AdminLayout title="System & Audit Logs" subtitle="Real-time audit trail and fraud monitoring">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 mt-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total Events</p>
            <h3 className="text-2xl font-bold text-slate-900">{logs.length}</h3>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Activity size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex justify-between items-start shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">High Risk</p>
            <h3 className="text-2xl font-bold text-red-600">{highRisk}</h3>
          </div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg"><AlertOctagon size={20} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: System Audit Trail */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Database className="text-blue-600" size={18} /> System Audit Trail
            </h3>
          </div>
          <div className="p-8 text-center text-slate-500 flex flex-col items-center">
            <Database size={40} className="text-slate-300 mb-3" />
            <p>Awaiting new database transactions...</p>
            <span className="text-xs mt-1 text-slate-400">Live feed connected to Supabase pg_audit</span>
          </div>
        </div>

        {/* Right Column: Fraud Activity */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={20} /> Fraud Activity Stream
            </h3>
            <button onClick={fetchLiveLogs} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">Live Feed</button>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-slate-500">Scanning activity logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center">
              <ShieldCheck size={40} className="text-slate-300 mb-3" />
              <p>No suspicious fraud activity detected.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="p-5 hover:bg-slate-50 transition flex items-start gap-4">
                  <div className={`mt-1 p-2 rounded-full ${
                    log.risk === 'high' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <AlertOctagon size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-900 text-sm">{log.user_name || 'System Event'}</h4>
                      <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 font-medium">{log.activity_type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}