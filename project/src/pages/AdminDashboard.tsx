import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  FileText,
  Truck,
  Store,
  User,
  ShieldCheck,
  ZoomIn,
  X,
  Clock3,
  Users,
  AlertTriangle,
  Activity,
  MapPin,
  Phone,
  Mail,
  CalendarDays,
  BadgeCheck,
  Ban,
} from 'lucide-react';

type CustomerRole = 'rider' | 'driver' | 'merchant';
type AccountRole = CustomerRole | 'admin' | 'corporate' | string;
type KycStatus = 'pending' | 'approved' | 'rejected' | string;

interface UserProfile {
  id: string;
  email?: string;
  full_name?: string;
  phone_number?: string;
  role?: AccountRole;
  kyc_status?: KycStatus;
  created_at: string;
  updated_at?: string;

  address?: string;
  city?: string;

  vehicle_type?: string;
  plate_number?: string;
  driver_license_no?: string;

  business_name?: string;
  business_type?: string;
  tax_id?: string;

  id_card_url?: string;
  selfie_url?: string;
  license_doc_url?: string;
  business_doc_url?: string;

  [key: string]: unknown;
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

interface PreviewImage {
  url: string;
  title: string;
}

function normalizeRole(role?: string): AccountRole {
  if (!role) return 'rider';

  if (role === 'vendor') return 'merchant';
  if (role === 'client') return 'rider';

  return role;
}

function roleLabel(role?: string) {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case 'rider':
      return 'Rider';
    case 'driver':
      return 'Driver';
    case 'merchant':
      return 'Merchant';
    case 'admin':
      return 'Admin';
    case 'corporate':
      return 'Corporate';
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
}

function isCustomerRole(role?: string): role is CustomerRole {
  const normalized = normalizeRole(role);

  return (
    normalized === 'rider' ||
    normalized === 'driver' ||
    normalized === 'merchant'
  );
}

function statusLabel(status?: string) {
  if (!status) return 'Pending';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status?: string) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'rejected':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

function formatDate(value?: string) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminDashboard() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [filter, setFilter] = useState<Filter>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  const [previewImage, setPreviewImage] =
    useState<PreviewImage | null>(null);

