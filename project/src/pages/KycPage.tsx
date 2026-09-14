import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type KycDecision =
  | 'approved'
  | 'rejected'
  | 'resubmission_required';

type KycStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'resubmission_required';

type TargetRole =
  | 'rider'
  | 'driver'
  | 'merchant';

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  phone_number: string | null;
  email: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  country: string | null;
  residential_address: string | null;
  city: string | null;
  address: string | null;
  kyc_status: string | null;
  role: string | null;

  vehicle_type: string | null;
  plate_number: string | null;
  driver_license_no: string | null;

  business_name: string | null;
  business_type: string | null;
  tax_id: string | null;

  id_card_url: string | null;
  selfie_url: string | null;
  license_doc_url: string | null;
  business_doc_url: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type KycSubmission = {
  id: string;
  profile_id: string | null;
  target_role: TargetRole | null;
  status: KycStatus | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  created_at: string | null;

  profile: Profile | null;
};

const statusLabel = (status: KycStatus | null) => {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'resubmission_required':
      return 'Resubmission Required';
    case 'pending':
    default:
      return 'Pending';
  }
};

const roleLabel = (role: TargetRole | null) => {
  switch (role) {
    case 'driver':
      return 'Driver';
    case 'merchant':
      return 'Merchant';
    case 'rider':
      return 'Rider';
    default:
      return 'Customer';
  }
};

const statusClass = (status: KycStatus | null) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    case 'resubmission_required':
      return 'bg-yellow-100 text-yellow-700';
    case 'pending':
    default:
      return 'bg-blue-100 text-blue-700';
  }
};

const formatDate = (value: string | null) => {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString();
};

