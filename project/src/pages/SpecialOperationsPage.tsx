import { useState } from 'react';
import { useAdminAccess, canAccess } from '@/lib/adminAccess';
import { supabase } from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Search, ArrowRightLeft, Loader2, User } from 'lucide-react';

type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  wallets: { id: string; currency: string; monime_account_id: string | null }[];
};

export function SpecialOperationsPage() {
  const access = useAdminAccess();
  const allowed = canAccess(access, 'financials');
  
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    
    setLoading(true);
    setError('');
    setUsers([]);
    setSelectedUser(null);
    setSuccessMsg('');
    
    try {
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select(`
          id, full_name, email, phone, role,
          wallets (id, currency, monime_account_id)
        `)
        .or(`email.ilike.%${search}%,phone.ilike.%${search}%,full_name.ilike.%${search}%`)
        .limit(10);
        
      if (dbError) throw dbError;
      setUsers(data as UserProfile[]);
      if (data.length === 0) setError('No users found matching your search.');
    } catch (err: any) {
      setError(err.message || 'Failed to search users.');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setTransferring(true);
    setError('');
    setSuccessMsg('');
    
    try {
      const sleWallet = selectedUser.wallets.find(w => w.currency === 'SLE');
      if (!sleWallet || !sleWallet.monime_account_id) {
        throw new Error('User does not have an active SLE Monime account linked.');
      }
      
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) throw new Error('Enter a valid positive amount.');
      if (reason.trim().length < 5) throw new Error('Provide a detailed reason for this internal transfer.');

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated.');

      const res = await fetch('/api/create-monime-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`
        },
        body: JSON.stringify({
          amount: numAmount * 100, 
          destinationId: sleWallet.monime_account_id,
          description: `Admin Refund/Transfer: ${reason.trim()}`
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'The transfer failed to process. Check platform balance.');
      }

      setSuccessMsg(`Successfully transferred ${numAmount} SLE to ${selectedUser.full_name || selectedUser.phone}.`);
      setAmount('');
      setReason('');
      setSelectedUser(null);
      setUsers([]);
    } catch (err: any) {
      setError(err.message || 'An error occurred during transfer.');
    } finally {
      setTransferring(false);
    }
  };

  if (!allowed) {
    return <AdminLayout title="Special Operations"><p className="p-6 text-red-600">Access denied.</p></AdminLayout>;
  }

  return (
    <AdminLayout 
      title="Special Operations" 
      subtitle="Admin internal transfers and instant customer refunds"
    >
      <div className="max-w-4xl space-y-6 mt-6">
        
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Search size={20} className="text-indigo-600"/> Find User
          </h2>
          <form onSubmit={handleSearch} className="flex gap-3">
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              type="submit" 
              disabled={loading}
              className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Search'}
            </button>
          </form>
        </section>

        {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl">{error}</div>}
        {successMsg && <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">{successMsg}</div>}

        {users.length > 0 && !selectedUser && (
          <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-3 px-2">Select a user to transfer funds:</h3>
            <div className="space-y-2">
              {users.map(user => (
                <button 
                  key={user.id} 
                  onClick={() => setSelectedUser(user)}
                  className="w-full text-left p-4 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl transition flex items-center justify-between group"
                >
                  <div>
                    <p className="font-bold text-slate-900 flex items-center gap-2">
                      <User size={16} className="text-slate-400"/>
                      {user.full_name || 'No Name'} <span className="text-xs bg-slate-100 px-2 py-1 rounded-full">{user.role}</span>
                    </p>
                    <p className="text-sm text-slate-500 mt-1">{user.email || 'No email'} · {user.phone || 'No phone'}</p>
                  </div>
                  <ArrowRightLeft className="text-slate-300 group-hover:text-indigo-600" />
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedUser && (
          <section className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold">Transfer to {selectedUser.full_name || selectedUser.phone}</h3>
                <p className="text-sm text-slate-500">{selectedUser.email} · {selectedUser.role}</p>
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                className="text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                Change User
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Transfer Amount (SLE)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0.1"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 50.00"
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Reason / Description</label>
                <input 
                  type="text" 
                  required
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Refund for cancelled trip #1024"
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-500 mt-1">This will be recorded in the gateway transaction logs.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={transferring}
                  className="flex-1 bg-indigo-600 text-white font-bold p-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {transferring ? <Loader2 className="animate-spin" size={20} /> : <ArrowRightLeft size={20} />}
                  {transferring ? 'Processing Transfer...' : 'Execute Internal Transfer'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}