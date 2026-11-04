import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, CreditCard, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

export function AdministrativePayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Administrative Payroll');
  const [showConfirm, setShowConfirm] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [payrollBalance, setPayrollBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');

  const refreshPayrollBalance = async () => {
    setBalanceLoading(true);
    setBalanceError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) throw new Error('Sign in again to view the Payroll Account.');
      
      const res = await fetch('/api/admin-pay-staff', {
        method: 'GET',
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      const d = await res.json();
      
      if (!res.ok) throw new Error(d.error || 'Payroll Account balance is unavailable.');
      
      // Relaxed check to safely handle both strings and integers from the Monime payload
      const balanceData = d.balance || {};
      const val = Number(balanceData.value);
      
      if (isNaN(val)) {
        throw new Error('Monime returned an invalid balance format.');
      }
      
      setPayrollBalance(`SLE ${(val / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } catch (err: any) {
      setPayrollBalance(null);
      setBalanceError(err.message || 'Balance could not be loaded.');
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, wallets(*)')
        .eq('role', 'staff')
        .order('full_name');
      if (error) throw error;
      setStaffList(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    void fetchStaff(); 
    void refreshPayrollBalance();
  }, [fetchStaff]);

  const filtered = staffList.filter(s => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return s.full_name?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term) || s.phone?.includes(term);
  });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(s => s.id));
  };

  const executePayroll = async () => {
    if (!amount || Number(amount) <= 0 || selectedIds.length === 0) return;
    setExecuting(true); setError(''); setSuccess(''); setProgress('');

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error('Session expired. Sign in again.');

      const staffToPay = staffList.filter(s => selectedIds.includes(s.id));
      let successes = 0, failures = 0;

      for (let i = 0; i < staffToPay.length; i++) {
        const staff = staffToPay[i];
        setProgress(`Paying ${i + 1}/${staffToPay.length}: ${staff.full_name || staff.phone}...`);
        
        try {
          const sleWallet = staff.wallets?.find((w: any) => w.currency === 'SLE');
          const destId = sleWallet?.monime_account_id || sleWallet?.metadata?.monime_account_id;
          if (!destId) throw new Error('No Wallet ID');

          const res = await fetch('/api/admin-pay-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
            body: JSON.stringify({
              amount: Number(amount),
              recipientAccountId: destId,
              reason: reason.trim(),
              requestKey: crypto.randomUUID()
            })
          });
          
          if (res.ok) successes++;
          else failures++;
        } catch { failures++; }
      }

      setSuccess(`Payroll complete: ${successes} transfers sent, ${failures} failed.`);
      setShowConfirm(false); setAmount(''); setSelectedIds([]);
      await refreshPayrollBalance();
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setExecuting(false); setProgress('');
    }
  };

  return (
    <AdminLayout title="Administrative Payroll" subtitle="Disburse bulk salaries and stipends securely to verified staff wallets.">
      <div className="max-w-6xl mt-6 space-y-6">
        {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">{error}</div>}
        {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-bold">{success}</div>}

        <div className="flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <Search size={18} className="text-slate-400" />
          <input type="text" placeholder="Search staff members..." value={search} onChange={e => setSearch(e.target.value)} className="w-full outline-none text-sm font-medium" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Table View */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            {loading ? <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" /> Loading Staff Database...</div> : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4 w-12 text-center">
                      <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded w-4 h-4 cursor-pointer text-emerald-600 focus:ring-emerald-600" />
                    </th>
                    <th className="p-4">Staff Member Profile</th>
                    <th className="p-4">Contact Info</th>
                    <th className="p-4">Wallet Ledger ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto">
                  {filtered.map(staff => (
                    <tr key={staff.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => toggleSelection(staff.id)}>
                      <td className="p-4 text-center"><input type="checkbox" checked={selectedIds.includes(staff.id)} readOnly className="rounded w-4 h-4 cursor-pointer text-emerald-600 focus:ring-emerald-600" /></td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900 text-sm">{staff.full_name || 'Staff User'}</div>
                        <div className="text-[10px] text-emerald-700 font-bold uppercase mt-1 bg-emerald-50 px-2 py-0.5 rounded-md inline-block">STAFF</div>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        {staff.email}<br/>
                        {staff.phone || staff.phone_number || 'No Phone'}
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-400">
                        {staff.wallets?.[0]?.monime_account_id || 'Wallet not verified'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Action Panel */}
          <div className="bg-slate-950 p-6 rounded-3xl text-white space-y-5 sticky top-6">
            <h3 className="font-bold flex items-center gap-2 text-emerald-400"><CreditCard size={18} /> Execute Payroll</h3>
            
            <div className="p-4 bg-white/10 rounded-2xl border border-white/5">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Live Payroll Balance</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-black text-emerald-400">
                  {balanceLoading ? 'Checking...' : payrollBalance || 'Unavailable'}
                </p>
                <button onClick={() => void refreshPayrollBalance()} disabled={balanceLoading} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition disabled:opacity-50">
                  <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {balanceError && <p className="text-xs text-rose-400 mt-2">{balanceError}</p>}
            </div>

            <div className="p-4 bg-white/10 rounded-2xl flex justify-between items-center border border-white/5">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Selected Staff</p>
              <p className="text-xl font-black">{selectedIds.length}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Base Amount Per Staff (SLE)</label>
              <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-lg font-bold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Internal Memo</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-between items-center font-bold">
              <span className="text-slate-300">Total Deduction:</span>
              <span className="text-emerald-400">SLE {(Number(amount || 0) * selectedIds.length).toLocaleString()}</span>
            </div>

            <button onClick={() => setShowConfirm(true)} disabled={selectedIds.length === 0 || !amount || Number(amount) <= 0 || balanceLoading || !payrollBalance} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50">
              Review Transfer
            </button>
          </div>
        </div>

        {showConfirm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white text-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-amber-600 mb-2"><AlertTriangle size={24} /><h3 className="font-bold text-base">Confirm Payroll</h3></div>
              <p className="text-sm leading-relaxed">
                You are about to transfer <b>SLE {Number(amount).toLocaleString()}</b> each to <b>{selectedIds.length} staff members</b> from the designated payroll account.
              </p>
              {progress && <p className="text-xs font-bold text-emerald-600 animate-pulse">{progress}</p>}
              <div className="flex gap-2 pt-4">
                <button disabled={executing} onClick={executePayroll} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-xs transition disabled:opacity-50">{executing ? 'Sending...' : 'Confirm & Disburse'}</button>
                <button disabled={executing} onClick={() => setShowConfirm(false)} className="px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}