  const [errorMessage, setErrorMessage] = useState('');

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setProfiles([]);
        setSelectedUser(null);
        return;
      }

      const normalizedProfiles = ((data || []) as UserProfile[])
        .map((profile) => ({
          ...profile,
          role: normalizeRole(profile.role),
        }))
        .filter((profile) => {
          /*
           * Admin is a system role, not a customer KYC applicant.
           * Keep corporate available for future expansion but exclude
           * it from this customer verification queue.
           */
          return isCustomerRole(profile.role);
        });

      setProfiles(normalizedProfiles);

      setSelectedUser((current) => {
        if (current) {
          const refreshed = normalizedProfiles.find(
            (profile) => profile.id === current.id
          );

          if (refreshed) return refreshed;
        }

        return normalizedProfiles[0] || null;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load MatMove verification records.'
      );
      setProfiles([]);
      setSelectedUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-kyc-live-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchProfiles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProfiles]);

  const handleUpdateStatus = async (
    userId: string,
    newStatus: 'approved' | 'rejected'
  ) => {
    setActionLoading(true);
    setErrorMessage('');

    try {
      /*
       * This uses the existing profiles KYC field used by the
       * customer onboarding flow.
       *
       * If Admin RLS is later moved entirely behind a SECURITY DEFINER
       * approval RPC, this action can be switched to that RPC without
       * changing the surrounding Admin UI.
       */
      const { data, error } = await supabase
        .from('profiles')
        .update({
          kyc_status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*')
        .single();

      if (error) {
        setErrorMessage(
          `Unable to ${newStatus === 'approved' ? 'approve' : 'reject'} this application: ${error.message}`
        );
        return;
      }

      const updatedProfile = {
        ...(data as UserProfile),
        role: normalizeRole((data as UserProfile).role),
      };

      setProfiles((current) =>
        current.map((profile) =>
          profile.id === userId ? updatedProfile : profile
        )
      );

      setSelectedUser(updatedProfile);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The verification action could not be completed.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const filteredProfiles = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesFilter =
        filter === 'all' ||
        (profile.kyc_status || 'pending') === filter;

      if (!matchesFilter) return false;

      if (!search) return true;

      return (
        (profile.full_name || '').toLowerCase().includes(search) ||
        (profile.email || '').toLowerCase().includes(search) ||
        (profile.phone_number || '').toLowerCase().includes(search) ||
        (profile.business_name || '').toLowerCase().includes(search) ||
        (profile.plate_number || '').toLowerCase().includes(search)
      );
    });
  }, [profiles, filter, searchTerm]);

  const statistics = useMemo(() => {
    return {
      total: profiles.length,
      pending: profiles.filter(
        (profile) => profile.kyc_status === 'pending'
      ).length,
      approved: profiles.filter(
        (profile) => profile.kyc_status === 'approved'
      ).length,
      rejected: profiles.filter(
        (profile) => profile.kyc_status === 'rejected'
      ).length,
      riders: profiles.filter(
        (profile) => normalizeRole(profile.role) === 'rider'
      ).length,
      drivers: profiles.filter(
        (profile) => normalizeRole(profile.role) === 'driver'
      ).length,
      merchants: profiles.filter(
        (profile) => normalizeRole(profile.role) === 'merchant'
      ).length,
    };
  }, [profiles]);

  const documentCount = selectedUser
    ? [
        selectedUser.id_card_url,
        selectedUser.selfie_url,
        selectedUser.license_doc_url,
        selectedUser.business_doc_url,
      ].filter(Boolean).length
    : 0;

  const selectedRole = selectedUser
    ? normalizeRole(selectedUser.role)
    : null;

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-start gap-6 sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck size={21} />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                KYC & Customer Verification
              </h1>

              <p className="text-sm text-slate-500 mt-1">
                Review and control MatMove rider, driver and merchant
                onboarding.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />

            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10 pr-4 py-2.5 bg-slate-100 border border-transparent rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none w-64 transition"
            />
          </div>

          <button
            onClick={fetchProfiles}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-sm font-semibold rounded-xl transition"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </header>

      {/* Live Summary */}
      <div className="px-8 pt-6">
        <div className="grid grid-cols-6 gap-4">
          <SummaryCard
            label="Total Customers"
            value={statistics.total}
            icon={<Users size={18} />}
          />

          <SummaryCard
            label="Pending KYC"
            value={statistics.pending}
            icon={<Clock3 size={18} />}
            highlight={statistics.pending > 0}
          />

          <SummaryCard
            label="Approved"
            value={statistics.approved}
            icon={<CheckCircle2 size={18} />}
          />

          <SummaryCard
            label="Rejected"
            value={statistics.rejected}
            icon={<XCircle size={18} />}
          />

          <SummaryCard
            label="Drivers"
            value={statistics.drivers}
            icon={<Truck size={18} />}
          />

          <SummaryCard
            label="Merchants"
            value={statistics.merchants}
            icon={<Store size={18} />}
          />
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-8 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3 text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />

          <div className="flex-1">
            <p className="text-sm font-semibold">
              Admin action requires attention
            </p>

            <p className="text-xs mt-1">{errorMessage}</p>
          </div>

          <button
            onClick={() => setErrorMessage('')}
            className="text-red-400 hover:text-red-600"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 p-8 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Applicant Queue */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-slate-900">
                  Verification Queue
                </h2>

                <p className="text-xs text-slate-400 mt-1">
                  Live customer applications
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Activity size={14} />
                Live
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1">
              {(
                ['pending', 'approved', 'rejected', 'all'] as const
              ).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition ${
                    filter === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center mt-3">
              <span className="text-xs text-slate-400">
                Showing {filteredProfiles.length} of {profiles.length}
              </span>

              <span className="text-xs font-bold text-slate-500">
                {statistics.riders} riders · {statistics.drivers} drivers ·{' '}
                {statistics.merchants} merchants
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <RefreshCw
                  size={20}
                  className="animate-spin mx-auto mb-3"
                />
                Loading live applications...
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-8 text-center">
                <ShieldCheck
                  size={38}
                  className="mx-auto mb-3 text-slate-200"
                />

                <p className="font-semibold text-slate-600 text-sm">
                  No applications found
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  Try another status or search term.
                </p>
              </div>
            ) : (
              filteredProfiles.map((user) => {
                const role = normalizeRole(user.role);

                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left p-4 cursor-pointer transition flex items-center justify-between ${
                      selectedUser?.id === user.id
                        ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                        {user.full_name
                          ? user.full_name.charAt(0).toUpperCase()
                          : (user.email || 'U')
                              .charAt(0)
                              .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">
                          {user.full_name || 'Incomplete Profile'}
                        </div>

                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {user.email || 'No email'}
                        </div>

                        <div className="text-[10px] text-slate-400 mt-1">
                          Submitted {formatDate(user.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase block mb-1">
                        {roleLabel(role)}
                      </span>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${statusClasses(
                          user.kyc_status
                        )}`}
                      >
                        {statusLabel(user.kyc_status)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Inspector */}
        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-y-auto">
          {selectedUser ? (
            <div className="p-6 space-y-6">
              {/* Applicant Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-5 gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    {selectedRole === 'driver' ? (
                      <Truck size={26} />
                    ) : selectedRole === 'merchant' ? (
                      <Store size={26} />
                    ) : (
                      <User size={26} />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold text-slate-900">
                        {selectedUser.full_name ||
                          'No Name Provided'}
                      </h2>

                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase">
                        {roleLabel(selectedRole || undefined)}
                      </span>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${statusClasses(
                          selectedUser.kyc_status
                        )}`}
                      >
                        {statusLabel(selectedUser.kyc_status)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                      <span>{selectedUser.email || 'No email'}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-xs">
                        {selectedUser.id}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={
                      actionLoading ||
                      selectedUser.kyc_status === 'rejected'
                    }
                    onClick={() =>
                      handleUpdateStatus(
                        selectedUser.id,
                        'rejected'
                      )
                    }
                    className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>

                  <button
                    disabled={
                      actionLoading ||
                      selectedUser.kyc_status === 'approved'
                    }
                    onClick={() =>
                      handleUpdateStatus(
                        selectedUser.id,
                        'approved'
                      )
                    }
                    className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition"
                  >
                    {actionLoading ? (
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}

                    {selectedUser.kyc_status === 'approved'
                      ? 'Approved'
                      : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Status Explanation */}
              <div
                className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                  selectedUser.kyc_status === 'approved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : selectedUser.kyc_status === 'rejected'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {selectedUser.kyc_status === 'approved' ? (
                  <BadgeCheck size={18} className="mt-0.5" />
                ) : selectedUser.kyc_status === 'rejected' ? (
                  <Ban size={18} className="mt-0.5" />
                ) : (
                  <Clock3 size={18} className="mt-0.5" />
                )}

                <div>
                  <p className="text-sm font-bold">
                    {selectedUser.kyc_status === 'approved'
                      ? 'Customer verification approved'
                      : selectedUser.kyc_status === 'rejected'
                        ? 'Customer verification rejected'
                        : 'Application awaiting Admin review'}
                  </p>

                  <p className="text-xs mt-1 opacity-80">
                    {selectedUser.kyc_status === 'approved'
                      ? 'This account has passed the current KYC status check.'
                      : selectedUser.kyc_status === 'rejected'
                        ? 'This application is currently marked as rejected.'
                        : 'Review the customer identity, documents and role-specific information before approval.'}
                  </p>
                </div>
              </div>

              {/* Personal Information */}
              <Section title="Personal & Contact Information">
                <div className="grid grid-cols-3 gap-4">
                  <InfoCard
                    icon={<User size={16} />}
                    label="Full Name"
                    value={selectedUser.full_name}
                  />

                  <InfoCard
                    icon={<Mail size={16} />}
                    label="Email"
                    value={selectedUser.email}
                  />

                  <InfoCard
                    icon={<Phone size={16} />}
                    label="Phone Number"
                    value={selectedUser.phone_number}
                  />

                  <InfoCard
                    icon={<MapPin size={16} />}
                    label="Address"
                    value={selectedUser.address}
                  />

                  <InfoCard
                    icon={<MapPin size={16} />}
                    label="City / Location"
                    value={selectedUser.city}
                  />

                  <InfoCard
                    icon={<CalendarDays size={16} />}
                    label="Account Created"
                    value={formatDate(selectedUser.created_at)}
                  />
                </div>
              </Section>

              {/* Driver */}
              {selectedRole === 'driver' && (
                <Section title="Driver & Vehicle Credentials">
                  <div className="grid grid-cols-3 gap-4 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
                    <InfoCard
                      label="Vehicle Type"
                      value={selectedUser.vehicle_type}
                    />

                    <InfoCard
                      label="Plate Number"
                      value={selectedUser.plate_number}
                    />

                    <InfoCard
                      label="Driver License No."
                      value={selectedUser.driver_license_no}
                    />
                  </div>
                </Section>
              )}

              {/* Merchant */}
              {selectedRole === 'merchant' && (
                <Section title="Merchant & Business Information">
                  <div className="grid grid-cols-3 gap-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                    <InfoCard
                      icon={<Store size={16} />}
                      label="Business / Store Name"
                      value={selectedUser.business_name}
                    />

                    <InfoCard
                      label="Business Type"
                      value={selectedUser.business_type}
                    />

                    <InfoCard
                      label="Tax ID / Registration"
                      value={selectedUser.tax_id}
                    />
                  </div>
                </Section>
              )}

              {/* Documents */}
              <Section
                title={`Verification Documents (${documentCount})`}
              >
                <div className="grid grid-cols-2 gap-4">
                  <DocumentCard
                    title="National ID / Identity Card"
                    url={selectedUser.id_card_url}
                    onPreview={(url) =>
                      setPreviewImage({
                        url,
                        title: 'National ID / Identity Card',
                      })
                    }
                  />

                  <DocumentCard
                    title="Selfie / Photo Verification"
                    url={selectedUser.selfie_url}
                    onPreview={(url) =>
                      setPreviewImage({
                        url,
                        title: 'Selfie Verification',
                      })
                    }
                  />

                  {selectedRole === 'driver' && (
                    <DocumentCard
                      title="Driver License Document"
                      url={selectedUser.license_doc_url}
                      onPreview={(url) =>
                        setPreviewImage({
                          url,
                          title: 'Driver License Document',
                        })
                      }
                    />
                  )}

                  {selectedRole === 'merchant' && (
                    <DocumentCard
                      title="Business Registration Document"
                      url={selectedUser.business_doc_url}
                      onPreview={(url) =>
                        setPreviewImage({
                          url,
                          title:
                            'Business Registration Document',
                        })
                      }
                    />
                  )}
                </div>
              </Section>

              {/* Admin Note */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
                <ShieldCheck
                  size={19}
                  className="text-indigo-600 mt-0.5 shrink-0"
                />

                <div>
                  <p className="text-sm font-bold text-slate-800">
                    MatMove verification control
                  </p>

                  <p className="text-xs text-slate-500 mt-1 leading-5">
                    Customer capabilities should remain controlled by
                    verification status. Driver dispatch and merchant
                    restricted financial operations must not become
                    available merely because the customer can access
                    the portal.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <ShieldCheck
                size={52}
                className="mb-3 text-slate-200"
              />

              <p className="font-semibold text-slate-600 text-sm">
                Select a customer application
              </p>

              <p className="text-xs text-slate-400 mt-1">
                Applicant details and verification documents will
                appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Document Preview */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] p-5 shadow-2xl relative flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {previewImage.title}
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Verification document preview
                </p>
              </div>

              <button
                onClick={() => setPreviewImage(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 flex items-center justify-center bg-slate-950 p-4">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-2xl p-4 shadow-sm ${
        highlight
          ? 'border-amber-200'
          : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>

        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            highlight
              ? 'bg-amber-50 text-amber-600'
              : 'bg-indigo-50 text-indigo-600'
          }`}
        >
          {icon}
        </div>
      </div>

      <div className="text-2xl font-bold text-slate-900 mt-3">
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
        {title}
      </h3>

      {children}
    </section>
  );
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
        {icon}
        <span>{label}</span>
      </div>

      <div className="text-sm font-bold text-slate-800 mt-2 break-words">
        {value || '—'}
      </div>
    </div>
  );
}

function DocumentCard({
  title,
  url,
  onPreview,
}: {
  title: string;
  url?: string;
  onPreview: (url: string) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
      <div className="flex justify-between items-center mb-3 gap-3">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-indigo-600" />

          <span className="text-xs font-bold text-slate-700">
            {title}
          </span>
        </div>

        {url && (
          <button
            onClick={() => onPreview(url)}
            className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1"
          >
            <ZoomIn size={14} />
            View
          </button>
        )}
      </div>

      {url ? (
        <button
          type="button"
          onClick={() => onPreview(url)}
          className="w-full block"
        >
          <img
            src={url}
            alt={title}
            className="w-full h-44 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-95 transition"
          />
        </button>
      ) : (
        <div className="h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs font-semibold">
          <FileText size={28} className="mb-2 text-slate-300" />
          No document uploaded
        </div>
      )}
    </div>
  );
}