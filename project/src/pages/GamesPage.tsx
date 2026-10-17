

import {canAccess,useAdminAccess} from '@/lib/adminAccess';
import {adminFetch} from '@/lib/adminFetch';


import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { validateArcadeSettings, type ArcadeSettings, type ArcadeGame } from '../../shared/arcade-payment-rules.js';
import { validateBundleTiers, bundleEconomics, bundleLabel, type BundleTier } from '../../shared/bundle-spin-rules.js';
const money=(n:number)=>`SLE ${(n/100).toFixed(2)}`;
type Snapshot={config:{id:number;enabled:boolean;bundle_tiers:BundleTier[]|null};reservedMinor:number;entryReceivedMinor:number;winsPaidMinor:number;winsOwedMinor:number};
function GameSettings({selectedPlayer}: {selectedPlayer:string}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [tiers,setTiers]=useState<BundleTier[]>([]);
  const [selected,setSelected]=useState('0');
  const [enabled,setEnabled]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [account,setAccount]=useState<{id:string;balance:number}|null>(null);const [accountError,setAccountError]=useState('');
  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc('matmove_spin_admin_snapshot');if(error)throw new Error(error.message);
    if(!data.config.bundle_tiers)throw new Error('Run SPIN_BUNDLES_V2_SETUP.sql before editing the new packages.');
    setSnapshot(data);setEnabled(data.config.enabled);setTiers(validateBundleTiers(data.config.bundle_tiers));
    try{
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sign in again.');
      const response=await adminFetch('/api/admin-wallet-balances',{headers:{Authorization:`Bearer ${session.access_token}`}});const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Live Spin balance unavailable.');
      const id=body.platform?.spinAccountId,found=body.accounts?.find((a:any)=>a.id===id),amount=found?.balance?.available;
      if(!id||!found||found.currency!=='SLE'||amount?.currency!=='SLE'||!Number.isSafeInteger(amount.value))throw new Error('Check MONIME_SPIN_ACCOUNT_ID in Admin Vercel.');
      setAccount({id,balance:amount.value});setAccountError('');
    }catch(e){setAccount(null);setAccountError(e instanceof Error?e.message:'Balance unavailable.');}
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
  async function execute(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await action();await refresh();setNotice('Saved. Existing purchased games retained their rules.');}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
  const tier=tiers.find(t=>t.id===selected);let validation='';let economics:ReturnType<typeof bundleEconomics>|null=null;
  try{if(tiers.length){validateBundleTiers(tiers);if(tier)economics=bundleEconomics(tier);}}catch(e){validation=e instanceof Error?e.message:'Invalid wheel.';}
  function changeFee(value:number){setTiers(old=>old.map(t=>t.id===selected?{...t,entryMinor:value}:t));}
  function changePrize(index:number,value:number){setTiers(old=>old.map(t=>t.id!==selected?t:{...t,sectors:t.sectors.map((s,i)=>i===index?{...s,prizeMinor:value}:s)}));}
  return <AdminLayout title="Games — wallet spin packages" subtitle="Edit three fees and the cash prizes for each wheel">
    <GameTabs active="settings"/>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</p>}
    <button disabled={busy} onClick={()=>void execute(refresh)} className="mb-5 rounded-xl border bg-white px-5 py-3 font-bold">Refresh settings and balance</button>
    {!snapshot?<p>Loading settings…</p>:<div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Wheel entries received',snapshot.entryReceivedMinor],['Wheel winnings credited',snapshot.winsPaidMinor],['Wheel prizes still owed',snapshot.winsOwedMinor],['Wheel reserved capacity',snapshot.reservedMinor]].map(([label,value])=><div key={String(label)} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{money(Number(value))}</p></div>)}</div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Dedicated Spin Account</h2>{account?<><p className="mt-2 break-all font-mono text-sm">{account.id}</p><p className="mt-2">Available: <b>{money(account.balance)}</b></p></>:<p className="mt-2 text-red-700">{accountError}</p>}<p className="mt-3 text-sm text-slate-600">The dedicated Spin Account serves all four games. Shared backend checks reserve the maximum remaining prize capacity across the wheel and the three other games. These summary figures cover the wheel only. New wheel packages reserve the maximum cash prize multiplied by their paid spin count. Wheel 1 has one paid spin and one possible free final spin; wheels 2 and 3 have one paid spin each. Older purchased games retain their original rules. Entry payments go from customer to Spin Account; prizes go from Spin Account to that customer, without a winnings fee.</p></div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Fees and prizes</h2>
        <label className="my-4 flex gap-3"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Allow new entries (Customer MATMOVE_SPIN_ENABLED must also be true)</label>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">{tiers.map(t=><button key={t.id} onClick={()=>setSelected(t.id)} className={`rounded-xl border p-4 ${selected===t.id?'border-purple-700 bg-purple-50':'bg-slate-50'}`}><b>Wheel {Number(t.id)+1}: {money(t.entryMinor)}</b><p className="mt-1 text-xs">{t.paidSpins} paid spins · {t.sectors.length} segments</p></button>)}</div>
        {tier&&<><label className="block font-bold">Entry fee (SLE)<input type="number" min="1" max="10000" step="1" value={tier.entryMinor/100} onChange={e=>changeFee(Number(e.target.value)*100)} className="ml-3 w-32 rounded-lg border p-2"/></label><div className="mt-4 grid gap-3 sm:grid-cols-2">{tier.sectors.map((s,i)=><div key={i} className="rounded-xl border p-4"><p className="font-bold">Segment {i+1}</p>{s.kind==='cash'?<label>Cash prize (SLE)<input type="number" min="1" max="10000" step="1" value={s.prizeMinor/100} onChange={e=>changePrize(i,Number(e.target.value)*100)} className="mt-2 w-full rounded-lg border p-2"/></label>:<p className="mt-2 font-bold text-purple-700">{bundleLabel(s)} — fixed</p>}</div>)}</div></>}
        {economics&&<div className="mt-4 rounded-xl bg-slate-50 p-4"><p>Expected payout per purchase: <b>{money(economics.expectedPrizeMinor)}</b></p><p>Expected margin before provider fees: <b>{money(economics.expectedMarginMinor)}</b></p><p>Reserve needed per purchase: <b>{money(economics.maximumPrizeMinor)}</b></p>{economics.expectedMarginMinor<=0&&<p className="mt-2 text-red-700">These prizes cost at least as much as the entry fee on average. Reduce prizes or increase the fee if you need a positive expected margin.</p>}</div>}
        <p className="mt-4 text-sm text-slate-600">Every segment has an equal chance on each paid spin. Wheel 1 has four cash segments and Spin again; the one free final spin selects only its four cash segments. Wheel 2 has five cash segments and Better luck next time; no-prize results consume one paid spin. Wheel 3 has five cash segments. Each fee buys one paid spin. Changes affect future purchases only; customers see saved fees, prizes and rules before paying.</p>
        {validation&&<p role="alert" className="mt-3 text-red-700">{validation}</p>}
        <button disabled={busy||!!validation||!economics} onClick={()=>void execute(async()=>{const clean=validateBundleTiers(tiers);const {error}=await supabase.rpc('matmove_spin_admin_save_bundle',{p_expected:snapshot.config.id,p_enabled:enabled,p_tiers:clean});if(error)throw error;})} className="mt-4 rounded-xl bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50">Publish fees and prizes for future games</button>
      </div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Player eligibility</h2><p className="mt-2">Automatic wallet ownership, available balance, adult date of birth, approved identity and freeze checks remain. No separate game approval.</p></div>
    </div>}
  </AdminLayout>;
}

