
// Test-only PostgreSQL fixture. Never imported by the application or API.
import {PGlite} from '@electric-sql/pglite';
import {after} from 'node:test';
let database;
let leased=false;
let sequence=0;

// A single database instance avoids repeatedly allocating and compiling the
// PostgreSQL WebAssembly engine. Rollback gives every test a fresh schema.
after(async()=>{if(database){await database.close();database=undefined;}});
function migrationBody(sql){
 // Only remove standalone outer transaction commands. PL/pgSQL BEGIN blocks
 // have no semicolon after BEGIN and are retained without modification.
 return sql.replace(/^[\t ]*(?:begin|commit);[\t ]*\r?$/gim,'');
}
export async function createSmallTestDatabase(){
 if(leased)throw new Error('Database fixtures must run sequentially.');
 leased=true;
 try{
  if(!database){
   database=new PGlite({postgresqlconf:[
    'shared_buffers=16MB',
    'max_connections=10',
    'work_mem=1MB',
    'maintenance_work_mem=8MB'
   ]});
   await database.waitReady;
  }
  await database.exec('begin');
 }catch(error){leased=false;throw error;}
 let closed=false;
 async function run(action){
  if(closed)throw new Error('This database fixture has already been released.');
  const name='matmove_test_'+(++sequence);
  await database.exec('savepoint '+name);
  try{
   const result=await action();await database.exec('release savepoint '+name);return result;
  }catch(error){
   // Expected permission/validation failures must not poison the rest of a test.
   await database.exec('rollback to savepoint '+name);
   await database.exec('release savepoint '+name);
   throw error;
  }
 }
 return {
  exec:(sql,...args)=>run(()=>database.exec(migrationBody(sql),...args)),
  query:(...args)=>run(()=>database.query(...args)),
  close:async()=>{
   if(closed)return;closed=true;
   try{await database.exec('rollback');}finally{leased=false;}
  }
 };
}
