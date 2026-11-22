import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Admin support keeps the inbox and adds a separate Socials & WhatsApp tab',async()=>{
 const page=await readFile(new URL('../src/pages/CustomerSupportPage.tsx',import.meta.url),'utf8');
 assert.match(page,/CustomerSupportPage/);
 assert.match(page,/activeTab==='links'\?<AdminSupportLinksManager\/>/);
 assert.match(page,/Support inbox/);
 assert.match(page,/Socials & WhatsApp/);
 assert.match(page,/canAccess\(access,'support'\)/);
});

test('Admin social manager uses the support-scoped Supabase RPC and optimistic versions',async()=>{
 const page=await readFile(new URL('../src/components/AdminSupportLinksManager.tsx',import.meta.url),'utf8');
 assert.match(page,/matmove_admin_public_contacts/);
 assert.match(page,/p_actor:actor/);
 assert.match(page,/p_action:'save'/);
 assert.match(page,/p_expected:draft\.version/);
 assert.match(page,/p_action:'delete'/);
 assert.match(page,/p_action:'list'/);
 assert.match(page,/Change WhatsApp number/);
 assert.match(page,/Social media profiles/);
 assert.match(page,/Publish to customer app/);
});

test('Admin contact UI requires HTTPS social URLs and international WhatsApp numbers',async()=>{
 const page=await readFile(new URL('../src/components/AdminSupportLinksManager.tsx',import.meta.url),'utf8');
 assert.match(page,/parsed\.protocol!=='https:'/);
 assert.match(page,/digits\.length<8\|\|digits\.length>15/);
 assert.match(page,/digits\.startsWith\('0'\)/);
 assert.match(page,/iconOptions/);
 assert.match(page,/Social link permanently removed from MatMove/);
});

test('Admin support UI never exposes a delete action for WhatsApp support',async()=>{
 const page=await readFile(new URL('../src/components/AdminSupportLinksManager.tsx',import.meta.url),'utf8');
 assert.match(page,/item\.kind==='whatsapp'\)return/);
});