const gameTabs = [['overview','Overview'],['players','Players'],['entries','Entry payments'],['winnings','Winnings'],['settings','Settings & access'],['recovery','Receipt recovery']] as const;
type GameTab = typeof gameTabs[number][0];
const gameChoices=[['all','All games'],['spin','MatMove Spin'],['dice','RICH DICE'],['fruity','Fruity Flue'],['crankling','CRANKLING']] as const;
type GameChoice=typeof gameChoices[number][0];
function GameTabs({active}:{active:GameTab}){
  const access=useAdminAccess();const [params]=useSearchParams();
  const selected=gameChoices.some(([id])=>id===params.get('game'))?params.get('game')!:'all';
  const href=(tab:GameTab,game:string)=>{const q=new URLSearchParams({tab,game});const player=params.get('player');if(player)q.set('player',player);return `/games?${q}`;};
  return <div className="mb-6 space-y-3"><nav aria-label="Games sections" className="flex flex-wrap gap-2 rounded-2xl border border-purple-200 bg-white p-3">
    {gameTabs.filter(([tab])=>canAccess(access,`games.${tab}`)).map(([tab,label])=><Link key={tab} to={href(tab,selected)} aria-current={active===tab?'page':undefined} className={`rounded-xl px-4 py-2 text-sm font-bold ${active===tab?'bg-purple-700 text-white':'bg-slate-50 text-slate-600 hover:bg-purple-50'}`}>{label}</Link>)}
  </nav><nav aria-label="Choose a game" className="flex flex-wrap gap-2">{gameChoices.map(([id,label])=><Link key={id} to={href(active,id)} aria-current={id===selected?'page':undefined} className={`rounded-full border px-4 py-2 text-sm font-bold ${id===selected?'border-amber-500 bg-amber-100 text-amber-950':'bg-white text-slate-600'}`}>{label}</Link>)}</nav></div>;
}
export function GamesPage(){
  const [params]=useSearchParams();const access=useAdminAccess();
  const requested=params.get('tab')||'overview';
  const tab:GameTab=gameTabs.some(([key])=>key===requested)?requested as GameTab:'overview';
  const game:GameChoice=gameChoices.some(([key])=>key===params.get('game'))?params.get('game') as GameChoice:'all';
  const player=params.get('player')||'';
  if(!canAccess(access,`games.${tab}`))return <AdminLayout title="Games — access denied"><p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Access denied. This Games section is not assigned to your staff account.</p></AdminLayout>;
  if(tab==='settings')return game==='spin'?<GameSettings key={player} selectedPlayer={player}/>:<ArcadeSettingsPanel key={game} game={game}/>;
  if(tab==='recovery')return <AdminLayout title="Games — receipt recovery"><GameTabs active="recovery"/>{game==='all'?<p className="rounded-2xl border bg-white p-5">Choose the game above before attaching a receipt. Recovery never creates a new transfer.</p>:game==='spin'?<ReceiptRecovery/>:<ArcadeRecovery key={game} game={game}/>}</AdminLayout>;
  return <AdminLayout title={`Games — ${gameTabs.find(([key])=>key===tab)?.[1]}`} subtitle="Recorded players, entries, outcomes and verified payment receipts">
    <GameTabs active={tab}/>
    {(game==='all'||game==='spin')&&<section><h2 className="mb-4 text-2xl font-bold">MatMove Spin</h2><GameReports key={`${tab}:${player}`} tab={tab} player={player}/>{tab==='overview'&&<GameOutcomeHistory/>}</section>}
    {game!=='spin'&&<section className={game==='all'?'mt-8 border-t-2 border-purple-100 pt-6':''}><h2 className="mb-4 text-2xl font-bold">{game==='all'?'RICH DICE · Fruity Flue · CRANKLING':gameChoices.find(([id])=>id===game)?.[1]}</h2><ArcadeReports key={`${game}:${tab}:${player}`} game={game} tab={tab} player={player}/></section>}
  </AdminLayout>;
}

