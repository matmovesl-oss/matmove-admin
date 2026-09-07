import { Search, Bell, Activity, ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';

export function LogsPage() {
  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-y-auto">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System & Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time audit trail and fraud monitoring</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search records..." className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none w-64" />
          </div>
          <button className="relative p-2 text-slate-400 hover:text-slate-600 transition">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full border border-white"></span>
          </button>
        </div>
      </header>

      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Risk Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Audit Events</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">7</div>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Activity size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">High Risk</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">2</div>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg"><ShieldAlert size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Medium Risk</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">2</div>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><AlertTriangle size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Low Risk</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">2</div>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><ShieldCheck size={20} /></div>
          </div>
        </div>

        {/* Logs and Alerts Columns */}
        <div className="grid grid-cols-2 gap-6 items-start">
          
          {/* Audit Trail */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Activity size={16} className="text-slate-400"/> Audit Trail</h3>
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live</div>
            </div>
            <div className="p-2 overflow-y-auto flex-1">
              {[
                { user: 'Hawa Bangura', action: 'UPDATE', target: 'wallets', payload: '{"field":"is_active","value":false}', time: '7m ago' },
                { user: 'System', action: 'INSERT', target: 'fraud_logs', payload: '{"activity_type":"multiple_accounts","risk":"high"}', time: '14m ago' },
                { user: 'Hawa Bangura', action: 'UPDATE', target: 'profiles', payload: '{"kyc_status","value":"approved"}', time: '27m ago' },
                { user: 'System', action: 'INSERT', target: 'withdrawal_requests', payload: '{"amount":5000,"provider":"vult"}', time: '42m ago' },
                { user: 'Sankoh Abdul', action: 'LOGIN', target: 'auth', payload: '{"ip":"102.22.45.11"}', time: '1h ago' },
                { user: 'Hawa Bangura', action: 'DELETE', target: 'wallet_transactions', payload: '{"id":"t9"}', time: '1h ago' },
                { user: 'System', action: 'INSERT', target: 'fraud_logs', payload: '{"activity_type":"unusual_payout","risk":"medium"}', time: '1h ago' }
              ].map((log, i) => (
                <div key={i} className="flex gap-4 p-4 hover:bg-slate-50 rounded-xl transition border-b border-slate-50 last:border-0">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0"></div>
                  <div className="flex-1 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="text-slate-700">
                        <span className="font-bold text-slate-900">{log.user}</span> <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mx-1">{log.action}</span> on <span className="font-mono text-indigo-600 text-xs">{log.target}</span>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{log.time}</span>
                    </div>
                    <div className="mt-1.5 text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded-lg overflow-x-auto">
                      {log.payload}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fraud Activity */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><ShieldAlert size={16} className="text-amber-500"/> Fraud Activity</h3>
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live</div>
            </div>
            <div className="p-2 overflow-y-auto flex-1">
              {[
                { user: 'Ibrahim Koroma', risk: 'High Risk', riskColor: 'bg-red-50 text-red-600', title: 'Multiple accounts detected', desc: 'Same device fingerprint registered to 3 wallets.', date: '04 Sept, 18:03' },
                { user: 'Sankoh Abdul', risk: 'High Risk', riskColor: 'bg-red-50 text-red-600', title: 'Duplicate vult reference', desc: 'Withdrawal request reused a prior vult_reference.', date: '04 Sept, 17:41' },
                { user: 'Mohamed Sesay', risk: 'Medium Risk', riskColor: 'bg-amber-50 text-amber-600', title: 'Unusual payout volume', desc: '3 payout requests within 24h, above 90th percentile.', date: '04 Sept, 17:01' },
                { user: 'Aisha Kamara', risk: 'Medium Risk', riskColor: 'bg-amber-50 text-amber-600', title: 'Rapid top-ups', desc: '5 wallet credits in 10 minutes.', date: '04 Sept, 16:36' },
                { user: 'Fatmata Conteh', risk: 'Low Risk', riskColor: 'bg-slate-100 text-slate-600', title: 'Location mismatch', desc: 'Login from new city; no other anomalies.', date: '04 Sept, 16:01' },
                { user: 'Hawa Bangura', risk: 'Low Risk', riskColor: 'bg-slate-100 text-slate-600', title: 'Failed authentication', desc: '3 consecutive incorrect password attempts.', date: '04 Sept, 15:45' }
              ].map((f, i) => (
                <div key={i} className="flex gap-4 p-4 hover:bg-slate-50 rounded-xl transition border-b border-slate-50 last:border-0">
                  <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${f.risk === 'High Risk' ? 'bg-red-500' : f.risk === 'Medium Risk' ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{f.user}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.riskColor}`}>{f.risk}</span>
                      </div>
                      <span className="text-xs text-slate-400">{f.date}</span>
                    </div>
                    <div className="text-sm text-slate-700 font-medium">{f.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}