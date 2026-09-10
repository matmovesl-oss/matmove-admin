import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useWallets, useWithdrawals } from '../lib/hooks';
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
  ExternalLink,
  Wallet,
  LockKeyhole,
  UnlockKeyhole,
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  Loader2,
} from 'lucide-react';

type CustomerRole = 'rider' | 'driver' | 'merchant';

type AccountRole =
  | CustomerRole
  | 'admin'
  | 'corporate'
  | string;

type ProfileKycStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'resubmission_required'
  | string;

type OperationalKycStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

type KycDecision =
  | 'approved'
  | 'rejected'
  | 'resubmission_required';

interface UserProfile {
  id: string;
  email?: string;
  full_name?: string;
  phone_number?: string;
  phone?: string;
  role?: AccountRole;
  kyc_status?: ProfileKycStatus;
  created_at: string;
  updated_at?: string;

  address?: string;
  residential_address?: string;
  city?: string;

  vehicle_type?: string;
  plate_number?: string;
  driver_license_no?: string;

  business_name?: string;
  business_type?: string;
  tax_id?: string;

  [key: string]: unknown;
}

interface KycSubmission {
  id: string;
  profile_id: string;
  target_role?: CustomerRole | string;
  status?: ProfileKycStatus;
  rejection_reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
  reviewer_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface KycDocument {
  id: string;
  submission_id: string;
  document_type: string;
  file_name?: string;
  storage_path: string;
  file_size_bytes?: number;
  created_at?: string;
}

interface KycReviewResult {
  submission_id: string;
  profile_id: string;
  target_role: string;
  previous_status: string;
  new_status: string;
  reviewed_by: string;
  reviewed_at: string;
}

type Filter =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'all';

interface PreviewDocument {
  url: string;
  title: string;
  fileName?: string;
}

function normalizeRole(
  role?: string
): AccountRole {
  if (!role) return 'rider';

  if (role === 'vendor') return 'merchant';
  if (role === 'client') return 'rider';

  return role;
}

function roleLabel(role?: string) {
  const normalized =
    normalizeRole(role);

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
      return (
        normalized.charAt(0).toUpperCase() +
        normalized.slice(1)
      );
  }
}

function isCustomerRole(
  role?: string
): role is CustomerRole {
  const normalized =
    normalizeRole(role);

  return (
    normalized === 'rider' ||
    normalized === 'driver' ||
    normalized === 'merchant'
  );
}