type ReportData={view:string;page:number;pageSize:number;total:number;rows:any[];stats:Record<string,number>;asOf:string};
const stamp=(value:string|null|undefined)=>value?new Date(value).toLocaleString():'Not recorded';
function StatusTag({value}:{value:string}){
  const style=value==='completed'?'bg-emerald-100 text-emerald-800':value==='failed'||value==='review_required'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-800';
  return <span className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${style}`}>{value.replace(/_/g,' ')}</span>;
}
function PlayerName({row}:{row:any}){
  return <div><Link to={`/games?game=spin&tab=players&player=${row.user_id}`} className="font-bold text-purple-700 hover:underline">{row.customer_name||row.customer_email||'Customer'}</Link><p className="mt-1 text-xs text-slate-500">{row.customer_email||row.customer_role||'Customer'}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{row.user_id}</p></div>;
}
function GameReports({tab,player}:{tab:Exclude<GameTab,'settings'|'recovery'>;player:string}){
  const view=tab==='overview'?'rounds':tab;
  const [page,setPage]=useState(1);
  const [searchDraft,setSearchDraft]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  const [envelope,setEnvelope]=useState<{key:string;data:ReportData}|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const sequence=useRef(0);
  const inFlight=useRef(false);
  const key=JSON.stringify([view,page,search,status,player]);
  const data=envelope?.key===key?envelope.data:null;
  const load=useCallback(async()=>{
    const current=++sequence.current;
    inFlight.current=true;setLoading(true);setError('');
    try{
      const {data,error}=await supabase.rpc('matmove_spin_admin_report',{p_view:view,p_page:page,p_search:search,p_status:status,p_player:player||null});
      if(error)throw new Error(error.message);
      if(current===sequence.current)setEnvelope({key,data});
    }catch(e){if(current===sequence.current)setError(e instanceof Error?e.message:'Game reports unavailable.');}
    finally{if(current===sequence.current){inFlight.current=false;setLoading(false);}}
  },[view,page,search,status,player,key]);
  useEffect(()=>{
    void load();
    const interval=setInterval(()=>{if(!document.hidden&&!inFlight.current)void load();},15000);
    return()=>{clearInterval(interval);sequence.current++;inFlight.current=false;};
  },[load]);
  const filters=tab==='players'?['all','paid','unpaid','in_progress']:tab==='overview'?['all','entry_pending','active','win_pending','completed','failed','review_required']:['all','pending','processing','completed','failed','review_required'];
  const stats=data?.stats;
  const pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  const count=(field:string)=>stats?(stats[field]===undefined?'Access denied':Number(stats[field]).toLocaleString()):'—';
  const amount=(field:string)=>stats?(stats[field]===undefined?'Access denied':money(Number(stats[field]))):'—';
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Unique paying players',count('paidPlayers')],['Completed entries',count('paidEntries')],
        ['Entry fees received',amount('entryReceivedMinor')],['Winnings credited',amount('winsPaidMinor')],
        ['Unpaid prize liabilities',amount('winsOwedMinor')],['Players with open paid rounds',count('playersWithOpenPaidRounds')],
        ['Entry payments processing',count('pendingEntries')],['Rounds needing review',count('reviewRounds')],
      ].map(([label,value])=><div key={label} className="rounded-2xl border border-purple-100 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}
    </div>
    <p className="text-xs text-slate-500">These summary totals cover MatMove Spin only, including its older purchased rounds. They do not change with table filters. Open paid rounds describe unfinished games, not whether a person is online. Monetary totals count completed receipts; pending prizes remain liabilities.</p>
    {tab==='overview'&&<div className="rounded-2xl border bg-purple-950 p-5 text-white"><h2 className="text-xl font-bold text-amber-300">Game cash flow</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-purple-200">Customer → Spin Account</p><p className="mt-1 text-2xl font-bold">{amount('entryReceivedMinor')}</p></div><div><p className="text-sm text-purple-200">Spin Account → Customers</p><p className="mt-1 text-2xl font-bold">{amount('winsPaidMinor')}</p></div><div><p className="text-sm text-purple-200">Entries minus credited prizes</p><p className="mt-1 text-2xl font-bold">{stats&&Number.isFinite(stats.entryReceivedMinor)&&Number.isFinite(stats.winsPaidMinor)?money(stats.entryReceivedMinor-stats.winsPaidMinor):'Access denied'}</p></div></div><p className="mt-4 border-t border-white/20 pt-3 text-sm text-purple-200">This difference is before provider fees and unpaid prize liabilities. Reserved prize capacity: {amount('reservedMinor')}. View the live provider account balance in Settings & access.</p></div>}
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{tab==='overview'?'MatMove Spin rounds':tab==='players'?'Game players':tab==='entries'?'Entry payments — customer to Spin':'Winnings — Spin to customer'}</h2><button disabled={loading} onClick={()=>void load()} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button></div>
      {player&&<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-purple-50 p-3 text-sm"><span className="break-all">Selected customer: {player}</span><Link to={`/games?game=spin&tab=${tab}`} className="font-bold text-purple-700">Show all customers</Link></div>}
      <form onSubmit={e=>{e.preventDefault();setSearch(searchDraft.trim());setPage(1);}} className="mt-4 flex flex-wrap gap-3 border-t pt-4"><input aria-label="Search game records" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} maxLength={100} placeholder="Search name, email, customer or receipt ID" className="min-w-0 flex-1 rounded-xl border px-3 py-2"/><button className="rounded-xl bg-purple-700 px-4 py-2 font-bold text-white">Search</button><select aria-label="Report status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="rounded-xl border px-3 py-2">{filters.map(f=><option key={f} value={f}>{f==='all'?'All statuses':f.replace(/_/g,' ')}</option>)}</select></form>
      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error} {data?'The displayed report is the last successful refresh.':''}</p>}
      {!data?<p role="status" className="py-8 text-slate-500">{loading?'Loading recorded game activity…':'Report unavailable.'}</p>:<>
        <p className="mt-3 text-xs text-slate-500">{data.total.toLocaleString()} matching records · Recorded data refreshed {stamp(data.asOf)} · Auto refresh every 15 seconds</p>
        {!data.rows.length?<p className="py-8 text-slate-500">No matching game records.</p>:<div className="mt-4 overflow-x-auto">
          {tab==='players'?<table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player</th><th>Player activity</th><th>Paid entries</th><th>Entry total</th><th>Winnings credited</th><th>Still owed</th><th>Paid rounds open</th><th>History</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.user_id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 text-xs text-slate-500">First paid entry: {stamp(row.first_paid_at)}</p></td><td className="py-3"><p>{Number(row.paid_entries)>0?'Entered game':'No completed entry yet'}</p><p className="mt-1 text-xs text-slate-500">Profile eligibility and balance are checked at entry.</p></td><td className="py-3">{row.paid_entries}<p className="mt-1 text-xs text-slate-500">{row.completed_rounds} finished rounds</p></td><td className="py-3 font-bold text-emerald-700">{money(Number(row.entry_paid_minor))}</td><td className="py-3 font-bold text-purple-700">{money(Number(row.wins_paid_minor))}</td><td className="py-3 text-amber-700">{money(Number(row.wins_owed_minor))}</td><td className="py-3">{row.open_paid_rounds}</td><td className="space-y-2 py-3"><Link className="block font-bold text-emerald-700" to={`/games?game=spin&tab=entries&player=${row.user_id}`}>Entry payments</Link><Link className="block font-bold text-purple-700" to={`/games?game=spin&tab=winnings&player=${row.user_id}`}>Winnings</Link><Link className="block text-slate-600" to={`/games?game=spin&tab=settings&player=${row.user_id}`}>Game settings</Link></td></tr>)}</tbody></table>
          :tab==='overview'?<table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player / round</th><th>Entry payment</th><th>Round status</th><th>Spins</th><th>Prizes credited</th><th>Still owed</th><th>Details</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 break-all font-mono text-[10px] text-slate-500">Game: {row.id}</p></td><td className="py-3"><StatusTag value={row.entry_status||'not recorded'}/><p className="mt-2">{money(Number(row.entry_minor))}</p></td><td className="py-3"><StatusTag value={row.state}/></td><td className="py-3">{row.spins_used||0} recorded</td><td className="py-3 font-bold text-purple-700">{money(Number(row.wins_paid_minor||0))}</td><td className="py-3 text-amber-700">{money(Number(row.wins_owed_minor||0))}</td><td className="py-3"><details className="max-w-xs"><summary className="cursor-pointer font-bold text-purple-700">Show round</summary><div className="mt-2 space-y-2 break-all text-xs"><p>Created: {stamp(row.created_at)}</p><p>Updated: {stamp(row.updated_at)}</p><p>Rules version: {row.config_id}</p><p>Lucky marker: {row.lucky_digit}</p><p>Customer account: {row.source_account}</p><p>Spin account: {row.spin_account}</p><p>Entry receipt: {row.entry_provider_id||'not confirmed'}</p>{row.error&&<p className="text-red-700">{row.error}</p>}<Link className="block text-emerald-700" to={`/games?game=spin&tab=entries&player=${row.user_id}`}>View entry history</Link><Link className="block text-purple-700" to={`/games?game=spin&tab=winnings&player=${row.user_id}`}>View winnings history</Link></div></details></td></tr>)}</tbody></table>
          :<table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Player / game</th><th>{tab==='entries'?'Entry amount':'Prize amount'}</th><th>{tab==='entries'?'Direction':'Spin / number'}</th><th>Payment status</th><th>Provider receipt</th><th>Time / full details</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id} className="border-t align-top"><td className="p-3"><PlayerName row={row}/><p className="mt-2 break-all font-mono text-[10px] text-slate-500">Game: {row.round_id}</p></td><td className={`py-3 font-bold ${tab==='entries'?'text-emerald-700':'text-purple-700'}`}>{money(Number(row.amount_minor))}</td><td className="py-3">{tab==='entries'?'Customer → Spin':`Spin ${row.spin_index} · Number ${row.digit}`}<p className="mt-1 text-xs text-slate-500">{tab==='winnings'?'Spin → Customer':'Paid rules saved with each game'}</p></td><td className="py-3"><StatusTag value={row.status}/></td><td className="max-w-[180px] break-all py-3 font-mono text-xs">{row.provider_id||'Not confirmed'}</td><td className="py-3"><p className="text-xs">{stamp(row.created_at)}</p><details className="mt-2 max-w-xs"><summary className="cursor-pointer font-bold text-purple-700">Show payment</summary><div className="mt-2 space-y-2 break-all text-xs"><p>Recorded receipt ID: {row.id}</p><p>Source: {row.source_account}</p><p>Destination: {row.destination_account}</p><p>Request key: {row.request_key}</p><p>Updated: {stamp(row.updated_at)}</p><p>Round state: {row.round_state}</p><p>Rules version: {row.config_id}</p>{row.error&&<p className="text-red-700">{row.error}</p>}</div></details></td></tr>)}</tbody></table>}
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><p>Page {page} of {pages} · Up to {data.pageSize} records per page</p><div className="flex gap-2"><button disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Previous</button><button disabled={loading||page>=pages} onClick={()=>setPage(p=>p+1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Next</button></div></div>
      </>}
    </div>
  </div>;
}

function GameOutcomeHistory(){
 const [page,setPage]=useState(1);const [data,setData]=useState<{rows:any[];total:number}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let live=true;const load=async()=>{const r=await supabase.rpc('matmove_spin_admin_outcomes',{p_page:page});if(!live)return;if(r.error)setError(r.error.message);else{setData(r.data);setError('');}};void load();const timer=setInterval(()=>void load(),15000);return()=>{live=false;clearInterval(timer);};},[page]);
 return <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Wheel outcomes — prizes, bonuses and no-prize results</h2>{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Player</th><th>Entry fee</th><th>Spin</th><th>Outcome</th><th>Payment status</th><th>Time</th></tr></thead><tbody>{data?.rows.map(r=><tr key={`${r.round_id}:${r.spin_index}`} className="border-t"><td className="py-3"><PlayerName row={r}/><p className="mt-1 break-all text-xs">Game: {r.round_id}</p></td><td>{money(Number(r.entry_minor))}</td><td>{`Spin ${r.spin_index}`}</td><td>{r.kind==='cash'?money(Number(r.amount_minor)):r.kind==='again'?'Spin again':'Better luck next time'}</td><td>{r.payment_status}<p className="break-all text-xs">{r.provider_id||'No provider receipt'}</p></td><td>{stamp(r.created_at)}</td></tr>)}</tbody></table></div>{data&&!data.rows.length&&<p className="mt-3">No wheel outcomes yet.</p>}<div className="mt-4 flex gap-3"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border p-2 disabled:opacity-50">Previous</button><span>Page {page}</span><button disabled={!data||page*25>=data.total} onClick={()=>setPage(p=>p+1)} className="rounded-lg border p-2 disabled:opacity-50">Next</button></div></section>;
}

function ReceiptRecovery(){
 const [round,setRound]=useState('');const [index,setIndex]=useState(0);const [provider,setProvider]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 async function attach(){setBusy(true);setError('');setMessage('');try{const r=await supabase.rpc('matmove_spin_admin_receipt',{p_id:round.trim(),p_index:index,p_provider:provider.trim()});if(r.error)throw r.error;setMessage('Existing receipt attached. The Customer status check will verify the provider receipt; no transfer was resent.');}catch(e){setError(e instanceof Error?e.message:(e as any)?.message||'Unable to attach receipt.');}finally{setBusy(false);}}
 return <section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Attach an existing provider receipt</h2><p className="mt-3">Use the original request key to locate the matching Monime transfer. Attaching a receipt does not send money again.</p>{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}{message&&<p role="status" className="mt-3 text-emerald-700">{message}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-3"><input value={round} onChange={e=>setRound(e.target.value)} placeholder="Game UUID" className="rounded-lg border p-3"/><select value={index} onChange={e=>setIndex(Number(e.target.value))} className="rounded-lg border p-3"><option value={0}>Entry</option>{[1,2,3,4].map(n=><option key={n} value={n}>Spin {n}</option>)}</select><input value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Existing trn-... ID" className="rounded-lg border p-3"/></div><button disabled={busy} onClick={()=>void attach()} className="mt-4 rounded-lg bg-purple-700 p-3 font-bold text-white disabled:opacity-50">Attach existing receipt</button></section>;
}

export function ArcadeSettingsPanel({game}:{game:Exclude<GameChoice,'spin'>}){
 const [snapshot,setSnapshot]=useState<{id:number;settings:ArcadeSettings}|null>(null);
 const [settings,setSettings]=useState<ArcadeSettings|null>(null);
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const mutex=useRef(false),alive=useRef(true);
 const load=useCallback(async()=>{
  const result=await supabase.rpc('matmove_arcade_admin_report',{p_view:'settings',p_game:'all',p_page:1,p_player:null});if(result.error)throw new Error(result.error.message);
  if(!alive.current)return;const c=result.data?.config;if(!c||!Number.isSafeInteger(Number(c.id)))throw new Error('Install ARCADE_GAMES_SETUP.sql before editing the three new games.');
  const clean=validateArcadeSettings(c.settings);setSnapshot({id:Number(c.id),settings:clean});setSettings(structuredClone(clean));setDirty(false);
 },[]);
 useEffect(()=>{alive.current=true;void load().catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;};},[load]);
 async function run(publish:boolean){if(mutex.current)return;mutex.current=true;setBusy(true);setError('');setNotice('');try{
  if(publish){if(!snapshot||!settings)throw new Error('Load the current settings first.');const clean=validateArcadeSettings(settings);const r=await supabase.rpc('matmove_arcade_admin_save',{p_expected:snapshot.id,p_settings:clean});if(r.error)throw new Error(r.error.message);if(alive.current)setNotice('Published. New purchases and the landing demos use this version. Existing purchased games retain their rules.');}
  await load();
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Settings could not be saved.');}finally{mutex.current=false;if(alive.current)setBusy(false);}}
 function edit(id:ArcadeGame,key:string,value:number|boolean){setSettings(old=>{if(!old)return old;return {...old,[id]:{...old[id],[key]:value}};});setDirty(true);setNotice('');}
 let validation='';if(settings)try{validateArcadeSettings(settings);}catch(e){validation=e instanceof Error?e.message:'Invalid settings.';}
 const visible=(game==='all'?['dice','fruity','crankling']:[game]) as ArcadeGame[];
 const field=(id:ArcadeGame,key:string,label:string,min:number,max:number,unit:'sle'|'percent'='sle')=>{
  const v=(settings?.[id] as any)?.[key];return <label className="block text-sm font-bold">{label}<input aria-label={`${id} ${label}`} type="number" step="0.01" min={min} max={max} disabled={busy} value={v===undefined?'':v/100} onChange={e=>edit(id,key,Math.round(Number(e.target.value)*100))} className="mt-2 w-full rounded-xl border bg-white p-3"/><span className="mt-1 block text-xs font-normal text-slate-500">{unit==='sle'?'SLE':'Percent'}</span></label>;
 };
 return <AdminLayout title="Games — published fees and prizes" subtitle="One version of the settings is shared by Admin, Customer and the landing demos">
  <GameTabs active="settings"/>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
  <div className="mb-5 rounded-2xl border bg-white p-5"><p>The dedicated Spin Account receives paid entries and pays confirmed prizes for all four games. Ride and shop escrow keep their existing functions. The backend checks combined prize reserves before accepting a new game.</p><p className="mt-3 text-sm text-slate-600">Settings affect future entries. No separate game approval is required: approved adult identity, wallet ownership, available entry funds and freeze checks still apply. Customer MATMOVE_SPIN_ENABLED must also be true before paid or reward-bearing games can start.</p></div>
  <button type="button" disabled={busy} onClick={()=>void run(false)} className="mb-5 rounded-xl border bg-white px-4 py-3 font-bold disabled:opacity-50">{dirty?'Discard edits and reload settings':'Refresh published settings'}</button>
  {!settings?<p role="status">Loading published settings…</p>:<div className="space-y-5">{visible.map(id=><section key={id} className="rounded-2xl border bg-white p-5"><h2 className="text-2xl font-black">{gameChoices.find(([key])=>key===id)?.[1]}</h2><label className="mt-4 flex items-center gap-3 font-bold"><input type="checkbox" aria-label={`Enable ${id}`} checked={settings[id].enabled} disabled={busy} onChange={e=>edit(id,'enabled',e.target.checked)}/>Allow new entries</label>
   <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{id==='dice'?<>{field(id,'minStakeMinor','Minimum stake',1,100)}{field(id,'maxStakeMinor','Maximum stake',1,100)}{field(id,'returnBps','Target average payout',50,100,'percent')}{field(id,'dailyEntryLimitMinor','Daily entry limit',1,1000)}</>:id==='fruity'?field(id,'prizeMinor','Four matching fruits prize',1,1000):<>{field(id,'entryMinor','Three-attempt entry fee',1,100)}{field(id,'prizeMinor','Chosen triple prize',1,1000)}{field(id,'dailyEntryLimitMinor','Daily entry limit',1,1000)}</>}</div>
   {id==='dice'?<p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">Two independent six-sided dice. Chances follow the selected prediction. The displayed multiplier is rounded down to two decimals and its payout includes the stake. Target average return {(settings.dice.returnBps/100).toFixed(2)}%; this does not guarantee an individual player's return. Maximum reserve for one game at the maximum stake: {money(Math.floor(settings.dice.maxStakeMinor*Math.floor(settings.dice.returnBps*36/100)/100))}.</p>:id==='fruity'?<p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">Free entry · 3 attempts per rolling 24 hours · 4 reels with 50 independent, equally likely fruit identities. A matching four pays {money(settings.fruity.prizeMinor)}. Chance: 1 in 125,000 per attempt. Reserve per window: {money(settings.fruity.prizeMinor*3)}. Average promotional cost per window: SLE {(settings.fruity.prizeMinor*3/125000/100).toFixed(6)} before provider fees.</p>:<p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">3 attempts per purchase · All three independent 1–10 reels must match the player's preselected number. Chance: 1 in 1,000 per attempt. Reserve per purchase: {money(settings.crankling.prizeMinor*3)}. Expected payout: {money(settings.crankling.prizeMinor*3/1000)}. Expected margin before provider fees: {money(settings.crankling.entryMinor-settings.crankling.prizeMinor*3/1000)}.</p>}
  </section>)}
  {validation&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{validation}</p>}
  <p className="text-sm text-slate-600">Publishing saves a new version of all three games. Unedited games keep their current values. The four-fruit match rule, uniform reels, three-attempt limits and rolling reset remain fixed.</p>
  <button type="button" disabled={busy||!dirty||!!validation||!snapshot} onClick={()=>void run(true)} className="rounded-xl bg-purple-700 px-6 py-4 font-bold text-white disabled:opacity-50">{busy?'Saving…':'Publish future-game settings'}</button>
  <p className="text-xs text-slate-500">Current published version: {snapshot?.id}</p></div>}
 </AdminLayout>;
}

type ArcadeReport={view:string;game:string;page:number;pageSize:number;total:number;rows:any[];asOf:string};
export function ArcadeReports({game,tab,player}:{game:Exclude<GameChoice,'spin'>;tab:Exclude<GameTab,'settings'|'recovery'>;player:string}){
 const [page,setPage]=useState(1),[data,setData]=useState<ArcadeReport|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const sequence=useRef(0),inFlight=useRef(false);const view=tab==='overview'?'rounds':tab;
 const load=useCallback(async()=>{const n=++sequence.current;inFlight.current=true;setBusy(true);setError('');try{
  const r=await supabase.rpc('matmove_arcade_admin_report',{p_view:view,p_game:game,p_page:page,p_player:player||null});if(r.error)throw new Error(r.error.message);
  if(!r.data||!Array.isArray(r.data.rows)||r.data.view!==view||r.data.game!==game||r.data.page!==page)throw new Error('The report response does not match this view.');
  if(n===sequence.current)setData(r.data);
 }catch(e){if(n===sequence.current)setError(e instanceof Error?e.message:'Report unavailable.');}finally{if(n===sequence.current){setBusy(false);inFlight.current=false;}}},[view,game,page,player]);
 useEffect(()=>{setData(null);void load();const timer=setInterval(()=>{if(!document.hidden&&!inFlight.current)void load();},15000);return()=>{sequence.current++;clearInterval(timer);inFlight.current=false;};},[load]);
 const href=(t:string,id?:string)=>`/games?${new URLSearchParams({game,tab:t,...(id?{player:id}:{})})}`;
 return <div className="space-y-4 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">{tab==='overview'?'Recorded rounds and outcomes':tab==='players'?'Registered game players':tab==='entries'?'Entry payments — Customer → Spin':'Winning payments — Spin → Customer'}</h3><button disabled={busy} onClick={()=>void load()} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50">Refresh arcade report</button></div>
  <p className="text-sm text-slate-600">{game==='all'?'This table covers RICH DICE, Fruity Flue and CRANKLING. MatMove Spin is shown separately above.':'This table covers the selected game only.'} These are recorded participants and receipts, not a claim that users are currently online. Free Fruity Flue starts do not create an entry-payment receipt.</p>
  {player&&<p className="break-all rounded-xl bg-purple-50 p-3 text-sm">Selected customer: {player} · <Link to={href(tab)} className="font-bold text-purple-700">Show all customers</Link></p>}
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}{data?' Displaying the last successful report.':''}</p>}
  {!data?<p role="status">{busy?'Loading report…':'Report unavailable.'}</p>:<><p className="text-xs text-slate-500">{data.total} matching records · Refreshed {stamp(data.asOf)} · Up to {data.pageSize} per page</p>{!data.rows.length?<p className="py-5 text-slate-500">No recorded activity for this filter.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Customer</th><th>Game / activity</th><th>{tab==='players'?'Confirmed entries':tab==='overview'?'Entry amount':'Amount'}</th><th>{tab==='players'?'Confirmed winnings':'State'}</th><th>Details / history</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id||row.user_id} className="border-t align-top"><td className="p-3"><Link to={href('players',row.user_id)} className="font-bold text-purple-700">{row.customer_name||row.customer_email||'Customer'}</Link><p className="mt-1 text-xs text-slate-500">{row.customer_email}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{row.user_id}</p></td><td className="py-3">{tab==='players'?<><b>{row.rounds} recorded rounds</b><p className="mt-1 text-xs">Last play: {stamp(row.last_play_at)}</p></>:<><b>{gameChoices.find(([id])=>id===row.game)?.[1]||row.game}</b><p className="mt-1 text-xs">{stamp(row.created_at)}</p></>}</td><td className="py-3 font-bold">{money(Number(tab==='players'?row.entries_received_minor:tab==='overview'?row.entry_minor:row.amount_minor))}{tab==='overview'&&Number(row.entry_minor)===0&&<p className="text-xs font-normal">Free entry</p>}</td><td className="py-3">{tab==='players'?money(Number(row.wins_paid_minor)):<StatusTag value={row.state||row.status}/>}</td><td className="max-w-xs space-y-2 py-3"><Link to={href('entries',row.user_id)} className="mr-3 inline-block font-bold text-emerald-700">Entries</Link><Link to={href('winnings',row.user_id)} className="inline-block font-bold text-purple-700">Winnings</Link>{tab!=='players'&&<details><summary className="cursor-pointer font-bold">Show recorded details</summary><div className="mt-2 space-y-2 break-all text-xs"><p>Game ID: {row.round_id||row.id}</p>{tab==='overview'?<><p>Attempts purchased: {row.attempt_count}</p>{row.expires_at&&<p>Free window reset: {stamp(row.expires_at)}</p>}{(row.outcomes||[]).map((o:any)=><p key={o.attempt_index}>Attempt {o.attempt_index}: {Array.isArray(o.reel_values)?o.reel_values.join(' · '):'Not recorded'} · Drawn prize {money(Number(o.prize_minor))}. See Winnings for payment confirmation.</p>)}</>:<><p>Direction: {tab==='entries'?'Customer → Spin':'Spin → Customer'}</p><p>Attempt: {row.attempt_index===0?'Entry':row.attempt_index}</p><p>Provider receipt: {row.provider_id||'Not confirmed'}</p><p>Source: {row.source_account}</p><p>Destination: {row.destination_account}</p><p>Original request key: {row.request_key}</p><p>{row.status==='completed'?'Provider payment confirmed.':'Payment is not confirmed completed.'}</p></>}{row.error&&<p className="text-red-700">{row.error}</p>}</div></details>}</td></tr>)}</tbody></table></div>}
  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><p>Page {page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</p><div className="flex gap-2"><button disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Previous arcade page</button><button disabled={busy||page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Next arcade page</button></div></div></>}
 </div>;
}

export function ArcadeRecovery({game}:{game:ArcadeGame}){
 const [id,setId]=useState(''),[index,setIndex]=useState(game==='fruity'?1:0),[provider,setProvider]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const mutex=useRef(false);
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())&&/^trn-[A-Za-z0-9_-]+$/.test(provider.trim())&&Number.isInteger(index)&&index>=0&&index<=(game==='dice'?1:3);
 async function attach(){if(mutex.current||!valid)return;mutex.current=true;setBusy(true);setError('');setNotice('');try{const r=await supabase.rpc('matmove_arcade_admin_receipt',{p_id:id.trim(),p_index:index,p_provider:provider.trim()});if(r.error)throw new Error(r.error.message);setNotice('Existing receipt attached for verification. No new transfer was sent. The Customer payment-status check or protected reconciliation verifies the exact game, amount and accounts before confirming it.');}catch(e){setError(e instanceof Error?e.message:'Receipt could not be attached.');}finally{mutex.current=false;setBusy(false);}}
 return <section className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">{gameChoices.find(([key])=>key===game)?.[1]} — attach an existing receipt</h2><p>Locate the original Monime transfer using the request key. This operation attaches its existing transfer ID; it never resends funds or invents a receipt. Use the exact game ID and attempt from the recorded payment.</p>{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}<div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold">Game UUID<input value={id} disabled={busy} onChange={e=>setId(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label><label className="text-sm font-bold">Payment<select value={index} disabled={busy} onChange={e=>setIndex(Number(e.target.value))} className="mt-2 w-full rounded-xl border p-3">{game!=='fruity'&&<option value={0}>Entry payment</option>}{Array.from({length:game==='dice'?1:3},(_,i)=><option key={i} value={i+1}>Attempt {i+1} prize</option>)}</select></label><label className="text-sm font-bold">Existing transfer ID<input value={provider} disabled={busy} onChange={e=>setProvider(e.target.value)} placeholder="trn-..." className="mt-2 w-full rounded-xl border p-3"/></label></div><button type="button" disabled={busy||!valid||(game==='fruity'&&index===0)} onClick={()=>void attach()} className="rounded-xl bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50">Attach existing arcade receipt</button>{game==='fruity'&&<p className="text-sm text-slate-600">Fruity Flue is free. It has prize receipts only; choose the attempt that won.</p>}</section>;
}
