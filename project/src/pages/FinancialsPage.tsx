import { Search, Bell, Wallet, TrendingUp, Snowflake, Lock, Unlock } from 'lucide-react';

export function FinancialsPage() {
  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-y-auto">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial & Wallet Ledger</h1>
          <p className="text-sm text-slate-500 mt-1">System-wide balances, transactions, and wallet controls</p>
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

      {/* Main Content */}
      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Total System Balance</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">91,270.00 SLE</div>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Wallet size={20} /></div>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Active Wallets</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">4</div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={20} /></div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-start">
            <div>
              <span className="text-slate-500 text-sm font-medium">Frozen Wallets</span>
              <div className="text-3xl font-bold text-slate-900 mt-2">2</div>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Snowflake size={20} /></div>
          </div>
        </div>

        {/* Data Tables */}
        <div className="grid grid-cols-2 gap-6 items-start">
          
          {/* User Wallets */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">User Wallets</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-semibold">Owner</th>
                    <th className="p-4 font-semibold">Balance</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[
                    { name: 'Aisha Kamara', id: 'w1', bal: '18,500.00 SLE', status: 'Active' },
                    { name: 'Mohamed Sesay', id: 'w2', bal: '7,250.00 SLE', status: 'Active' },
                    { name: 'Ibrahim Koroma', id: 'w4', bal: '64,000.00 SLE', status: 'Frozen' }
                  ].map((w, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{w.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{w.id}</div>
                      </td>
                      <td className="p-4 font-bold text-slate-700">{w.bal}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${w.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {w.status === 'Active' ? (
                          <button className="flex items-center gap-1.5 ml-auto text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 transition">
                            <Lock size={14} /> Freeze
                          </button>
                        ) : (
                          <button className="flex items-center gap-1.5 ml-auto text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 transition">
                            <Unlock size={14} /> Unfreeze
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Global Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Global Ledger</h3>
              <div className="flex gap-2">
                {['All', 'Completed', 'Pending', 'Failed'].map(f => (
                  <button key={f} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${f === 'All' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
               <div className="text-center p-10 text-slate-400 text-sm font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Ledger transaction list mapped here...
               </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}