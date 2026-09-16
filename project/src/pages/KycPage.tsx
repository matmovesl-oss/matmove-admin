import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type KycDecision = 'approved' | 'rejected' | 'resubmission_required';
type KycStatus = 'pending' | 'approved' | 'rejected' | 'resubmission_required';
type TargetRole = 'driver' | 'merchant';

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
  operating_region: string | null;
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
  created_at: string | null;
  profile: Profile | null;
};

type KycDocument = {
  id: string;
  submission_id: string | null;
  document_type: string;
  storage_path: string;
  file_name: string | null;
  file_size_bytes: number | null;
  created_at: string | null;
  signed_url?: string | null;
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

const formatFileSize = (bytes: number | null) => {
  if (!bytes || bytes <= 0) return '';

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getCustomerName = (profile: Profile | null) => {
  if (!profile) {
    return 'Unknown customer';
  }

  const fullName =
    profile.full_name?.trim() ||
    `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();

  return fullName || 'Unnamed customer';
};

const getDocumentLabel = (
  documentType: string,
  role: TargetRole | null
) => {
  const type = documentType.toLowerCase();

  if (type.includes('selfie')) {
    return 'Selfie';
  }

  if (
    role === 'driver' &&
    (type.includes('license') ||
      type.includes('id_front') ||
      type.includes('id'))
  ) {
    return "Driver's License";
  }

  if (role === 'merchant') {
    if (
      type.includes('business') ||
      type.includes('registration')
    ) {
      return 'Business Registration';
    }

    if (type.includes('id')) {
      return 'Identity Document';
    }
  }

  if (type.includes('passport')) {
    return 'Passport';
  }

  if (type.includes('id')) {
    return 'Identity Document';
  }

  return documentType || 'KYC Document';
};

export function KycPage() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<'all' | KycStatus>('all');
  const [roleFilter, setRoleFilter] =
    useState<'all' | TargetRole>('all');

  const [selected, setSelected] =
    useState<KycSubmission | null>(null);

  const [documents, setDocuments] = useState<KycDocument[]>([]);

  const [decision, setDecision] =
    useState<KycDecision>('approved');

  const [reason, setReason] = useState('');

  const loadSubmissions = async (silent = false) => {
    if (!supabase) {
      setError('Supabase is not configured.');

      if (!silent) {
        setLoading(false);
      }

      return;
    }

    if (!silent) {
      setLoading(true);
    }

    setError(null);

    try {
      /*
       * IMPORTANT:
       * KYC submissions are the source of truth.
       * We no longer manufacture submissions from profiles.
       */
      const {
        data: submissionData,
        error: submissionError,
      } = await supabase
        .from('kyc_submissions')
        .select(
          `
            id,
            profile_id,
            target_role,
            status,
            rejection_reason,
            submitted_at,
            reviewed_at,
            created_at
          `
        )
        .in('target_role', ['driver', 'merchant'])
        .order('submitted_at', { ascending: false });

      if (submissionError) {
        throw submissionError;
      }

      const rawSubmissions = (submissionData ?? []) as KycSubmission[];

      if (rawSubmissions.length === 0) {
        setSubmissions([]);
        return;
      }

      const profileIds = Array.from(
        new Set(
          rawSubmissions
            .map((item) => item.profile_id)
            .filter(Boolean) as string[]
        )
      );

      let profiles: Profile[] = [];

      if (profileIds.length > 0) {
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('*')
          .in('id', profileIds);

        if (profileError) {
          throw profileError;
        }

        profiles = (profileData ?? []) as Profile[];
      }

      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile])
      );

      const normalized = rawSubmissions.map((submission) => ({
        ...submission,
        profile: submission.profile_id
          ? profileMap.get(submission.profile_id) ?? null
          : null,
      }));

      setSubmissions(normalized);
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to load KYC submissions.'
      );
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

      const email =
        profile?.email ||
        '';

      const matchesSearch =
        !query ||
        name.includes(query) ||
        phone.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query);

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

  const loadDocuments = async (
    submission: KycSubmission
  ) => {
    if (!supabase) {
      return;
    }

    setDocuments([]);
    setDocumentsLoading(true);
    setError(null);

    try {
      /*
       * The physical file location comes from:
       *
       * kyc_documents.storage_path
       *
       * NOT from profiles.id_card_url,
       * profiles.selfie_url, etc.
       */
      const {
        data,
        error: documentError,
      } = await supabase
        .from('kyc_documents')
        .select(
          `
            id,
            submission_id,
            document_type,
            storage_path,
            file_name,
            file_size_bytes,
            created_at
          `
        )
        .eq('submission_id', submission.id)
        .order('created_at', {
          ascending: true,
        });

      if (documentError) {
        throw documentError;
      }

      const rawDocuments =
        (data ?? []) as KycDocument[];

      /*
       * kyc-documents is a PRIVATE bucket.
       *
       * We create temporary signed URLs for the
       * authenticated admin instead of exposing
       * public/raw storage URLs.
       */
      const documentsWithUrls: KycDocument[] = [];

      for (const document of rawDocuments) {
        if (!document.storage_path) {
          documentsWithUrls.push({
            ...document,
            signed_url: null,
          });

          continue;
        }

        const {
          data: signedUrlData,
          error: signedUrlError,
        } = await supabase.storage
          .from('kyc-documents')
          .createSignedUrl(
            document.storage_path,
            60 * 60
          );

        if (signedUrlError) {
          console.error(
            'Unable to create KYC signed URL:',
            signedUrlError
          );

          documentsWithUrls.push({
            ...document,
            signed_url: null,
          });

          continue;
        }

        documentsWithUrls.push({
          ...document,
          signed_url:
            signedUrlData?.signedUrl ?? null,
        });
      }

      setDocuments(documentsWithUrls);
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to load submitted KYC documents.'
      );
    } finally {
      setDocumentsLoading(false);
    }
  };

  const openReview = async (
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

    await loadDocuments(submission);
  };

  const closeReview = () => {
    if (actionLoading) {
      return;
    }

    setSelected(null);
    setDocuments([]);
    setReason('');
    setDecision('approved');
  };

  const submitDecision = async () => {
    if (!supabase || !selected) {
      return;
    }

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
      /*
       * IMPORTANT:
       * Never directly update profiles.kyc_status here.
       *
       * The secure database function handles:
       * - authorization
       * - kyc_submissions
       * - profiles.kyc_status
       * - reviewer
       * - reviewed_at
       * - rejection reason
       * - admin audit log
       */
      const {
        error: reviewError,
      } = await supabase.rpc(
        'review_kyc_submission',
        {
          p_submission_id: selected.id,
          p_decision: decision,
          p_rejection_reason:
            decision === 'approved'
              ? null
              : reason.trim(),
        }
      );

      if (reviewError) {
        throw reviewError;
      }

      /*
       * Close modal manually because actionLoading is
       * still true at this point.
       */
      setSelected(null);
      setDocuments([]);
      setReason('');
      setDecision('approved');

      await loadSubmissions(true);
    } catch (err: any) {
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
    <AdminLayout
      title="KYC Review"
      subtitle="Review customer identity documents and make secure KYC decisions."
    >
      <div className="mt-6 space-y-6">

        {error && (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>

            <button
              onClick={() => setError(null)}
              className="font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <StatCard
            label="Total"
            value={stats.total}
            className="border-gray-200 bg-white"
            labelClass="text-gray-500"
            valueClass="text-gray-900"
          />

          <StatCard
            label="Pending"
            value={stats.pending}
            className="border-blue-200 bg-blue-50"
            labelClass="text-blue-700"
            valueClass="text-blue-800"
          />

          <StatCard
            label="Approved"
            value={stats.approved}
            className="border-green-200 bg-green-50"
            labelClass="text-green-700"
            valueClass="text-green-800"
          />

          <StatCard
            label="Rejected"
            value={stats.rejected}
            className="border-red-200 bg-red-50"
            labelClass="text-red-700"
            valueClass="text-red-800"
          />

          <StatCard
            label="Resubmission"
            value={stats.resubmission}
            className="border-yellow-200 bg-yellow-50"
            labelClass="text-yellow-700"
            valueClass="text-yellow-800"
          />

        </div>

        {/* Filters */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search name, phone..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as
                    | KycStatus
                    | 'all'
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
                Resubmission
              </option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(
                  e.target.value as
                    | TargetRole
                    | 'all'
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">
                All account types
              </option>
              <option value="driver">
                Driver
              </option>
              <option value="merchant">
                Merchant
              </option>
            </select>

            <button
              onClick={() =>
                loadSubmissions(false)
              }
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
                              submission.submitted_at
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

            <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">

                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    KYC Review
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {getCustomerName(profile)}
                    {' · '}
                    {roleLabel(
                      selected.target_role
                    )}
                  </p>
                </div>

                <button
                  onClick={closeReview}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>

              </div>

              <div className="space-y-6 p-6">

                {/* Customer Information */}
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
                        profile?.country || '—'
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
                        label="Operating region"
                        value={
                          profile?.operating_region ||
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

                    {documents.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {documents.length}{' '}
                        document
                        {documents.length === 1
                          ? ''
                          : 's'}
                      </span>
                    )}

                  </div>

                  {documentsLoading ? (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                      Loading secure KYC documents...
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                      No KYC documents were found for this submission.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                      {documents.map(
                        (document) => (
                          <DocumentCard
                            key={document.id}
                            document={
                              document
                            }
                            role={
                              selected.target_role
                            }
                          />
                        )
                      )}

                    </div>
                  )}

                </section>

                {/* Existing rejection reason */}
                {selected.rejection_reason && (
                  <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">

                    <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">
                      Previous Review Reason
                    </p>

                    <p className="mt-2 text-sm text-yellow-900">
                      {
                        selected.rejection_reason
                      }
                    </p>

                  </section>
                )}

                {/* Decision */}
                <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">

                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                    Admin Decision
                  </h3>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">

                    <DecisionButton
                      active={
                        decision ===
                        'approved'
                      }
                      onClick={() =>
                        setDecision(
                          'approved'
                        )
                      }
                      title="Approve KYC"
                      description="Customer passes KYC verification."
                    />

                    <DecisionButton
                      active={
                        decision ===
                        'rejected'
                      }
                      onClick={() =>
                        setDecision(
                          'rejected'
                        )
                      }
                      title="Reject"
                      description="Reject this KYC submission."
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
                      description="Customer must correct their information or documents."
                    />

                  </div>

                  {decision !==
                    'approved' && (
                    <div className="mt-4">

                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Reason{' '}
                        <span className="text-red-600">
                          *
                        </span>
                      </label>

                      <textarea
                        value={reason}
                        onChange={(e) =>
                          setReason(
                            e.target.value
                          )
                        }
                        rows={4}
                        placeholder="Explain why the KYC was rejected or needs resubmission..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />

                    </div>
                  )}

                </section>

              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">

                <button
                  onClick={closeReview}
                  disabled={actionLoading}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={submitDecision}
                  disabled={
                    actionLoading ||
                    (decision !==
                      'approved' &&
                      !reason.trim())
                  }
                  className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {actionLoading
                    ? 'Processing...'
                    : 'Submit Decision'}
                </button>

              </div>

            </div>

          </div>
        )}

      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  className,
  labelClass,
  valueClass,
}: {
  label: string;
  value: number;
  className: string;
  labelClass: string;
  valueClass: string;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
    >
      <p className={`text-sm ${labelClass}`}>
        {label}
      </p>

      <p
        className={`mt-1 text-2xl font-bold ${valueClass}`}
      >
        {value}
      </p>
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
  document,
  role,
}: {
  document: KycDocument;
  role: TargetRole | null;
}) {
  const title = getDocumentLabel(
    document.document_type,
    role
  );

  const fileName =
    document.file_name ||
    document.storage_path.split('/').pop() ||
    'KYC document';

  const fileSize = formatFileSize(
    document.file_size_bytes
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">

      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">

        <div className="min-w-0">

          <h4 className="text-sm font-semibold text-gray-900">
            {title}
          </h4>

          <p className="mt-1 truncate text-xs text-gray-500">
            {fileName}
            {fileSize
              ? ` · ${fileSize}`
              : ''}
          </p>

        </div>

        {document.signed_url && (
          <a
            href={document.signed_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Open
          </a>
        )}

      </div>

      {document.signed_url ? (
        <div className="bg-gray-100 p-3">

          {isImageFile(fileName) ? (
            <a
              href={document.signed_url}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={document.signed_url}
                alt={title}
                className="max-h-96 w-full rounded-lg object-contain"
              />
            </a>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg bg-white">

              <div className="text-sm font-semibold text-gray-800">
                Document ready
              </div>

              <a
                href={document.signed_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline"
              >
                Open / Download Document
              </a>

            </div>
          )}

        </div>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center bg-gray-50 px-4 text-center">

          <p className="text-sm font-semibold text-gray-700">
            Document could not be opened
          </p>

          <p className="mt-1 text-xs text-gray-500">
            The stored file path may be missing or the
            administrator does not have access to this
            private storage object.
          </p>

        </div>
      )}

    </div>
  );
}

function isImageFile(fileName: string) {
  const extension =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase();

  return [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'bmp',
  ].includes(extension || '');
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