
import {exportCsv, providerAmount} from '@/lib/csvExport';
import {useAdminAccess,canAccess} from '@/lib/adminAccess';
import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { DocumentCard } from './KycPage';
import {
  Search,
  RefreshCw,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  X,
} from 'lucide-react';

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">
        {value || '—'}
      </p>
    </div>
  );
}

export default function UsersPage() {
  const access=useAdminAccess();
  const allowed=canAccess(access,'customers');
  const stamp=JSON.stringify([access?.id,allowed,access?.is_active,access?.permissions]);
  const current=useRef(stamp);current.current=stamp;
  const [loadedStamp,setLoadedStamp]=useState('');
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState('');
  const [exportNotice,setExportNotice]=useState('');
  const exportBusy=useRef(false);

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'rider' | 'driver' | 'merchant'
  >('all');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const mounted=useRef(false),readGeneration=useRef(0);
  const fetchUsers=useCallback(async()=>{
    if(!allowed)return;
    const generation=++readGeneration.current;setLoading(true);setError('');
    setLoadedStamp(stamp);
    try{
      const {data,error:queryError}=await supabase.from('profiles').select('*').in('role',['rider','driver','merchant']).order('created_at',{ascending:false});
      if(queryError)throw queryError;
      if(!Array.isArray(data))throw new Error('The customer response could not be verified.');
      if(mounted.current&&current.current===stamp&&generation===readGeneration.current)setUsers(data);
    }catch(error:any){if(mounted.current&&current.current===stamp&&generation===readGeneration.current)setError(error.message||'Could not load customers.');}
    finally{if(mounted.current&&current.current===stamp&&generation===readGeneration.current)setLoading(false);}
  },[stamp,allowed]);
  useEffect(()=>{mounted.current=true;setUsers([]);setSelectedUser(null);void fetchUsers();return()=>{mounted.current=false;readGeneration.current++;};},[fetchUsers]);

  const filteredUsers = users.filter(user => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [user.full_name,user.first_name,user.last_name,user.email,user.phone,user.phone_number]
      .some(value=>String(value||'').toLowerCase().includes(term));

    const matchesRole =
      roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  async function downloadDisplayed() {
    if(exportBusy.current||loading||error||!canAccess(access,'customers'))return;
    exportBusy.current=true;setExporting(true);setExportError('');setExportNotice('');
    try{
      const count=await exportCsv({userId:access!.id,section:'customers',filename:'matmove-customers',rows:[...filteredUsers],columns:[
        {label:'Customer ID',value:(row:any)=>row.id},
        {label:'Full name',value:(row:any)=>row.full_name||[row.first_name,row.last_name].filter(Boolean).join(' ')},
        {label:'Role',value:(row:any)=>row.role},
        {label:'Email',value:(row:any)=>row.email},
        {label:'Phone',value:(row:any)=>row.phone||row.phone_number},
        {label:'KYC status',value:(row:any)=>row.kyc_status},
        {label:'Created at',value:(row:any)=>row.created_at},
      ]});
      setExportNotice(`Downloaded ${count} displayed records.`);
    }catch(error:any){setExportError(error.message||'CSV export failed.');}
    finally{exportBusy.current=false;setExporting(false);}
  }

  if(!allowed)return <AdminLayout title="Customer Governance"><p role="alert" className="p-6">Access denied.</p></AdminLayout>;
  if(loadedStamp!==stamp)return <AdminLayout title="Customer Governance"><p className="p-6">Loading customers...</p></AdminLayout>;
  return (
    <AdminLayout
      title="Customer Governance"
      subtitle="Monitor and manage Riders, Drivers, and Merchants"
    >
      <section aria-label="CSV export" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div><p className="text-sm font-bold">Export displayed records</p><p className="text-xs text-slate-600">Exports the currently loaded records matching your filters. This is the loaded customer list, not a complete database backup.</p></div>
        <button type="button" onClick={()=>void downloadDisplayed()} disabled={exporting||loading||!!error||!filteredUsers.length||!canAccess(access,'customers')} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{exporting?'Exporting…':'Export displayed CSV'}</button>
        {exportError&&<p role="alert" className="w-full text-sm text-red-800">{exportError}</p>}
        {exportNotice&&<p role="status" className="w-full text-sm text-emerald-800">{exportNotice}</p>}
      </section>
      <div className="mb-6 mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex w-full max-w-xl flex-1 flex-wrap gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <select
            value={roleFilter}
            onChange={event =>
              setRoleFilter(event.target.value as typeof roleFilter)
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm outline-none"
          >
            <option value="all">All Roles</option>
            <option value="rider">Riders</option>
            <option value="driver">Drivers</option>
            <option value="merchant">Merchants</option>
          </select>
        </div>

        <button
          onClick={() => void fetchUsers()}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2
              className="mx-auto mb-2 animate-spin text-indigo-600"
              size={24}
            />
            Loading customers...
          </div>
        ) : error ? (
          <p role="alert" className="p-6 text-red-800">Customer records could not be loaded.<button type="button" onClick={()=>void fetchUsers()} className="ml-2 min-h-11 font-bold underline">Retry customers</button></p>
        ) : !filteredUsers.length ? <p className="p-6 text-slate-600">No customers match the selected filters.</p> : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">KYC Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-base font-bold text-slate-900">
                        {user.full_name ||
                          `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                          user.email || user.phone || user.phone_number || user.id}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">
                        {user.id.slice(0, 12)}...
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase text-indigo-700">
                        {user.role}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-700">
                        {user.email || 'No Email'}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {user.phone || user.phone_number || 'No Phone'}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {user.kyc_status === 'approved' ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 size={16} />
                          Approved
                        </span>
                      ) : (
                        <span
                          className={`flex items-center gap-1 text-xs font-bold ${
                            user.kyc_status === 'rejected'
                              ? 'text-red-600'
                              : 'text-amber-600'
                          }`}
                        >
                          <ShieldAlert size={16} />
                          {user.kyc_status === 'rejected'
                            ? 'Rejected'
                            : ['not_started','draft'].includes(user.kyc_status)
                              ? 'KYC not submitted'
                              : user.kyc_status === 'resubmission_required'
                                ? 'Resubmission required'
                                : user.kyc_status === 'pending' ? 'Pending review' : 'KYC status unavailable'}
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-8 py-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Customer Profile & Documents
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedUser.full_name || `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.email || selectedUser.phone || selectedUser.phone_number || selectedUser.id} ·{' '}
                  <span className="font-bold uppercase text-indigo-600">
                    {selectedUser.role}
                  </span>
                </p>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                aria-label="Close customer profile"
                className="rounded-full bg-slate-100 p-2 text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-8 p-8">
              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Customer Information
                </h3>

                <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:grid-cols-3">
                  <Info
                    label="Full name"
                    value={
                      selectedUser.full_name ||
                      `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() ||
                      '—'
                    }
                  />
                  <Info
                    label="Phone"
                    value={selectedUser.phone || selectedUser.phone_number || '—'}
                  />
                  <Info label="Email" value={selectedUser.email || '—'} />
                  <Info label="Date of birth" value={selectedUser.date_of_birth || '—'} />
                  <Info label="Nationality" value={selectedUser.nationality || '—'} />
                  <Info label="Country" value={selectedUser.country || '—'} />
                  <Info label="City" value={selectedUser.city || '—'} />
                  <Info
                    label="Address"
                    value={selectedUser.residential_address || selectedUser.address || '—'}
                  />
                  <Info label="KYC status" value={selectedUser.kyc_status || '—'} />
                </div>
              </section>

              {selectedUser.role === 'driver' && (
                <section>
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">
                    Driver Information
                  </h3>
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:grid-cols-3">
                    <Info label="Vehicle type" value={selectedUser.vehicle_type || '—'} />
                    <Info label="Plate number" value={selectedUser.plate_number || '—'} />
                    <Info label="Driver license" value={selectedUser.driver_license_no || '—'} />
                  </div>
                </section>
              )}

              {selectedUser.role === 'merchant' && (
                <section>
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">
                    Business Information
                  </h3>
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:grid-cols-3">
                    <Info label="Business name" value={selectedUser.business_name || '—'} />
                    <Info label="Business type" value={selectedUser.business_type || '—'} />
                    <Info label="Tax ID" value={selectedUser.tax_id || '—'} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Submitted Documents
                </h3>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <DocumentCard
                    key={`${selectedUser.id}:front`}
                    title="ID Card — Front"
                    documentType="id_card_url"
                    userId={selectedUser.id}
                  />
                  <DocumentCard
                    key={`${selectedUser.id}:back`}
                    title="ID Card — Back"
                    documentType="id_card_back_url"
                    userId={selectedUser.id}
                  />
                  <DocumentCard
                    title="Selfie"
                    documentType="selfie_url"
                    userId={selectedUser.id}
                  />

                  {selectedUser.role === 'driver' && (
                    <DocumentCard
                      title="Driver License"
                      documentType="license_doc_url"
                      userId={selectedUser.id}
                    />
                  )}

                  {selectedUser.role === 'merchant' && (
                    <DocumentCard
                      title="Business Document"
                      documentType="business_doc_url"
                      userId={selectedUser.id}
                    />
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
