

export const SECTION_GROUPS=[
 {label:'Operations',items:[['dashboard','Overview','/dashboard'],['dispatch','Dispatch Radar','/dispatch'],['pricing','Vehicle Pricing','/pricing']]},
 {label:'Compliance',items:[['kyc','KYC & Onboarding','/kyc'],['customers','Customer Governance','/customers']]},
 {label:'Finance',items:[['financials','Financial & Wallets','/financials'],['transactions','Gateway Transactions','/transactions'],['payouts','Payouts & Withdrawals','/payouts']]},
 {label:'Games',items:[['games.overview','Games overview & outcomes','/games?tab=overview'],['games.players','Game players','/games?tab=players'],['games.entries','Entry payments','/games?tab=entries'],['games.winnings','Winnings','/games?tab=winnings'],['games.settings','Edit game fees & prizes','/games?tab=settings'],['games.recovery','Attach existing game receipts','/games?tab=recovery']]},
 {label:'Governance',items:[['staff','Staff directory','/staff'],['logs','System & Audit Logs','/logs']]},
];
export const PERMISSION_KEYS=SECTION_GROUPS.flatMap(g=>g.items.map(i=>i[0]));
export function validPermissions(value){if(!Array.isArray(value)||value.length>PERMISSION_KEYS.length||value.some(p=>typeof p!=='string'||!PERMISSION_KEYS.includes(p)))throw new Error('Select valid section assignments.');return [...new Set(value)];}
export function canAdminAccess(a,key){if(!a||a.is_active!==true)return false;if(a.is_owner===true)return true;const p=Array.isArray(a.permissions)?a.permissions:[];if(key==='games')return p.includes('games')||p.some(x=>typeof x==='string'&&x.startsWith('games.'));return p.includes(key)||(key.startsWith('games.')&&p.includes('games'));}
export function homeFor(a){return SECTION_GROUPS.flatMap(g=>g.items).find(([key])=>canAdminAccess(a,key))?.[2]||'/access-denied';}
