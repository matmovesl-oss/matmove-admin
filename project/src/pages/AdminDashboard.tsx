import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  CheckCircle2, XCircle, Search, RefreshCw, FileText, 
  Eye, Truck, Store, User, MapPin, Calendar, CreditCard, ShieldCheck, ZoomIn, X 
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  phone_number?: string;
  role: 'rider' | 'driver' | 'vendor' | 'client';
  kyc_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  address?: string;
  city?: string;
  // Driver specifics
  vehicle_type?: string;
  plate_number?: string;
  driver_license_no?: string;
  // Merchant specifics
  business_name?: string;
  business_type?: string;
  tax_id?: string;
  // Uploaded document URLs
  id_card_url?: string;
  selfie_url?: string;
  license_doc_url?: string;
  business_doc_url?: string;
}

export function AdminDashboard() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    
    if (filter !== 'all') {
      query = query.eq('kyc_status', filter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setProfiles(data as UserProfile[]);
      if (data.length > 0 && !selectedUser) {
        setSelectedUser(data[0] as UserProfile);
      } else if (data.length === 0) {
        setSelectedUser(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, [filter]);

  const handleUpdateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('profiles')
      .update({ kyc_status: newStatus })
      .eq('id', userId);

    if (!error) {
      fetchProfiles();
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, kyc_status: newStatus } : null);
      }
    }
  };

  const filteredProfiles = profiles.filter(p => 
    (p.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (p.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (p.phone_number || '').includes(searchTerm)
  );

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-hidden">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KYC & Onboarding Verification</h1>
          <p className="text-sm text-slate-500 mt-1">Review applicant profiles, credentials, and identity documents before activation</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, email, phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none w-72" 
            />
          </div>
          <button 
            onClick={fetchProfiles} 
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="flex-1 p-8 grid grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left List Queue (4 columns) */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex gap-1">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    filter === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-slate-400">Total: {filteredProfiles.length}</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading applications...</div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No records found for this filter.</div>
            ) : (
              filteredProfiles.map((user) => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`p-4 cursor-pointer transition flex items-center justify-between ${
                    selectedUser?.id === user.id ? 'bg-indigo-50/60 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{user.full_name || 'Incomplete Profile'}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase block mb-1">
                      {user.role || 'Rider'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      user.kyc_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      user.kyc_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {user.kyc_status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Detailed Inspector Panel (8 columns) */}
        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-y-auto p-6">
          {selectedUser ? (
            <div className="space-y-6">
              
              {/* Header Action Bar */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-slate-900">{selectedUser.full_name || 'No Name Provided'}</h2>
                    <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase flex items-center gap-1">
                      {selectedUser.role === 'driver' && <Truck size={12} />}
                      {selectedUser.role === 'vendor' && <Store size={12} />}
                      {selectedUser.role === 'rider' && <User size={12} />}
                      {selectedUser.role || 'Rider'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{selectedUser.email} • ID: <span className="font-mono text-xs">{selectedUser.id}</span></p>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => handleUpdateStatus(selectedUser.id, 'rejected')}
                    className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-xl text-sm font-bold transition"
                  >
                    <XCircle size={16} /> Reject
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(selectedUser.id, 'approved')}
                    className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-5 py-2 rounded-xl text-sm font-bold shadow-md transition"
                  >
                    <CheckCircle2 size={16} /> Approve User
                  </button>
                </div>
              </div>

              {/* General Personal Details */}
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Personal & Contact Info</h3>
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">Phone Number</span>
                    <span className="text-sm font-bold text-slate-800">{selectedUser.phone_number || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">Address</span>
                    <span className="text-sm font-bold text-slate-800">{selectedUser.address || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">City / Location</span>
                    <span className="text-sm font-bold text-slate-800">{selectedUser.city || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Role-Specific Information */}
              {selectedUser.role === 'driver' && (
                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Truck size={16} className="text-indigo-600"/> Driver & Vehicle Credentials
                  </h3>
                  <div className="grid grid-cols-3 gap-4 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Vehicle Type</span>
                      <span className="text-sm font-bold text-slate-800 capitalize">{selectedUser.vehicle_type || '—'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Plate Number</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">{selectedUser.plate_number || '—'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Driver License No.</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">{selectedUser.driver_license_no || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedUser.role === 'vendor' && (
                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Store size={16} className="text-indigo-600"/> Merchant & Business Details
                  </h3>
                  <div className="grid grid-cols-3 gap-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Business / Store Name</span>
                      <span className="text-sm font-bold text-slate-800">{selectedUser.business_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Business Type</span>
                      <span className="text-sm font-bold text-slate-800 capitalize">{selectedUser.business_type || '—'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-medium">Tax ID / Reg Number</span>
                      <span className="text-sm font-bold text-slate-800 font-mono">{selectedUser.tax_id || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Uploaded Verification Documents */}
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" /> Uploaded Credentials & Proofs
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* National ID / Passport */}
                  <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between bg-slate-50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-700">National ID / Identity Card</span>
                      {selectedUser.id_card_url && (
                        <button 
                          onClick={() => setPreviewImage({ url: selectedUser.id_card_url!, title: 'National ID' })}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1"
                        >
                          <ZoomIn size={14} /> Zoom
                        </button>
                      )}
                    </div>
                    {selectedUser.id_card_url ? (
                      <img 
                        src={selectedUser.id_card_url} 
                        alt="ID Card" 
                        className="w-full h-40 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-95 transition"
                        onClick={() => setPreviewImage({ url: selectedUser.id_card_url!, title: 'National ID' })}
                      />
                    ) : (
                      <div className="h-40 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-semibold">
                        No ID Document Uploaded
                      </div>
                    )}
                  </div>

                  {/* Selfie / Photo Verification */}
                  <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between bg-slate-50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-700">Selfie / Photo Verification</span>
                      {selectedUser.selfie_url && (
                        <button 
                          onClick={() => setPreviewImage({ url: selectedUser.selfie_url!, title: 'Selfie Verification' })}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1"
                        >
                          <ZoomIn size={14} /> Zoom
                        </button>
                      )}
                    </div>
                    {selectedUser.selfie_url ? (
                      <img 
                        src={selectedUser.selfie_url} 
                        alt="Selfie Verification" 
                        className="w-full h-40 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-95 transition"
                        onClick={() => setPreviewImage({ url: selectedUser.selfie_url!, title: 'Selfie Verification' })}
                      />
                    ) : (
                      <div className="h-40 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-semibold">
                        No Selfie Uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <ShieldCheck size={48} className="mb-2 text-slate-300" />
              <p className="font-medium text-sm">Select an applicant from the queue to review their details</p>
            </div>
          )}
        </div>

      </div>

      {/* Image Inspection Zoom Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 text-lg">{previewImage.title}</h3>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 flex items-center justify-center bg-black">
              <img src={previewImage.url} alt="Enlarged document" className="max-w-full max-h-[65vh] object-contain" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}