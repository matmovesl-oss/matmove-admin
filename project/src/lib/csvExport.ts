
import {adminFetch} from '@/lib/adminFetch';
import {supabase} from '@/lib/supabase';
import {canAdminAccess} from '../../shared/admin-permissions.js';

export type CsvColumn<T> = {label: string; value: (row: T) => unknown};

function cell(value: unknown): string {
  let text: string;
  if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (value == null) text = '';
  else if (typeof value === 'string') {
    text = value;
    // Treat text as text when opened in a spreadsheet, including phone numbers
    // starting with + and formulas hidden behind whitespace/control characters.
    if (/^[\s\u0000-\u001f\u007f-\u009f\ufeff]*[=+\-@]/u.test(text)) text = "'" + text;
  } else text = ''; // Raw nested records/credentials are never serialized.
  return '"' + text.replace(/"/g, '""') + '"';
}

export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  if (!columns.length) throw new Error('Select export columns.');
  const lines = [columns.map(column => cell(column.label)).join(',')];
  for (const row of rows) lines.push(columns.map(column => cell(column.value(row))).join(','));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export async function exportCsv<T>({userId, section, filename, rows, columns}: {
  userId: string; section: string; filename: string;
  rows: readonly T[]; columns: readonly CsvColumn<T>[];
}): Promise<number> {
  if (!userId || !rows.length) throw new Error('There are no displayed records to export.');
  // Check the current server assignment again at the moment of export. Do not
  // authorize using a role/owner flag supplied by a page or local browser state.
  const response = await adminFetch('/api/admin-staff?view=me');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Export permission could not be verified.');
  if (body.access?.id !== userId || !canAdminAccess(body.access, section)) throw new Error('Access denied. Your current assignment does not allow this export.');
  const {data: sessionData, error: sessionError} = await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId) throw new Error('Your account changed. Reopen this report before exporting.');
  const csv = buildCsv(rows, columns);
  const stem = filename.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90) || 'matmove-export';
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = `${stem}_displayed_${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return rows.length;
}

export function providerAmount(amount: any): number | '' {
  return Number.isSafeInteger(amount?.value) ? amount.value / 100 : '';
}

// Full-history downloads are separate from the existing displayed-row export.
// The collector must have confirmed the last page before this function is used.
export async function exportCompleteCsv({userId,section,filename,report,signal,isCurrent}: {
  userId:string;section:string;filename:string;
  report:import('./adminReports').CompleteReport;
  signal:AbortSignal;isCurrent:()=>boolean;
}):Promise<number>{
  const valid=()=>{
    if(signal.aborted||!isCurrent())throw new DOMException('Export cancelled.','AbortError');
  };
  valid();
  if(!userId||report.actor!==userId||report.complete!==true||!Array.isArray(report.rows)||
    !Array.isArray(report.columns)||!report.columns.length||report.columns.some(c=>typeof c!=='string'||!/^[a-z][a-z0-9_]*$/.test(c))||
    !Number.isFinite(Date.parse(report.cutoff)))throw new Error('A complete report is required before downloading.');
  const response=await adminFetch('/api/admin-staff?view=me',{signal});
  const body=await response.json();valid();
  if(!response.ok)throw new Error(body.error||'Export permission could not be verified.');
  if(body.access?.id!==userId||!canAdminAccess(body.access,section))throw new Error('Access denied. Your current assignment does not allow this export.');
  const {data,error}=await supabase.auth.getSession();valid();
  if(error||data.session?.user.id!==userId)throw new Error('Your account changed. Reopen Reports before exporting.');
  const columns=report.columns.map(column=>({label:column+(column.endsWith('_minor')?' (SLE cents)':''),value:(row:Record<string,unknown>)=>row[column]}));
  const csv=buildCsv(report.rows,columns);valid();
  const stem=filename.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,90)||'matmove-report';
  const date=new Date().toISOString().replace(/[:.]/g,'-');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  let anchor:HTMLAnchorElement|undefined;
  try{
    valid();anchor=document.createElement('a');anchor.href=url;
    anchor.download=`${stem}_history_${date}.csv`;
    document.body.appendChild(anchor);anchor.click();
  }finally{
    anchor?.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return report.rows.length;
}
