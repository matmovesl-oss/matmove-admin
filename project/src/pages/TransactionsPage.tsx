import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Search, RefreshCw, Loader2, ArrowUpRight, ArrowDownLeft, Activity } from 'lucide-react';

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/get-user-transactions');
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const filteredTxns = transactions.filter(tx => {
    const matchSearch = !search.trim() || 
      tx.id?.toLowerCase().includes(search.toLowerCase()) ||
      tx.reference?.toLowerCase().includes(search.toLowerCase()) ||
      tx.financialAccount?.id?.toLowerCase().includes(search.toLowerCase());
    
    const matchType = filterType === 'all' || tx.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <AdminLayout title="Gateway Transactions" subtitle="Master audit trail of all Monime ledger movements across all wallets">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 mt-6">
        <div className="flex flex-1 gap-3 w-full max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search by Wallet ID (fac-...), Txn ID, or Reference..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none shadow-sm font-mono" />
          </div>
          <select value={filterType} onChange={(e: any) => setFilterType(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm cursor-pointer">
            <option value="all">All Movements</option>
            <option value="credit">Credits (+)</option>
            <option value="debit">Debits (-)</option>
          </select>
        </div>
        <button onClick={fetchTransactions} disabled={loading} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-sm font-bold shadow-sm">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh Ledger
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2 text-indigo-600" size={28} /> Fetching Gateway Ledger...</div>
        ) : filteredTxns.length === 0 ? (
          <div className="p-12 text-center text-slate-400"><Activity size={40} className="mx-auto mb-3 text-slate-300" /> No transactions found.</div>
        ) : (
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0 border-b border-slate-200">
                <tr><th className="px-6 py-4">Txn ID</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Wallet Account ID</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Reference</th><th className="px-6 py-4 text-right">Timestamp</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTxns.map((tx) => {
                  const amt = (tx.amount?.value || 0) / 100;
                  const isCredit = tx.type === 'credit';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{tx.id}</td>
                      <td className="px-6 py-4"><span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${isCredit ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{isCredit ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>} {tx.type}</span></td>
                      <td className="px-6 py-4 font-mono text-xs text-indigo-600 bg-indigo-50/50 px-2.5 py-1 rounded-lg w-fit border border-indigo-100">{tx.financialAccount?.id || '—'}</td>
                      <td className={`px-6 py-4 font-bold text-base ${isCredit ? 'text-emerald-600' : 'text-slate-900'}`}>{isCredit ? '+' : '-'} SLE {amt.toFixed(2)}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{tx.reference || 'N/A'}</td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500">{new Date(tx.timestamp).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}