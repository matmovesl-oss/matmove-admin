import { Search, Bell, Clock, CreditCard, CheckCircle2, XCircle } from 'lucide-react';

export function PayoutsPage() {
  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-y-auto">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payouts & Withdrawals</h1>
          <p className="text-sm text-slate-500 mt-1">Authorize or reject pending Vult payout requests</p>
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
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Pending Requests</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">3</div>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Pending Value</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">19,000.00 SLE</div>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><CreditCard size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Completed</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">1</div>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 size={20} /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Failed</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">1</div>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg"><XCircle size={20} /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                <th className="p-4 font-semibold">Requester</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold">Provider</th>
                <th className="p-4 font-semibold">Reference</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Submitted</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {[
                { name: 'Aisha Kamara', amt: '5,000.00 SLE', provider: 'vult', ref: 'VULT-7F3A-91', status: 'pending', time: '11m ago' },
                { name: 'Ibrahim Koroma', amt: '12,000.00 SLE', provider: 'vult', ref: 'VULT-2B8C-44', status: 'pending', time: '36m ago' },
                { name: 'Mohamed Sesay', amt: '2,000.00 SLE', provider: 'vult', ref: 'VULT-9D1E-07', status: 'pending', time: '56m ago' },
                { name: 'Sankoh Abdul', amt: '320.00 SLE', provider: 'vult', ref: 'VULT-5K2M-33', status: 'failed', time: '3h ago', error: 'Flagged for duplicate vult reference.' },
                { name: 'Fatmata Conteh', amt: '600.00 SLE', provider: 'vult', ref: 'VULT-1A7B-58', status: 'completed', time: '8h ago' }
              ].map((p, i) => (
                <tr key={i} className="hover:bg-slate-50 transition">
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{p.name}</div>
                    {p.error && <div className="text-xs text-red-500 mt-1 flex items-center gap-1"><XCircle size={12}/> {p.error}</div>}
                  </td>
                  <td className="p-4 font-bold text-slate-900">{p.amt}</td>
                  <td className="p-4"><span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-md font-bold uppercase">{p.provider}</span></td>
                  <td className="p-4 text-slate-500 font-mono text-xs">{p.ref}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                      p.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : p.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>{p.status}</span>
                  </td>
                  <td className="p-4 text-slate-500">{p.time}</td>
                  <td className="p-4 text-right">
                    {p.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <button className="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 transition">Authorize Payout</button>
                        <button className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition">Reject</button>
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}