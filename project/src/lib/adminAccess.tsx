import { createContext, useContext } from 'react';

export const sections = [
  ['dashboard', 'Overview', '/dashboard'],
  ['dispatch', 'Dispatch Radar', '/dispatch'],
  ['pricing', 'Vehicle Pricing', '/pricing'],
  ['kyc', 'KYC & Onboarding', '/kyc'],
  ['financials', 'Financial & Wallets', '/financials'],
  ['transactions', 'Gateway Transactions', '/transactions'],
  ['payouts', 'Payouts & Withdrawals', '/payouts'],
  ['customers', 'Customer Governance', '/customers'],
  ['marketplace', 'Products & Orders', '/marketplace'],
  ['staff', 'Staff Governance', '/staff'],
  ['logs', 'System & Audit Logs', '/logs'],
] as const;

export type AdminAccess = {
  id: string;
  email?: string;
  full_name?: string;
  department?: string;
  is_owner: boolean;
  is_active: boolean;
  permissions: string[];
};

export type Access = AdminAccess;

export const AdminAccessContext =
  createContext<AdminAccess | null>(null);

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}

export function canAccess(
  access: AdminAccess | null,
  section: string
): boolean {
  if (!access?.is_active) {
    return false;
  }

  return (
    access.is_owner ||
    access.permissions.includes(section)
  );
}