const getCustomerName = (profile: Profile | null) => {
  if (!profile) return 'Unknown customer';

  const fullName =
    profile.full_name?.trim() ||
    `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();

  return fullName || 'Unnamed customer';
};

export default function KycPage() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KycStatus>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | TargetRole>('all');

  const [selected, setSelected] = useState<KycSubmission | null>(null);

  const [decision, setDecision] = useState<KycDecision>('approved');
  const [reason, setReason] = useState('');

  // Added silent flag to prevent UI flashing during approvals
  const loadSubmissions = async (silent = false) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      // Pull directly from the profiles table where onboarding data lives
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['driver', 'merchant'])
        .order('updated_at', { ascending: false });

      if (queryError) {
        throw queryError;
      }

      // Map profiles to match your KycSubmission UI state exactly
      const normalized = (data ?? []).map((profile: any) => ({
        id: profile.id,
        profile_id: profile.id,
        target_role: profile.role,
        status: profile.kyc_status || 'pending',
        rejection_reason: null, 
        submitted_at: profile.updated_at || profile.created_at,
        reviewed_at: null,
        reviewer_id: null,
        created_at: profile.created_at,
        profile: profile
      }));

      setSubmissions(normalized);
    } catch (err: any) {
      console.error('KYC load error:', err);
      setError(err?.message || 'Unable to load KYC submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return submissions.filter((submission) => {
      const profile = submission.profile;

      const name = getCustomerName(profile).toLowerCase();

      const phone =
        profile?.phone ||
        profile?.phone_number ||
        '';

      const email = profile?.email || '';

      const matchesSearch =
        !query ||
        name.includes(query) ||
        phone.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        submission.id.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'all' ||
        submission.status === statusFilter;

      const matchesRole =
        roleFilter === 'all' ||
        submission.target_role === roleFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesRole
      );
    });
  }, [
    submissions,
    search,
    statusFilter,
    roleFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: submissions.length,
      pending: submissions.filter(
        (item) => item.status === 'pending'
      ).length,
      approved: submissions.filter(
        (item) => item.status === 'approved'
      ).length,
      rejected: submissions.filter(
        (item) => item.status === 'rejected'
      ).length,
      resubmission: submissions.filter(
        (item) =>
          item.status === 'resubmission_required'
      ).length,
    };
  }, [submissions]);

  const openReview = (
    submission: KycSubmission,
    selectedDecision: KycDecision = 'approved'
  ) => {
    setSelected(submission);
    setDecision(selectedDecision);

    setReason(
      selectedDecision === 'approved'
        ? ''
        : submission.rejection_reason || ''
    );
  };

  const closeReview = () => {
    if (actionLoading) return;

    setSelected(null);
    setReason('');
    setDecision('approved');
  };

  const submitDecision = async () => {
    if (!supabase || !selected) return;

    if (
      (decision === 'rejected' ||
        decision === 'resubmission_required') &&
      !reason.trim()
    ) {
      setError(
        'A reason is required for rejection or resubmission.'
      );
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      // Direct update to the live profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ kyc_status: decision })
        .eq('id', selected.profile_id);

      if (updateError) {
        throw updateError;
      }

      closeReview();
      
      // Load silently to prevent the table from flashing
      await loadSubmissions(true);
    } catch (err: any) {
      console.error(
        'KYC review error:',
        err
      );

      setError(
        err?.message ||
          'Unable to complete the KYC review.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const profile = selected?.profile ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          KYC Review
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Review customer identity documents and make
          secure KYC decisions.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError(null)}
              className="font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">
            Total
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {stats.total}
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm text-blue-700">
            Pending
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-800">
            {stats.pending}
          </p>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm text-green-700">
            Approved
          </p>
          <p className="mt-1 text-2xl font-bold text-green-800">
            {stats.approved}
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-700">
            Rejected
          </p>
          <p className="mt-1 text-2xl font-bold text-red-800">
            {stats.rejected}
          </p>
        </div>

        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <p className="text-sm text-yellow-700">
            Resubmission
          </p>
          <p className="mt-1 text-2xl font-bold text-yellow-800">
            {stats.resubmission}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search name, phone, email..."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | 'all'
                  | KycStatus
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="all">
              All statuses
            </option>
            <option value="pending">
              Pending
            </option>
            <option value="approved">
              Approved
            </option>
            <option value="rejected">
              Rejected
            </option>
            <option value="resubmission_required">
              Resubmission Required
            </option>
          </select>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value as
                  | 'all'
                  | TargetRole
              )
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="all">
              All account types
            </option>
            <option value="rider">
              Rider
            </option>
            <option value="driver">
              Driver
            </option>
            <option value="merchant">
              Merchant
            </option>
          </select>

          <button
            type="button"
            onClick={() => loadSubmissions(false)}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Refreshing...'
              : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Customer
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Account
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Submitted
                </th>

                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>

                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    Loading KYC submissions...
                  </td>
                </tr>
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No KYC submissions found.
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map(
                  (submission) => {
                    const itemProfile =
                      submission.profile;

                    const customerName =
                      getCustomerName(
                        itemProfile
                      );

                    const phone =
                      itemProfile?.phone ||
                      itemProfile?.phone_number ||
                      '—';

                    return (
                      <tr
                        key={submission.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {customerName}
                          </div>

                          <div className="text-sm text-gray-500">
                            {phone}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                          {roleLabel(
                            submission.target_role
                          )}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {formatDate(
                            submission.submitted_at ||
                              submission.created_at
                          )}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                              submission.status
                            )}`}
                          >
                            {statusLabel(
                              submission.status
                            )}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openReview(
                                submission
                              )
                            }
                            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  KYC Review
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {getCustomerName(profile)} ·{' '}
                  {roleLabel(
                    selected.target_role
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReview}
                disabled={actionLoading}
                className="text-2xl leading-none text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* Identity Information */}
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                  Customer Information
                </h3>

                <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3">
                  <Info
                    label="Full name"
                    value={getCustomerName(
                      profile
                    )}
                  />

                  <Info
                    label="Phone"
                    value={
                      profile?.phone ||
                      profile?.phone_number ||
                      '—'
                    }
                  />

                  <Info
                    label="Email"
                    value={
                      profile?.email || '—'
                    }
                  />

                  <Info
                    label="Date of birth"
                    value={
                      profile?.date_of_birth ||
                      '—'
                    }
                  />

                  <Info
                    label="Nationality"
                    value={
                      profile?.nationality ||
                      '—'
                    }
                  />

                  <Info
                    label="Country"
                    value={
                      profile?.country ||
                      '—'
                    }
                  />

                  <Info
                    label="City"
                    value={
                      profile?.city || '—'
                    }
                  />

                  <Info
                    label="Address"
                    value={
                      profile?.residential_address ||
                      profile?.address ||
                      '—'
                    }
                  />

                  <Info
                    label="Current KYC status"
                    value={
                      profile?.kyc_status ||
                      '—'
                    }
                  />
                </div>
              </section>

              {/* Driver Information */}
              {selected.target_role ===
                'driver' && (
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                    Driver Information
                  </h3>

                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3">
                    <Info
                      label="Vehicle type"
                      value={
                        profile?.vehicle_type ||
                        '—'
                      }
                    />

                    <Info
                      label="Plate number"
                      value={
                        profile?.plate_number ||
                        '—'
                      }
                    />

                    <Info
                      label="Driver license number"
                      value={
                        profile?.driver_license_no ||
                        '—'
                      }
                    />
                  </div>
                </section>
              )}

              {/* Merchant Information */}
              {selected.target_role ===
                'merchant' && (
                <section>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                    Business Information
                  </h3>

                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3">
                    <Info
                      label="Business name"
                      value={
                        profile?.business_name ||
                        '—'
                      }
                    />

                    <Info
                      label="Business type"
                      value={
                        profile?.business_type ||
                        '—'
                      }
                    />

                    <Info
                      label="Tax ID"
                      value={
                        profile?.tax_id || '—'
                      }
                    />
                  </div>
                </section>
              )}

              {/* Documents */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                    Submitted Documents
                  </h3>

                  <span className="text-xs text-gray-500">
                    Verify documents before approving.
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DocumentCard
                    title="ID Card"
                    url={profile?.id_card_url}
                  />

                  <DocumentCard
                    title="Selfie"
                    url={profile?.selfie_url}
                  />

                  {selected.target_role ===
                    'driver' && (
                    <DocumentCard
                      title="Driver License"
                      url={
                        profile?.license_doc_url
                      }
                    />
                  )}

                  {selected.target_role ===
                    'merchant' && (
                    <DocumentCard
                      title="Business Document"
                      url={
                        profile?.business_doc_url
                      }
                    />
                  )}
                </div>
              </section>

              {/* Previous reason */}
              {selected.rejection_reason && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm font-semibold text-yellow-800">
                    Previous review reason
                  </p>

                  <p className="mt-1 text-sm text-yellow-700">
                    {selected.rejection_reason}
                  </p>
                </div>
              )}

              {/* Decision */}
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Admin Decision
                </h3>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DecisionButton
                    active={
                      decision === 'approved'
                    }
                    onClick={() =>
                      setDecision(
                        'approved'
                      )
                    }
                    title="Approve KYC"
                    description="Customer passes KYC review."
                  />

                  <DecisionButton
                    active={
                      decision === 'rejected'
                    }
                    onClick={() =>
                      setDecision(
                        'rejected'
                      )
                    }
                    title="Reject"
                    description="Permanently reject this submission."
                  />

                  <DecisionButton
                    active={
                      decision ===
                      'resubmission_required'
                    }
                    onClick={() =>
                      setDecision(
                        'resubmission_required'
                      )
                    }
                    title="Request Resubmission"
                    description="Customer must submit corrected information."
                  />
                </div>

                {decision !== 'approved' && (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      Reason
                      <span className="ml-1 text-red-600">
                        *
                      </span>
                    </label>

                    <textarea
                      value={reason}
                      onChange={(event) =>
                        setReason(
                          event.target.value
                        )
                      }
                      rows={4}
                      placeholder={
                        decision === 'rejected'
                          ? 'Explain why this KYC submission is being rejected...'
                          : 'Explain what the customer needs to correct or resubmit...'
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </section>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReview}
                disabled={actionLoading}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitDecision}
                disabled={
                  actionLoading ||
                  (decision !== 'approved' &&
                    !reason.trim())
                }
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading
                  ? 'Processing...'
                  : decision === 'approved'
                  ? 'Approve KYC'
                  : decision === 'rejected'
                  ? 'Reject KYC'
                  : 'Request Resubmission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-gray-900">
        {value}
      </p>
    </div>
  );
}

function DocumentCard({
  title,
  url,
}: {
  title: string;
  url: string | null | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-900">
          {title}
        </h4>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Open
          </a>
        )}
      </div>

      {url ? (
        <div className="bg-gray-100 p-3">
          <img
            src={url}
            alt={title}
            className="max-h-80 w-full rounded-lg object-contain"
            onError={(event) => {
              event.currentTarget.style.display =
                'none';
            }}
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">
          No document submitted
        </div>
      )}
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? 'border-gray-900 bg-white shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-3 rounded-full border ${
            active
              ? 'border-gray-900 bg-gray-900'
              : 'border-gray-300 bg-white'
          }`}
        />

        <span className="text-sm font-bold text-gray-900">
          {title}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-gray-500">
        {description}
      </p>
    </button>
  );
}