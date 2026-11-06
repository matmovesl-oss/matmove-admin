import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

async function importer(){
 const dir=await mkdtemp(join(process.cwd(),'.payroll-import-'));
 try{
  const out=join(dir,'payroll-import.mjs');
  await build({entryPoints:['src/lib/payrollCsv.ts'],outfile:out,bundle:true,platform:'node',format:'esm'});
  return await import(pathToFileURL(out));
 } finally { await rm(dir,{recursive:true,force:true}); }
}

test('payroll CSV maps each employee to a different exact SLE salary by email and phone',async()=>{
 const {matchPayrollCsv}=await importer();
 const recipients=[
  {id:'one',full_name:'Mary Sesay',email:'mary@example.com',phone:'+23276000001'},
  {id:'two',full_name:'John Bangura',email:'john@example.com',phone:'+23277000002'}
 ];
 const result=matchPayrollCsv(
  'Email,Full Name,Monthly Salary\nMARY@example.com,"Mary Sesay",2000.50\n,John Bangura,1750',
  recipients
 );
 assert.deepEqual(result,{one:'2000.50',two:'1750'});
});

test('CSV supports quoted commas and escaped quotes in names',async()=>{
 const {parsePayrollCsv}=await importer();
 assert.deepEqual(parsePayrollCsv('Email,Full Name,Salary\na@example.com,"Sesay, Mary",1000\nb@example.com,"John ""J"" Bangura",900'),[
  ['Email','Full Name','Salary'],
  ['a@example.com','Sesay, Mary','1000'],
  ['b@example.com','John "J" Bangura','900']
 ]);
});

test('CSV rejects missing required columns, duplicate people and ambiguous names',async()=>{
 const {matchPayrollCsv}=await importer();
 const people=[
  {id:'one',full_name:'Same Name',email:'one@example.com',phone:'760000001'},
  {id:'two',full_name:'Same Name',email:'two@example.com',phone:'760000002'}
 ];
 assert.throws(()=>matchPayrollCsv('Name,Amount\nSame Name,100',people),/uniquely/);
 assert.throws(()=>matchPayrollCsv('Email,Amount\none@example.com,100\none@example.com,200',people),/duplicate/);
 assert.throws(()=>matchPayrollCsv('Name\nMary',people),/Required columns/);
});

test('CSV rejects invalid SLE amounts and input above 500 employees',async()=>{
 const {matchPayrollCsv}=await importer();
 const people=[{id:'one',email:'one@example.com'}];
 assert.throws(()=>matchPayrollCsv('Email,Amount\none@example.com,1.001',people),/up to two decimal/);
 const headers='Email,Amount';
 const lines=Array.from({length:501},(_,i)=>'one@example.com,1').join('\n');
 assert.throws(()=>matchPayrollCsv(headers+'\n'+lines,people),/at most 500/);
});
