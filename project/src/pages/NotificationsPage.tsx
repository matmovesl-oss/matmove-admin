import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { canAccess, useAdminAccess } from '@/lib/adminAccess';
import { supabase } from '@/lib/supabase';
import {
  Bell,
  RefreshCw,
  Send,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
} from 'lucide-react';

type Audience = 'all' | 'rider' | 'driver' | 'merchant' | 'user';

type Customer = {
  id: string;
  role: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
};

type Notification = {
  id: string;
  sender_id: string;
  audience: string;
  target_id: string | null;
  title: string;
  body: string;
  destination: string | null;
  recipient_count: number;
  created_at: string;
  deleted_at?: string|null;
};

function customerName(customer: Customer) {
  return (
    customer.full_name ||
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
    customer.email ||
    customer.phone ||
    customer.phone_number ||
    customer.id
  );
}

function newRequestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('Secure request IDs are unavailable in this browser.');
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable';
}

export default function NotificationsPage() {
  const access = useAdminAccess();
  const allowed = canAccess(access, 'notifications') || access?.permissions?.includes('*'); // Safely supports super admin

  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destination, setDestination] = useState('');
  const [targetId, setTargetId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');

  const [history, setHistory] = useState<Notification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [deleteTarget,setDeleteTarget]=useState<string|null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendNotice, setSendNotice] = useState('');

  const requestKey = useRef('');
  const requestFingerprint = useRef('');

  const loadCustomers = useCallback(async () => {
    if (!allowed) return;

    setCustomersLoading(true);
    setCustomerError('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,role,full_name,first_name,last_name,email,phone,phone_number')
        .in('role', ['rider', 'driver', 'merchant'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error('Customer records could not be verified.');
      }

      setCustomers(data as Customer[]);
    } catch (error: any) {
      setCustomerError(error?.message || 'Could not load customers.');
    } finally {
      setCustomersLoading(false);
    }
  }, [allowed]);

  const loadHistory = useCallback(async () => {
    if (!allowed) return;

    setHistoryLoading(true);
    setHistoryError('');

    try {
      const { data, error } = await supabase.rpc(
        'matmove_admin_notification_history',
        { p_before: null }
      );

      if (error) throw error;

      if (!data || !Array.isArray(data.items)) {
        throw new Error('Notification history response could not be verified.');
      }

      setHistory(data.items as Notification[]);
    } catch (error: any) {
      setHistoryError(error?.message || 'Could not load notification history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;

    void loadCustomers();
    void loadHistory();
  }, [allowed, loadCustomers, loadHistory]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();

    return customers.filter(customer => {
      if (!term) return true;

      return [
        customerName(customer),
        customer.email,
        customer.phone,
        customer.phone_number,
        customer.role,
      ].some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [customers, customerSearch]);

  async function sendNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!allowed || sending) return;

    setSendError('');
    setSendNotice('');

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (!cleanTitle || cleanTitle.length > 100) {
      setSendError('The title must contain between 1 and 100 characters.');
      return;
    }

    if (!cleanBody || cleanBody.length > 2000) {
      setSendError('The message must contain between 1 and 2,000 characters.');
      return;
    }

    if (audience === 'user' && !targetId) {
      setSendError('Please select an individual customer.');
      return;
    }

    if (audience === 'user' && !customers.some(customer => customer.id === targetId)) {
      setSendError('The selected customer is not in the loaded customer list. Refresh customers and try again.');
      return;
    }

    const payload = {
      audience,
      targetId: audience === 'user' ? targetId : null,
      title: cleanTitle,
      body: cleanBody,
      destination: destination || null,
    };

    const fingerprint = JSON.stringify(payload);

    try {
      if (!requestKey.current || requestFingerprint.current !== fingerprint) {
        requestKey.current = newRequestKey();
        requestFingerprint.current = fingerprint;
      }

      setSending(true);

      const { data, error } = await supabase.rpc(
        'matmove_admin_send_notification',
        {
          p_request_key: requestKey.current,
          p_audience: payload.audience,
          p_target_id: payload.targetId,
          p_title: payload.title,
          p_body: payload.body,
          p_destination: payload.destination,
        }
      );

      if (error) throw error;

      if (
        !data ||
        typeof data.id !== 'string' ||
        !Number.isSafeInteger(Number(data.recipient_count)) ||
        Number(data.recipient_count) < 1
      ) {
        throw new Error('The database did not confirm a successful notification send.');
      }

      setSendNotice(
        `Notification recorded successfully. Recipients: ${Number(data.recipient_count).toLocaleString()}.`
      );

      setTitle('');
      setBody('');
      setAudience('all');
      setTargetId('');
      setDestination('');
      setCustomerSearch('');

      requestKey.current = '';
      requestFingerprint.current = '';

      await loadHistory();
    } catch (error: any) {
      setSendError(error?.message || 'Notification could not be sent. Please retry.');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if(deleteBusy||!allowed)return;
    setDeleteBusy(true);setSendError('');setSendNotice('');
    try {
      const {data,error}=await supabase.rpc('matmove_admin_delete_notification',{p_id:id});
      if(error)throw error;
      if(data?.deleted!==true||data.messageId!==id||data.deletedForAllRecipients!==true)throw new Error('Global notification deletion was not confirmed. Refresh the history before retrying.');
      setHistory(previous=>previous.map(item=>item.id===id?{...item,deleted_at:new Date().toISOString()}:item));
      setDeleteTarget(null);
      setSendNotice('Notification withdrawn from every recipient inbox. The original send record is retained for audit.');
    } catch (err: any) {
      setSendError(err.message || 'Notification could not be withdrawn from customer inboxes.');
      void loadHistory();
    } finally {setDeleteBusy(false);}
  }

  if (!allowed) {
    return (
      <AdminLayout title="Customer Notifications">
        <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">
          Access denied. Customer notifications have not been assigned to this account.
        </p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Customer Notifications"
      subtitle="Send announcements to MatMove customers and review previous notification sends."
    >
      <div className="space-y-6">

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3">
              <Bell className="text-indigo-600" size={22} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Send a notification</h2>
              <p className="text-xs text-slate-500">
                Reach all eligible customers or select a specific audience.
              </p>
            </div>
          </div>

          <form onSubmit={sendNotification} className="space-y-5">

            <div>
              <label htmlFor="audience" className="mb-2 block text-sm font-bold text-slate-700">
                Notification audience
              </label>
              <select
                id="audience"
                value={audience}
                onChange={event => {
                  setAudience(event.target.value as Audience);
                  setTargetId('');
                  setSendError('');
                  setSendNotice('');
                }}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm"
              >
                <option value="all">All eligible customers</option>
                <option value="rider">Riders only</option>
                <option value="driver">Drivers only</option>
                <option value="merchant">Merchants only</option>
                <option value="user">One individual customer</option>
              </select>
            </div>

            {audience === 'user' && (
              <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <label className="block text-sm font-bold text-slate-700">
                  Find an individual customer
                </label>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={event => setCustomerSearch(event.target.value)}
                    placeholder="Search by name, email or phone"
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm"
                  />
                </div>

                <select
                  value={targetId}
                  onChange={event => setTargetId(event.target.value)}
                  disabled={customersLoading}
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  required
                >
                  <option value="">
                    {customersLoading ? 'Loading customers...' : 'Select customer'}
                  </option>
                  {filteredCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customerName(customer)} — {customer.role} — {customer.phone || customer.phone_number || customer.email || 'No contact'}
                    </option>
                  ))}
                </select>

                {customerError && (
                  <p role="alert" className="text-sm text-red-700">{customerError}</p>
                )}

                {!customersLoading && !customerError && !filteredCustomers.length && (
                  <p className="text-xs text-slate-600">No matching customers found.</p>
                )}

                <button
                  type="button"
                  onClick={() => void loadCustomers()}
                  disabled={customersLoading}
                  className="text-xs font-bold text-indigo-700 underline disabled:opacity-50"
                >
                  Refresh customer list
                </button>
              </div>
            )}

            <div>
              <label htmlFor="notification-title" className="mb-2 block text-sm font-bold text-slate-700">
                Notification title
              </label>
              <input
                id="notification-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={100}
                required
                placeholder="Example: MatMove weekend promotion"
                className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-sm"
              />
              <p className="mt-1 text-right text-xs text-slate-400">{title.length}/100</p>
            </div>

            <div>
              <label htmlFor="notification-body" className="mb-2 block text-sm font-bold text-slate-700">
                Message
              </label>
              <textarea
                id="notification-body"
                value={body}
                onChange={event => setBody(event.target.value)}
                maxLength={2000}
                required
                rows={5}
                placeholder="Write your announcement to MatMove customers..."
                className="w-full rounded-xl border border-slate-300 p-4 text-sm"
              />
              <p className="mt-1 text-right text-xs text-slate-400">{body.length}/2000</p>
            </div>

            <div>
              <label htmlFor="notification-destination" className="mb-2 block text-sm font-bold text-slate-700">
                Optional app destination
              </label>
              <select
                id="notification-destination"
                value={destination}
                onChange={event => setDestination(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm"
              >
                <option value="">No destination</option>
                <option value="home">Home</option>
                <option value="wallet">Wallet</option>
                <option value="trips">Trips</option>
                <option value="games">Games</option>
                <option value="account">Account</option>
                <option value="kyc">KYC</option>
              </select>
            </div>

            {sendError && (
              <div role="alert" className="flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle size={18} className="shrink-0" />
                <span>{sendError}</span>
              </div>
            )}

            {sendNotice && (
              <div role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 size={18} className="shrink-0" />
                <span>{sendNotice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !title.trim() || !body.trim() || (audience === 'user' && !targetId)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {sending ? 'Sending notification...' : 'Send notification'}
            </button>

            <p className="text-xs text-slate-500">
              Sends are recorded by the MatMove database. The database confirms the eligible recipient count.
              Avoid including passwords, passcodes or other sensitive information.
            </p>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-bold text-slate-900">Notification history</h2>
              <p className="text-xs text-slate-500">Latest 50 recorded notification sends.</p>
            </div>

            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={15} className={historyLoading ? 'animate-spin' : ''} />
              Refresh history
            </button>
          </div>

          {historyError && (
            <div role="alert" className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              {historyError}
            </div>
          )}

          {historyLoading && !history.length ? (
            <div className="p-10 text-center text-slate-500">
              <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
              Loading notification history...
            </div>
          ) : !history.length ? (
            <div className="p-10 text-center">
              <Users size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-700">No notification sends found.</p>
              <p className="mt-1 text-xs text-slate-500">Your recorded sends will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Notification</th>
                    <th className="px-5 py-3">Audience</th>
                    <th className="px-5 py-3">Recipients</th>
                    <th className="px-5 py-3">Date sent</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((item, index) => (
                    <tr key={item.id || `${item.created_at}-${index}`} className="align-top hover:bg-slate-50">
                      <td className="max-w-sm px-5 py-4">
                        <p className="font-bold text-slate-900">{item.title}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">
                          {item.body}
                        </p>
                        {item.destination && (
                          <p className="mt-2 text-xs text-indigo-600">
                            Destination: {item.destination}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold capitalize text-indigo-700">
                          {item.audience === 'user' ? 'Individual customer' : item.audience}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-800">
                        {Number(item.recipient_count).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {item.deleted_at ? <span className="text-xs font-bold text-slate-500">Deleted for all users</span> : deleteTarget===item.id ? <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={deleteBusy} onClick={()=>void handleDelete(item.id)} className="min-h-10 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white">{deleteBusy?'Deleting…':'Confirm global delete'}</button><button type="button" disabled={deleteBusy} onClick={()=>setDeleteTarget(null)} className="min-h-10 rounded-lg border px-3 py-2 text-xs">Cancel</button></div> : <button type="button" disabled={deleteBusy} onClick={()=>setDeleteTarget(item.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="Delete for all users" aria-label={'Delete notification '+item.title}><Trash2 size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}