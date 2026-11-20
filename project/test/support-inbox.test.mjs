import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PERMISSION_KEYS,SECTION_GROUPS,validPermissions,canAdminAccess} from '../shared/admin-permissions.js';

const supportSql=()=>readFile(new URL('../supabase/migrations/20261120123000_matmove_support_inbox_conversations_v1.sql',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const staff='22222222-2222-4222-8222-222222222222';
const customer='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondKey='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function database(){
 const db=new PGlite();
 await db.exec([
  'create role anon;',
  'create role authenticated;',
  'create schema auth;',
  'grant usage on schema auth,public to anon,authenticated;',
  "create table auth.users(id uuid primary key,email text,phone text);",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  'create table public.profiles(id uuid primary key,role text,full_name text,first_name text,last_name text,email text,phone text);',
  'create table public.matmove_staff_access(id uuid primary key,is_owner boolean not null,is_active boolean not null,permissions jsonb not null,removed_at timestamptz);'
 ].join('\n'));
 await db.query('insert into auth.users values($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12)',[
  owner,'owner@matmove.space',null,staff,'support@matmove.space',null,customer,'rider@matmove.space','+23200000001',other,'other@matmove.space','+23200000002'
 ]);
 await db.query('insert into public.profiles values($1,$2,$3,null,null,$4,$5),($6,$7,$8,null,null,$9,$10),($11,$12,$13,$14,$15,$16,$17),($18,$19,$20,$21,$22,$23,$24)',[
  owner,'admin','MatMove Owner','owner@matmove.space',null,staff,'admin','Support Staff','support@matmove.space',null,
  customer,'rider','Customer One','Customer','One','rider@matmove.space','+23200000001',
  other,'rider','Customer Two','Customer','Two','other@matmove.space','+23200000002'
 ]);
 await db.query('insert into public.matmove_staff_access values($1,true,true,$2::jsonb,null),($3,false,true,$4::jsonb,null)',[owner,'[]',staff,'[]']);
 await db.exec([
  'create function public.matmove_notification_customer(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(select 1 from public.profiles p where p.id=p_id and p.role in (\'rider\',\'driver\',\'merchant\')) $$;',
  "create function public.matmove_admin_can(p_section text) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(select 1 from public.matmove_staff_access a where a.id=auth.uid() and a.is_active and a.removed_at is null and (a.is_owner or a.permissions ? p_section)) $$;"
 ].join('\n'));
 let migration=await supportSql();
 migration=migration.replace(/notify pgrst,'reload schema';/gi,'');
 await db.exec(migration);
 return db;
}
async function as(db,id,role='authenticated'){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 await db.exec('set role '+role);
}

test('Support requests are private, durable, idempotent and two-way; staff access is separately assigned',async()=>{
 const db=await database();
 try{
  await as(db,customer);
  const first=(await db.query('select public.matmove_support_customer_open($1,$2,$3,$4) data',[key,'Wallet balance not updating','wallet','My wallet balance is not refreshing.'])).rows[0].data;
  assert.equal(first.conversation.ticket_number,'1');
  assert.equal(first.message.sender_type,'customer');
  const retry=(await db.query('select public.matmove_support_customer_open($1,$2,$3,$4) data',[key,'Wallet balance not updating','wallet','My wallet balance is not refreshing.'])).rows[0].data;
  assert.equal(retry.conversation.id,first.conversation.id);
  await assert.rejects(()=>db.query('select public.matmove_support_customer_open($1,$2,$3,$4)',[key,'Different subject','wallet','Different body']),/CONFLICT/);

  const list=(await db.query('select public.matmove_support_customer_list() data')).rows[0].data;
  assert.equal(list.user_id,customer);assert.equal(list.items.length,1);

  const ownRows=await db.query('select count(*)::int n from public.matmove_support_conversations');
  assert.equal(ownRows.rows[0].n,1);
  await assert.rejects(()=>db.exec('insert into public.matmove_support_conversations(customer_id,request_key,subject,category) values (\\''+other+'\\',\\''+secondKey+'\\',\\'No access\\',\\'other\\')'),/permission denied/);

  await as(db,other);
  const otherCount=(await db.query('select count(*)::int n from public.matmove_support_conversations')).rows[0].n;
  assert.equal(otherCount,0);
  await assert.rejects(()=>db.query('select public.matmove_support_customer_messages($1)',[first.conversation.id]),/NOT_FOUND/);

  await as(db,staff);
  await assert.rejects(()=>db.query("select public.matmove_support_admin_list('all')"),/assignment required/);
  await db.exec('reset role');
  await db.query("update public.matmove_staff_access set permissions='[\"support\"]'::jsonb where id=$1",[staff]);
  await as(db,staff);
  const inbox=(await db.query("select public.matmove_support_admin_list('all') data")).rows[0].data;
  assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].customer_email,'rider@matmove.space');
  assert.equal(inbox.items[0].customer_name,'Customer One');assert.equal(inbox.items[0].unread_count,1);

  const messages=(await db.query('select public.matmove_support_admin_messages($1) data',[first.conversation.id])).rows[0].data;
  assert.equal(messages.messages.length,1);
  assert.equal(messages.messages[0].body,'My wallet balance is not refreshing.');
  const afterRead=(await db.query("select public.matmove_support_admin_list('all') data")).rows[0].data;
  assert.equal(afterRead.items[0].unread_count,0);

  const reply=(await db.query('select public.matmove_support_admin_reply($1,$2,$3,$4) data',[first.conversation.id,secondKey,'Thanks. We are checking your wallet refresh issue.','waiting_customer'])).rows[0].data;
  assert.equal(reply.status,'waiting_customer');
  const duplicate=(await db.query('select public.matmove_support_admin_reply($1,$2,$3,$4) data',[first.conversation.id,secondKey,'Thanks. We are checking your wallet refresh issue.','waiting_customer'])).rows[0].data;
  assert.equal(duplicate.id,reply.id);

  await as(db,customer);
  const unread=(await db.query('select public.matmove_support_customer_list() data')).rows[0].data;
  assert.equal(unread.items[0].unread_count,1);
  const thread=(await db.query('select public.matmove_support_customer_messages($1) data',[first.conversation.id])).rows[0].data;
  assert.equal(thread.messages.length,2);assert.equal(thread.messages[1].sender_type,'admin');
  assert.equal(thread.messages[1].body,'Thanks. We are checking your wallet refresh issue.');
  const sent=(await db.query('select public.matmove_support_customer_message($1,$2,$3) data',[first.conversation.id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','Thank you for the update.'])).rows[0].data;
  assert.equal(sent.conversation_id,first.conversation.id);
  const reopened=(await db.query('select public.matmove_support_customer_list() data')).rows[0].data;
  assert.equal(reopened.items[0].status,'open');

  await as(db,staff);
  const resolved=(await db.query('select public.matmove_support_admin_status($1,$2) data',[first.conversation.id,'resolved'])).rows[0].data;
  assert.equal(resolved.status,'resolved');

  await db.exec('reset role');
  assert.equal((await db.query("select public.matmove_staff_permissions_valid('[\"support\"]'::jsonb) ok")).rows[0].ok,true);
  assert.equal((await db.query("select public.matmove_staff_permissions_valid('[\"super_admin\"]'::jsonb) ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','public.matmove_support_messages','INSERT') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_table_privilege('anon','public.matmove_support_conversations','SELECT') ok")).rows[0].ok,false);
 }finally{await db.close();}
});

test('Support inbox is a dedicated assignment, route and realtime badge; Admin scroll restoration waits for layout',async()=>{
 const [permissions,app,page,layout,migration]=await Promise.all([
  readFile(new URL('../shared/admin-permissions.js',import.meta.url),'utf8'),
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/pages/SupportInboxPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/components/AdminLayout.tsx',import.meta.url),'utf8'),
  supportSql()
 ]);
 assert.ok(PERMISSION_KEYS.includes('support'));assert.ok(validPermissions(['support']).includes('support'));
 assert.ok(SECTION_GROUPS.some(g=>g.items.some(i=>i[0]==='support')));
 assert.equal(canAdminAccess({id:staff,is_active:true,is_owner:false,permissions:['support']},'support'),true);
 assert.equal(canAdminAccess({id:staff,is_active:true,is_owner:false,permissions:['notifications']},'support'),false);
 assert.match(permissions,/\['support', 'Customer Support Inbox', '\/support'\]/);
 assert.match(app,/path="\/support" element=\{<Gate access=\{access\} section="support"/);
 for(const rpc of ['matmove_support_admin_list','matmove_support_admin_messages','matmove_support_admin_reply','matmove_support_admin_status'])assert.ok(page.includes(rpc));
 assert.match(page,/Customer Support/);assert.match(page,/Wait for customer/);
 assert.match(layout,/onClickCapture=\{persistSidebarScroll\}/);
 assert.match(layout,/new ResizeObserver\(restore\)/);assert.match(layout,/new MutationObserver\(restore\)/);
 assert.doesNotMatch(layout,/<main[^>]*scroll-smooth/);
 assert.match(layout,/matmove_support_admin_list/);assert.match(layout,/supportUnreadCount/);
 assert.match(migration,/alter table public\.matmove_support_conversations enable row level security/);
 assert.match(migration,/alter table public\.matmove_support_messages enable row level security/);
 assert.match(migration,/Customer Support assignment required/);
});
