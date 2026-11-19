import { Link } from 'react-router-dom';
import { ArrowRightLeft, CreditCard } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import CashCollectionsManager from '@/components/CashCollectionsManager';

export default function CashPaymentsPage() {
  return (
    <AdminLayout title="Cash & Digital Payments" subtitle="Review cash collections separately from provider-confirmed digital wallet activity">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><CreditCard size={18} className="text-emerald-700"/> Cash payments</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">Driver and customer cash confirmations, fee reserves, captured fees and reconciliation reviews.</p>
          <p className="mt-2 text-xs font-semibold text-emerald-800">Cash collection ledger below</p>
        </div>
        <Link to="/transactions" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ArrowRightLeft size={18} className="text-indigo-700"/> Digital wallet payments</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">Monime transactions, digital credits and debits, webhook review and provider references.</p>
          <span className="mt-2 inline-flex text-xs font-bold text-indigo-700">Open digital payment ledger →</span>
        </Link>
      </div>
      <CashCollectionsManager />
    </AdminLayout>
  );
}