function operationalStatus(
  status?: string
): OperationalKycStatus {
  if (status === 'approved') {
    return 'approved';
  }

  if (status === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

function statusLabel(
  status?: string
) {
  switch (
    operationalStatus(status)
  ) {
    case 'approved':
      return 'Approved';

    case 'rejected':
      return 'Declined';

    default:
      return 'Pending';
  }
}

function statusClasses(
  status?: string
) {
  switch (
    operationalStatus(status)
  ) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';

    case 'rejected':
      return 'bg-red-100 text-red-700 border-red-200';

    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

function formatDate(
  value?: string
) {
  if (!value) return '—';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date.toLocaleDateString(
    'en-GB',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  );
}

function formatDateTime(
  value?: string
) {
  if (!value) return '—';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date.toLocaleString(
    'en-GB',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

function getLatestSubmission(
  submissions: KycSubmission[],
  userId: string
) {
  return submissions
    .filter(
      (submission) =>
        submission.profile_id ===
        userId
    )
    .sort(
      (a, b) => {
        const aDate =
          new Date(
            a.submitted_at ||
              a.created_at ||
              0
          ).getTime();

        const bDate =
          new Date(
            b.submitted_at ||
              b.created_at ||
              0
          ).getTime();

        return bDate - aDate;
      }
    )[0] || null;
}

function getEffectiveKycStatus(
  profile?: UserProfile | null,
  submission?: KycSubmission | null
) {
  return operationalStatus(
    submission?.status ||
      profile?.kyc_status
  );
}

function humanizeDocumentType(
  value: string
) {
  const normalized =
    value.replace(
      /_/g,
      ' '
    );

  return normalized
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function formatFileSize(
  bytes?: number
) {
  if (
    !bytes ||
    bytes <= 0
  ) {
    return 'Size unavailable';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function formatSleAmount(
  value: number
) {
  return `SLE ${new Intl.NumberFormat(
    'en-US',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  )}`;
}

function formatUsdAmount(
  value: number
) {
  return `USD ${new Intl.NumberFormat(
    'en-US',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value || 0)
  )}`;
}

export function AdminDashboard() {
  /*
   * ------------------------------------------------------------------------
   * LIVE FINANCIAL CONTROL CENTER
   * ------------------------------------------------------------------------
   *
   * These hooks load authoritative customer-wallet and withdrawal records
   * from Supabase. They do not create financial values in the browser.
   */
  const {
    wallets,
    loading: walletsLoading,
    error: walletsError,
    refetch: refetchWallets,
  } = useWallets();

  const {
    items: withdrawals,
    loading: withdrawalsLoading,
    error: withdrawalsError,
    refetch: refetchWithdrawals,
  } = useWithdrawals();

  const [
    profiles,
    setProfiles,
  ] = useState<UserProfile[]>(
    []
  );

  const [
    submissions,
    setSubmissions,
  ] = useState<KycSubmission[]>(
    []
  );

  const [
    documents,
    setDocuments,
  ] = useState<KycDocument[]>(
    []
  );

  const [
    selectedUser,
    setSelectedUser,
  ] =
    useState<UserProfile | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    filter,
    setFilter,
  ] = useState<Filter>(
    'pending'
  );

  const [
    searchTerm,
    setSearchTerm,
  ] = useState('');

  const [
    previewDocument,
    setPreviewDocument,
  ] =
    useState<PreviewDocument | null>(
      null
    );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    rejectionReason,
    setRejectionReason,
  ] = useState('');

  const [
    showRejectDialog,
    setShowRejectDialog,
  ] = useState(false);

  const [
    documentUrls,
    setDocumentUrls,
  ] = useState<
    Record<string, string>
  >({});

  const [
    financialRefreshing,
    setFinancialRefreshing,
  ] = useState(false);

  const fetchProfiles = useCallback(
    async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const [
          profileResponse,
          submissionResponse,
          documentResponse,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .order(
              'created_at',
              {
                ascending: false,
              }
            ),

          supabase
            .from('kyc_submissions')
            .select('*')
            .order(
              'created_at',
              {
                ascending: false,
              }
            ),

          supabase
            .from('kyc_documents')
            .select(
              `
                id,
                submission_id,
                document_type,
                file_name,
                storage_path,
                file_size_bytes,
                created_at
              `
            )
            .order(
              'created_at',
              {
                ascending: false,
              }
            ),
        ]);

        if (
          profileResponse.error
        ) {
          throw new Error(
            `Unable to load customer profiles: ${profileResponse.error.message}`
          );
        }

        if (
          submissionResponse.error
        ) {
          throw new Error(
            `Unable to load KYC submissions: ${submissionResponse.error.message}`
          );
        }

        if (
          documentResponse.error
        ) {
          throw new Error(
            `Unable to load KYC documents: ${documentResponse.error.message}`
          );
        }

        const normalizedProfiles =
          (
            (profileResponse.data ||
              []) as UserProfile[]
          )
            .map(
              (
                profile
              ) => ({
                ...profile,
                role: normalizeRole(
                  profile.role
                ),
              })
            )
            .filter(
              (
                profile
              ) =>
                isCustomerRole(
                  profile.role
                )
            );

        const normalizedSubmissions =
          (
            submissionResponse.data ||
            []
          ) as KycSubmission[];

        const normalizedDocuments =
          (
            documentResponse.data ||
            []
          ) as KycDocument[];

        setProfiles(
          normalizedProfiles
        );

        setSubmissions(
          normalizedSubmissions
        );

        setDocuments(
          normalizedDocuments
        );

        setSelectedUser(
          (current) => {
            if (current) {
              const refreshed =
                normalizedProfiles.find(
                  (
                    profile
                  ) =>
                    profile.id ===
                    current.id
                );

              if (refreshed) {
                return refreshed;
              }
            }

            return (
              normalizedProfiles[0] ||
              null
            );
          }
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load MatMove verification records.'
        );

        setProfiles([]);
        setSubmissions([]);
        setDocuments([]);
        setSelectedUser(
          null
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    const channel =
      supabase
        .channel(
          'admin-kyc-live-data'
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles',
          },
          () => {
            void fetchProfiles();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'kyc_submissions',
          },
          () => {
            void fetchProfiles();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'kyc_documents',
          },
          () => {
            void fetchProfiles();
          }
        )
        .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [fetchProfiles]);

  const handleFinancialRefresh =
    async () => {
      setFinancialRefreshing(
        true
      );

      try {
        await Promise.all([
          refetchWallets(),
          refetchWithdrawals(),
        ]);
      } finally {
        setFinancialRefreshing(
          false
        );
      }
    };

  /*
   * ------------------------------------------------------------------------
   * FINANCIAL SUMMARY
   * ------------------------------------------------------------------------
   */

  const financialSummary =
    useMemo(() => {
      const result = {
        sleBalance: 0,
        sleReserved: 0,
        sleAvailable: 0,

        usdBalance: 0,
        usdReserved: 0,
        usdAvailable: 0,

        activeWallets: 0,
        frozenWallets: 0,

        pendingWithdrawals: 0,
        pendingWithdrawalSle: 0,
        pendingWithdrawalUsd: 0,

        processingWithdrawals: 0,
        processingWithdrawalSle: 0,
        processingWithdrawalUsd: 0,

        completedWithdrawals: 0,
        failedWithdrawals: 0,
      };

      wallets.forEach(
        (wallet) => {
          const balance =
            Number(
              wallet.balance || 0
            );

          const reserved =
            Number(
              wallet.reserved_balance ||
                0
            );

          const available =
            Math.max(
              0,
              Number(
                wallet.available_balance ??
                  balance -
                    reserved
              )
            );

          if (
            wallet.currency ===
            'SLE'
          ) {
            result.sleBalance +=
              balance;

            result.sleReserved +=
              reserved;

            result.sleAvailable +=
              available;
          }

          if (
            wallet.currency ===
            'USD'
          ) {
            result.usdBalance +=
              balance;

            result.usdReserved +=
              reserved;

            result.usdAvailable +=
              available;
          }

          if (
            wallet.is_active
          ) {
            result.activeWallets +=
              1;
          } else {
            result.frozenWallets +=
              1;
          }
        }
      );

      withdrawals.forEach(
        (withdrawal) => {
          const status =
            String(
              withdrawal.status
            );

          const amount =
            Number(
              withdrawal.amount ||
                0
            );

          const currency =
            (
              withdrawal as {
                currency?: string;
              }
            ).currency ||
            'SLE';

          if (
            status === 'pending'
          ) {
            result.pendingWithdrawals +=
              1;

            if (
              currency ===
              'USD'
            ) {
              result.pendingWithdrawalUsd +=
                amount;
            } else {
              result.pendingWithdrawalSle +=
                amount;
            }
          }

          if (
            status ===
            'processing'
          ) {
            result.processingWithdrawals +=
              1;

            if (
              currency ===
              'USD'
            ) {
              result.processingWithdrawalUsd +=
                amount;
            } else {
              result.processingWithdrawalSle +=
                amount;
            }
          }

          if (
            status ===
            'completed'
          ) {
            result.completedWithdrawals +=
              1;
          }

          if (
            status ===
            'failed'
          ) {
            result.failedWithdrawals +=
              1;
          }
        }
      );

      return result;
    }, [
      wallets,
      withdrawals,
    ]);

  const getSubmissionForUser =
    useCallback(
      (
        userId: string
      ) =>
        getLatestSubmission(
          submissions,
          userId
        ),
      [submissions]
    );

  const getDocumentsForUser =
    useCallback(
      (
        userId: string
      ) => {
        const submission =
          getLatestSubmission(
            submissions,
            userId
          );

        if (!submission) {
          return [];
        }

        return documents.filter(
          (document) =>
            document.submission_id ===
            submission.id
        );
      },
      [
        documents,
        submissions,
      ]
    );

  const createDocumentUrls =
    useCallback(
      async (
        customerDocuments: KycDocument[]
      ) => {
        if (
          customerDocuments.length ===
          0
        ) {
          setDocumentUrls({});
          return;
        }

        const entries =
          await Promise.all(
            customerDocuments.map(
              async (
                document
              ) => {
                const {
                  data,
                  error,
                } =
                  await supabase.storage
                    .from(
                      'kyc-documents'
                    )
                    .createSignedUrl(
                      document.storage_path,
                      3600
                    );

                if (error) {
                  console.warn(
                    `Unable to create document preview URL for ${document.storage_path}:`,
                    error.message
                  );

                  return null;
                }

                return [
                  document.id,
                  data.signedUrl,
                ] as const;
              }
            )
          );

        const nextUrls: Record<
          string,
          string
        > = {};

        entries.forEach(
          (entry) => {
            if (entry) {
              nextUrls[
                entry[0]
              ] = entry[1];
            }
          }
        );

        setDocumentUrls(
          nextUrls
        );
      },
      []
    );

  useEffect(() => {
    if (!selectedUser) {
      setDocumentUrls({});
      return;
    }

    void createDocumentUrls(
      getDocumentsForUser(
        selectedUser.id
      )
    );
  }, [
    selectedUser,
    getDocumentsForUser,
    createDocumentUrls,
  ]);

  const performKycReview =
    async (
      userId: string,
      decision: KycDecision,
      reason?: string
    ) => {
      const submission =
        getSubmissionForUser(
          userId
        );

      if (!submission) {
        setErrorMessage(
          'No KYC submission exists for this customer. The review cannot be completed.'
        );
        return;
      }

      if (
        (
          decision ===
            'rejected' ||
          decision ===
            'resubmission_required'
        ) &&
        !reason?.trim()
      ) {
        setErrorMessage(
          'A reason is required for this KYC decision.'
        );
        return;
      }

      setActionLoading(true);
      setErrorMessage('');

      try {
        const {
          data,
          error,
        } =
          await supabase.rpc(
            'review_kyc_submission',
            {
              p_submission_id:
                submission.id,
              p_decision:
                decision,
              p_rejection_reason:
                reason?.trim() ||
                null,
            }
          );

        if (error) {
          throw new Error(
            error.message
          );
        }

        const result =
          Array.isArray(data)
            ? (data[0] as
                | KycReviewResult
                | undefined)
            : (data as
                | KycReviewResult
                | null);

        await fetchProfiles();

        if (result) {
          setSelectedUser(
            (current) =>
              current?.id ===
              userId
                ? profiles.find(
                    (
                      profile
                    ) =>
                      profile.id ===
                      userId
                  ) ||
                  current
                : current
          );
        }

        setShowRejectDialog(
          false
        );

        setRejectionReason('');
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

  const handleApprove =
    async () => {
      if (!selectedUser) {
        return;
      }

      await performKycReview(
        selectedUser.id,
        'approved'
      );
    };

  const handleReject =
    async () => {
      if (!selectedUser) {
        return;
      }

      if (
        !rejectionReason.trim()
      ) {
        setErrorMessage(
          'Please provide a reason before declining this application.'
        );
        return;
      }

      await performKycReview(
        selectedUser.id,
        'rejected',
        rejectionReason
      );
    };

  const statistics =
    useMemo(() => {
      const counts = {
        total: profiles.length,
        pending: 0,
        approved: 0,
        rejected: 0,
        riders: 0,
        drivers: 0,
        merchants: 0,
      };

      profiles.forEach(
        (profile) => {
          const status =
            getEffectiveKycStatus(
              profile,
              getLatestSubmission(
                submissions,
                profile.id
              )
            );

          const role =
            normalizeRole(
              profile.role
            );

          if (
            status === 'pending'
          ) {
            counts.pending += 1;
          }

          if (
            status === 'approved'
          ) {
            counts.approved += 1;
          }

          if (
            status === 'rejected'
          ) {
            counts.rejected += 1;
          }

          if (role === 'rider') {
            counts.riders += 1;
          }

          if (role === 'driver') {
            counts.drivers += 1;
          }

          if (
            role === 'merchant'
          ) {
            counts.merchants += 1;
          }
        }
      );

      return counts;
    }, [
      profiles,
      submissions,
    ]);

  const filteredProfiles =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      return profiles.filter(
        (profile) => {
          const submission =
            getLatestSubmission(
              submissions,
              profile.id
            );

          const status =
            getEffectiveKycStatus(
              profile,
              submission
            );

          if (
            filter !== 'all' &&
            status !== filter
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          const phone =
            profile.phone ||
            profile.phone_number ||
            '';

          return [
            profile.full_name,
            profile.email,
            phone,
            profile.business_name,
            profile.plate_number,
            profile.driver_license_no,
          ]
            .filter(Boolean)
            .some(
              (value) =>
                String(value)
                  .toLowerCase()
                  .includes(
                    search
                  )
            );
        }
      );
    }, [
      profiles,
      submissions,
      filter,
      searchTerm,
    ]);

  const selectedSubmission =
    selectedUser
      ? getSubmissionForUser(
          selectedUser.id
        )
      : null;

  const selectedDocuments =
    selectedUser
      ? getDocumentsForUser(
          selectedUser.id
        )
      : [];

  const selectedKycStatus =
    getEffectiveKycStatus(
      selectedUser,
      selectedSubmission
    );

  const selectedRole =
    selectedUser
      ? normalizeRole(
          selectedUser.role
        )
      : null;

  const selectedPhone =
    selectedUser?.phone ||
    selectedUser?.phone_number ||
    '';

  const selectStatus =
    (nextFilter: Filter) => {
      setFilter(nextFilter);
      setSelectedUser(
        null
      );
    };

  const financialError =
    walletsError ||
    withdrawalsError;

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans h-full overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-start gap-6 sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck
                size={21}
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                MatMove Admin Control Center
              </h1>

              <p className="text-sm text-slate-500 mt-1">
                Live operational, wallet and
                customer verification controls.
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
              onChange={(event) =>
                setSearchTerm(
                  event.target.value
                )
              }
              className="pl-10 pr-4 py-2.5 bg-slate-100 border border-transparent rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 focus:bg-white outline-none w-64 transition"
            />
          </div>

          <button
            onClick={() => {
              void Promise.all([
                fetchProfiles(),
                handleFinancialRefresh(),
              ]);
            }}
            disabled={
              loading ||
              financialRefreshing
            }
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-sm font-semibold rounded-xl transition"
          >
            <RefreshCw
              size={16}
              className={
                loading ||
                financialRefreshing
                  ? 'animate-spin'
                  : ''
              }
            />

            Refresh
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* LIVE FINANCIAL CONTROL CENTER                                      */}
      {/* ------------------------------------------------------------------ */}

      <div className="px-8 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet
                size={18}
                className="text-indigo-600"
              />

              <h2 className="text-lg font-bold text-slate-900">
                Financial Control Center
              </h2>

              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                <Activity size={11} />
                Live
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-1">
              Customer wallet positions and payout
              obligations. MatMove treasury balances are
              accounted for separately.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void handleFinancialRefresh()
            }
            disabled={
              financialRefreshing
            }
            className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            {financialRefreshing ? (
              <Loader2
                size={14}
                className="animate-spin"
              />
            ) : (
              <RefreshCw size={14} />
            )}

            Refresh financials
          </button>
        </div>

        {financialError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle
              size={17}
              className="text-red-600 mt-0.5 shrink-0"
            />

            <div>
              <p className="text-xs font-bold text-red-800">
                Live financial data requires
                attention
              </p>

              <p className="text-xs text-red-700 mt-1">
                {financialError}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FinancialCard
            label="SLE Wallet Balance"
            value={formatSleAmount(
              financialSummary.sleBalance
            )}
            secondary={`Available ${formatSleAmount(
              financialSummary.sleAvailable
            )}`}
            icon={
              <CircleDollarSign size={19} />
            }
            loading={
              walletsLoading
            }
          />

          <FinancialCard
            label="USD Wallet Balance"
            value={formatUsdAmount(
              financialSummary.usdBalance
            )}
            secondary={`Available ${formatUsdAmount(
              financialSummary.usdAvailable
            )}`}
            icon={
              <CircleDollarSign size={19} />
            }
            loading={
              walletsLoading
            }
          />

          <FinancialCard
            label="Reserved SLE"
            value={formatSleAmount(
              financialSummary.sleReserved
            )}
            secondary="Held against outstanding obligations"
            icon={
              <LockKeyhole size={19} />
            }
            tone="amber"
            loading={
              walletsLoading
            }
          />

          <FinancialCard
            label="Reserved USD"
            value={formatUsdAmount(
              financialSummary.usdReserved
            )}
            secondary="Held against outstanding obligations"
            icon={
              <LockKeyhole size={19} />
            }
            tone="amber"
            loading={
              walletsLoading
            }
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-4">
          <MiniFinancialCard
            label="Active Wallets"
            value={
              financialSummary.activeWallets
            }
            icon={
              <UnlockKeyhole size={15} />
            }
            loading={
              walletsLoading
            }
          />

          <MiniFinancialCard
            label="Frozen Wallets"
            value={
              financialSummary.frozenWallets
            }
            icon={
              <LockKeyhole size={15} />
            }
            tone="red"
            loading={
              walletsLoading
            }
          />

          <MiniFinancialCard
            label="Pending Payouts"
            value={
              financialSummary.pendingWithdrawals
            }
            icon={
              <Clock3 size={15} />
            }
            tone="amber"
            loading={
              withdrawalsLoading
            }
          />

          <MiniFinancialCard
            label="Pending SLE"
            value={formatSleAmount(
              financialSummary.pendingWithdrawalSle
            )}
            icon={
              <ArrowUpFromLine size={15} />
            }
            tone="amber"
            loading={
              withdrawalsLoading
            }
          />

          <MiniFinancialCard
            label="Pending USD"
            value={formatUsdAmount(
              financialSummary.pendingWithdrawalUsd
            )}
            icon={
              <ArrowUpFromLine size={15} />
            }
            tone="amber"
            loading={
              withdrawalsLoading
            }
          />

          <MiniFinancialCard
            label="Processing"
            value={
              financialSummary.processingWithdrawals
            }
            icon={
              <Loader2 size={15} />
            }
            tone="blue"
            loading={
              withdrawalsLoading
            }
          />

          <MiniFinancialCard
            label="Completed"
            value={
              financialSummary.completedWithdrawals
            }
            icon={
              <CheckCircle2 size={15} />
            }
            tone="green"
            loading={
              withdrawalsLoading
            }
          />

          <MiniFinancialCard
            label="Failed"
            value={
              financialSummary.failedWithdrawals
            }
            icon={
              <XCircle size={15} />
            }
            tone="red"
            loading={
              withdrawalsLoading
            }
          />
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck
            size={14}
            className="text-indigo-500 shrink-0"
          />

          <span>
            Financial figures above are derived from
            live customer-wallet and withdrawal records.
            No browser-generated balances are used.
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KYC CONTROL CENTER                                                 */}
      {/* ------------------------------------------------------------------ */}

      <div className="px-8 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck
            size={18}
            className="text-indigo-600"
          />

          <h2 className="text-lg font-bold text-slate-900">
            KYC & Customer Verification
          </h2>

          <span className="text-xs text-slate-400">
            Live verification records
          </span>
        </div>

        <div className="grid grid-cols-6 gap-4">
          <SummaryCard
            label="Total Customers"
            value={
              statistics.total
            }
            icon={
              <Users size={18} />
            }
            onClick={() =>
              selectStatus('all')
            }
            active={
              filter === 'all'
            }
          />

          <SummaryCard
            label="Pending KYC"
            value={
              statistics.pending
            }
            icon={
              <Clock3 size={18} />
            }
            highlight={
              statistics.pending >
              0
            }
            onClick={() =>
              selectStatus(
                'pending'
              )
            }
            active={
              filter === 'pending'
            }
          />

          <SummaryCard
            label="Approved"
            value={
              statistics.approved
            }
            icon={
              <CheckCircle2
                size={18}
              />
            }
            onClick={() =>
              selectStatus(
                'approved'
              )
            }
            active={
              filter === 'approved'
            }
          />

          <SummaryCard
            label="Declined"
            value={
              statistics.rejected
            }
            icon={
              <XCircle size={18} />
            }
            onClick={() =>
              selectStatus(
                'rejected'
              )
            }
            active={
              filter === 'rejected'
            }
          />

          <SummaryCard
            label="Drivers"
            value={
              statistics.drivers
            }
            icon={
              <Truck size={18} />
            }
            onClick={() => {
              setFilter('all');
              setSearchTerm('');
            }}
          />

          <SummaryCard
            label="Merchants"
            value={
              statistics.merchants
            }
            icon={
              <Store size={18} />
            }
            onClick={() => {
              setFilter('all');
              setSearchTerm('');
            }}
          />
        </div>

        <p className="text-[11px] text-slate-400 mt-2 ml-1">
          Summary figures are calculated from
          live Supabase records. Click a card to
          open its corresponding queue.
        </p>
      </div>

      {errorMessage && (
        <div className="mx-8 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3 text-red-700">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <div className="flex-1">
            <p className="text-sm font-semibold">
              Admin action requires
              attention
            </p>

            <p className="text-xs mt-1">
              {errorMessage}
            </p>
          </div>

          <button
            onClick={() =>
              setErrorMessage('')
            }
            className="text-red-400 hover:text-red-600"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="flex-1 p-8 grid grid-cols-12 gap-6 overflow-hidden">
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
                [
                  'pending',
                  'approved',
                  'rejected',
                  'all',
                ] as const
              ).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() =>
                      selectStatus(
                        tab
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                      filter === tab
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {tab ===
                    'rejected'
                      ? 'Declined'
                      : tab ===
                        'pending'
                        ? 'Pending'
                        : tab ===
                          'approved'
                          ? 'Approved'
                          : 'All'}
                  </button>
                )
              )}
            </div>

            <div className="flex justify-between items-center mt-3">
              <span className="text-xs text-slate-400">
                Showing{' '}
                {
                  filteredProfiles.length
                }{' '}
                of{' '}
                {
                  profiles.length
                }
              </span>

              <span className="text-xs font-bold text-slate-500">
                {
                  statistics.riders
                }{' '}
                riders ·{' '}
                {
                  statistics.drivers
                }{' '}
                drivers ·{' '}
                {
                  statistics.merchants
                }{' '}
                merchants
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
            ) : filteredProfiles.length ===
              0 ? (
              <div className="p-8 text-center">
                <ShieldCheck
                  size={38}
                  className="mx-auto mb-3 text-slate-200"
                />

                <p className="font-semibold text-slate-600 text-sm">
                  No applications found
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  There are no backend records
                  matching this selection.
                </p>
              </div>
            ) : (
              filteredProfiles.map(
                (user) => {
                  const role =
                    normalizeRole(
                      user.role
                    );

                  const submission =
                    getSubmissionForUser(
                      user.id
                    );

                  const status =
                    getEffectiveKycStatus(
                      user,
                      submission
                    );

                  const phone =
                    user.phone ||
                    user.phone_number ||
                    'No phone';

                  return (
                    <button
                      key={
                        user.id
                      }
                      onClick={() =>
                        setSelectedUser(
                          user
                        )
                      }
                      className={`w-full text-left p-4 cursor-pointer transition flex items-center justify-between ${
                        selectedUser?.id ===
                        user.id
                          ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                          {(
                            user.full_name ||
                            user.email ||
                            'U'
                          )
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {user.full_name ||
                              'Incomplete Profile'}
                          </div>

                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {phone}
                          </div>

                          <div className="text-[10px] text-slate-400 mt-1">
                            {user.email ||
                              'No email'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase block mb-1">
                          {roleLabel(
                            role
                          )}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${statusClasses(
                            status
                          )}`}
                        >
                          {statusLabel(
                            status
                          )}
                        </span>
                      </div>
                    </button>
                  );
                }
              )
            )}
          </div>
        </div>

        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-y-auto">
          {selectedUser ? (
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-5 gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    {selectedRole ===
                    'driver' ? (
                      <Truck
                        size={26}
                      />
                    ) : selectedRole ===
                      'merchant' ? (
                      <Store
                        size={26}
                      />
                    ) : (
                      <User
                        size={26}
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold text-slate-900">
                        {selectedUser.full_name ||
                          'No Name Provided'}
                      </h2>

                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase">
                        {roleLabel(
                          selectedRole ||
                            undefined
                        )}
                      </span>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${statusClasses(
                          selectedKycStatus
                        )}`}
                      >
                        {statusLabel(
                          selectedKycStatus
                        )}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 mt-2 flex items-center gap-2 flex-wrap">
                      <span>
                        {selectedUser.email ||
                          'No email'}
                      </span>

                      <span className="text-slate-300">
                        •
                      </span>

                      <span>
                        {selectedPhone ||
                          'No phone'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={
                      actionLoading ||
                      selectedKycStatus ===
                        'rejected'
                    }
                    onClick={() =>
                      setShowRejectDialog(
                        true
                      )
                    }
                    className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <XCircle
                      size={16}
                    />
                    Decline
                  </button>

                  <button
                    disabled={
                      actionLoading ||
                      selectedKycStatus ===
                        'approved'
                    }
                    onClick={
                      handleApprove
                    }
                    className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition"
                  >
                    {actionLoading ? (
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <CheckCircle2
                        size={16}
                      />
                    )}

                    {selectedKycStatus ===
                    'approved'
                      ? 'Approved'
                      : 'Approve'}
                  </button>
                </div>
              </div>

              <div
                className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                  selectedKycStatus ===
                  'approved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : selectedKycStatus ===
                      'rejected'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {selectedKycStatus ===
                'approved' ? (
                  <BadgeCheck
                    size={18}
                    className="mt-0.5"
                  />
                ) : selectedKycStatus ===
                  'rejected' ? (
                  <Ban
                    size={18}
                    className="mt-0.5"
                  />
                ) : (
                  <Clock3
                    size={18}
                    className="mt-0.5"
                  />
                )}

                <div>
                  <p className="text-sm font-bold">
                    {selectedKycStatus ===
                    'approved'
                      ? 'Customer verification approved'
                      : selectedKycStatus ===
                        'rejected'
                        ? 'Customer verification declined'
                        : 'Application pending Admin review'}
                  </p>

                  <p className="text-xs mt-1 opacity-80">
                    {selectedKycStatus ===
                    'approved'
                      ? 'This account has an approved KYC status in the backend.'
                      : selectedKycStatus ===
                        'rejected'
                        ? selectedSubmission?.rejection_reason ||
                          'This application is currently declined.'
                        : 'Review the customer information and actual uploaded documents before making a decision.'}
                  </p>
                </div>
              </div>

              <Section title="Personal & Contact Information">
                <div className="grid grid-cols-3 gap-4">
                  <InfoCard
                    icon={
                      <User
                        size={16}
                      />
                    }
                    label="Full Name"
                    value={
                      selectedUser.full_name
                    }
                  />

                  <InfoCard
                    icon={
                      <Mail
                        size={16}
                      />
                    }
                    label="Email"
                    value={
                      selectedUser.email
                    }
                  />

                  <InfoCard
                    icon={
                      <Phone
                        size={16}
                      />
                    }
                    label="Phone Number"
                    value={
                      selectedPhone
                    }
                  />

                  <InfoCard
                    icon={
                      <MapPin
                        size={16}
                      />
                    }
                    label="Address"
                    value={
                      selectedUser.residential_address ||
                      selectedUser.address
                    }
                  />

                  <InfoCard
                    icon={
                      <MapPin
                        size={16}
                      />
                    }
                    label="City / Location"
                    value={
                      selectedUser.city
                    }
                  />

                  <InfoCard
                    icon={
                      <CalendarDays
                        size={16}
                      />
                    }
                    label="Account Created"
                    value={formatDate(
                      selectedUser.created_at
                    )}
                  />
                </div>
              </Section>

              {selectedRole ===
                'driver' && (
                <Section title="Driver & Vehicle Credentials">
                  <div className="grid grid-cols-3 gap-4 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
                    <InfoCard
                      label="Vehicle Type"
                      value={
                        selectedUser.vehicle_type
                      }
                    />

                    <InfoCard
                      label="Plate Number"
                      value={
                        selectedUser.plate_number
                      }
                    />

                    <InfoCard
                      label="Driver License No."
                      value={
                        selectedUser.driver_license_no
                      }
                    />
                  </div>
                </Section>
              )}

              {selectedRole ===
                'merchant' && (
                <Section title="Merchant & Business Information">
                  <div className="grid grid-cols-3 gap-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                    <InfoCard
                      icon={
                        <Store
                          size={16}
                        />
                      }
                      label="Business / Store Name"
                      value={
                        selectedUser.business_name
                      }
                    />

                    <InfoCard
                      label="Business Type"
                      value={
                        selectedUser.business_type
                      }
                    />

                    <InfoCard
                      label="Tax ID / Registration"
                      value={
                        selectedUser.tax_id
                      }
                    />

                    <InfoCard
                      icon={
                        <Phone
                          size={16}
                        />
                      }
                      label="Merchant Phone"
                      value={
                        selectedPhone
                      }
                    />
                  </div>
                </Section>
              )}

              {selectedSubmission && (
                <Section title="KYC Review Record">
                  <div className="grid grid-cols-3 gap-4">
                    <InfoCard
                      label="Operational Status"
                      value={statusLabel(
                        selectedSubmission.status
                      )}
                    />

                    <InfoCard
                      label="Submitted"
                      value={formatDateTime(
                        selectedSubmission.submitted_at ||
                          selectedSubmission.created_at
                      )}
                    />

                    <InfoCard
                      label="Reviewed"
                      value={formatDateTime(
                        selectedSubmission.reviewed_at
                      )}
                    />

                    <InfoCard
                      label="Reviewer"
                      value={
                        selectedSubmission.reviewer_id ||
                        'Not yet reviewed'
                      }
                    />

                    <InfoCard
                      label="Target Role"
                      value={roleLabel(
                        selectedSubmission.target_role
                      )}
                    />

                    <InfoCard
                      label="Submission ID"
                      value={
                        selectedSubmission.id
                      }
                    />
                  </div>

                  {selectedSubmission.rejection_reason && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-red-500">
                        Review Reason
                      </p>

                      <p className="text-sm text-red-800 mt-2 leading-5">
                        {
                          selectedSubmission.rejection_reason
                        }
                      </p>
                    </div>
                  )}
                </Section>
              )}

              <Section
                title={`Uploaded KYC Documents (${selectedDocuments.length})`}
              >
                {selectedDocuments.length ===
                0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        size={20}
                        className="text-amber-600 mt-0.5 shrink-0"
                      />

                      <div>
                        <p className="text-sm font-bold text-amber-800">
                          No KYC document records
                          found
                        </p>

                        <p className="text-xs text-amber-700 mt-1 leading-5">
                          MatMove has no uploaded
                          document metadata linked
                          to this customer's latest
                          KYC submission. The Admin
                          system will not display
                          placeholder or fabricated
                          documents.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedDocuments.map(
                      (
                        document
                      ) => {
                        const url =
                          documentUrls[
                            document.id
                          ];

                        return (
                          <DocumentCard
                            key={
                              document.id
                            }
                            document={
                              document
                            }
                            signedUrl={
                              url
                            }
                            onPreview={() => {
                              if (!url) {
                                return;
                              }

                              setPreviewDocument(
                                {
                                  url,
                                  title:
                                    humanizeDocumentType(
                                      document.document_type
                                    ),
                                  fileName:
                                    document.file_name,
                                }
                              );
                            }}
                          />
                        );
                      }
                    )}
                  </div>
                )}
              </Section>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
                <ShieldCheck
                  size={19}
                  className="text-indigo-600 mt-0.5 shrink-0"
                />

                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Secure MatMove verification
                  </p>

                  <p className="text-xs text-slate-500 mt-1 leading-5">
                    KYC decisions are processed
                    through the protected backend
                    review function. The Admin UI
                    does not directly mutate customer
                    KYC status.
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
                Applicant details and live KYC
                records will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {showRejectDialog &&
        selectedUser && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Decline KYC Application
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    Provide a clear reason. The
                    reason will be recorded by the
                    MatMove verification workflow.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowRejectDialog(
                      false
                    );
                    setRejectionReason(
                      ''
                    );
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X size={18} />
                </button>
              </div>

              <textarea
                value={
                  rejectionReason
                }
                onChange={(
                  event
                ) =>
                  setRejectionReason(
                    event.target
                      .value
                  )
                }
                placeholder="Enter the reason for declining this KYC application..."
                rows={5}
                className="w-full mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white resize-none"
              />

              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => {
                    setShowRejectDialog(
                      false
                    );
                    setRejectionReason(
                      ''
                    );
                  }}
                  disabled={
                    actionLoading
                  }
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={
                    handleReject
                  }
                  disabled={
                    actionLoading ||
                    !rejectionReason.trim()
                  }
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold"
                >
                  {actionLoading && (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  )}

                  Confirm Decline
                </button>
              </div>
            </div>
          </div>
        )}

      {previewDocument && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] p-5 shadow-2xl relative flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {
                    previewDocument.title
                  }
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  {previewDocument.fileName ||
                    'KYC document'}
                </p>
              </div>

              <button
                onClick={() =>
                  setPreviewDocument(
                    null
                  )
                }
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 flex items-center justify-center bg-slate-950 p-4">
              <img
                src={
                  previewDocument.url
                }
                alt={
                  previewDocument.title
                }
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>

            <div className="flex justify-end mt-4">
              <a
                href={
                  previewDocument.url
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700"
              >
                <ExternalLink
                  size={15}
                />
                Open document
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialCard({
  label,
  value,
  secondary,
  icon,
  tone = 'indigo',
  loading,
}: {
  label: string;
  value: string;
  secondary: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'amber';
  loading: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-2xl p-5 shadow-sm ${
        tone === 'amber'
          ? 'border-amber-200'
          : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>

        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            tone === 'amber'
              ? 'bg-amber-50 text-amber-600'
              : 'bg-indigo-50 text-indigo-600'
          }`}
        >
          {icon}
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <Loader2
            size={21}
            className="animate-spin text-slate-300"
          />
        </div>
      ) : (
        <>
          <div className="text-xl font-bold text-slate-900 mt-4 break-words">
            {value}
          </div>

          <div className="text-[11px] text-slate-400 mt-1">
            {secondary}
          </div>
        </>
      )}
    </div>
  );
}

function MiniFinancialCard({
  label,
  value,
  icon,
  tone = 'indigo',
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: 'indigo' | 'amber' | 'red' | 'blue' | 'green';
  loading: boolean;
}) {
  const toneClasses = {
    indigo:
      'bg-indigo-50 text-indigo-600',
    amber:
      'bg-amber-50 text-amber-600',
    red:
      'bg-red-50 text-red-600',
    blue:
      'bg-blue-50 text-blue-600',
    green:
      'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>

        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${toneClasses[tone]}`}
        >
          {icon}
        </div>
      </div>

      {loading ? (
        <Loader2
          size={15}
          className="animate-spin text-slate-300 mt-3"
        />
      ) : (
        <div className="text-sm font-bold text-slate-900 mt-3 break-words">
          {value}
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
  onClick,
  active = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border rounded-2xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
        active
          ? 'border-indigo-400 ring-1 ring-indigo-200'
          : highlight
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

      <div className="text-[10px] text-slate-400 mt-1">
        Click to view records
      </div>
    </button>
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
  document,
  signedUrl,
  onPreview,
}: {
  document: KycDocument;
  signedUrl?: string;
  onPreview: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FileText
            size={15}
            className="text-indigo-600 mt-0.5 shrink-0"
          />

          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 block">
              {humanizeDocumentType(
                document.document_type
              )}
            </span>

            <span className="text-[10px] text-slate-400 block mt-1 truncate">
              {document.file_name ||
                'Uploaded document'}
            </span>
          </div>
        </div>

        {signedUrl && (
          <button
            onClick={
              onPreview
            }
            className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 shrink-0"
          >
            <ZoomIn size={14} />
            View
          </button>
        )}
      </div>

      {signedUrl ? (
        <button
          type="button"
          onClick={
            onPreview
          }
          className="w-full block"
        >
          <img
            src={signedUrl}
            alt={
              document.file_name ||
              document.document_type
            }
            className="w-full h-44 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-95 transition"
          />
        </button>
      ) : (
        <div className="h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs font-semibold">
          <RefreshCw
            size={24}
            className="mb-2 animate-spin text-slate-300"
          />

          Generating secure preview...
        </div>
      )}

      <div className="flex justify-between items-center mt-3 text-[10px] text-slate-400">
        <span>
          {formatFileSize(
            document.file_size_bytes
          )}
        </span>

        <span>
          {formatDate(
            document.created_at
          )}
        </span>
      </div>
    </div>
  );
}